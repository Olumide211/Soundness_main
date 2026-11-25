import * as THREE from 'three';
import {mulberry32, SEEDS} from '../../lib/rng';
import {fbm2} from '../../lib/noise';

// Patch: 2.4 x 2.4 m centred on the wall centre. Patch coords in metres, +x right, +y up.
export const PATCH = 2.4;
export const MASK = 2048;
// motif placement (centre x,y in metres, size in metres along the given axis)
export const MOTIFS = [
  {name: 'hand_stencil_spray', region: 1, cx: -0.42, cy: 0.29, h: 0.55, colour: 'rust'},
  {name: 'stick_figures_running', region: 2, cx: 0.0, cy: -0.07, w: 0.9, colour: 'rust'},
  {name: 'sun', region: 3, cx: 0.52, cy: 0.47, w: 0.35, colour: 'ochre'},
  {name: 'hello_primitive_strokes', region: 4, cx: 0.33, cy: -0.5, w: 0.7, colour: 'rust'},
] as const;
// share of the 4,000 particles (strokes 40, hand 30, runners 20, sun 10)
const SHARE: Record<number, number> = {4: 1600, 1: 1200, 2: 800, 3: 400};
export const N_PIGMENT = 4000;

export type PigmentData = {
  mask: THREE.DataTexture; // R ochre, G rust, B region id, A static wash
  times: THREE.DataTexture; // R emit (0..1 -> 100..118), G land (0..1 -> 1112..1166)
  // per particle, patch metres
  px: Float32Array; py: Float32Array; region: Uint8Array; col: Float32Array; tEmit: Float32Array; tLand: Float32Array; n: Float32Array;
};

/** emit order noise: strokes first. Pure function of (patch uv, region). */
export function emitN(u: number, v: number, region: number) {
  const w = fbm2(u * 7.0, v * 7.0, 913, 3);
  const g = Math.min(1, Math.max(0, (w - 0.25) / 0.5));
  // strokes go first: 0..0.42 ; others 0.32..1 (hand, runners, sun get a slight left->right bias)
  if (region === 4) return 0.42 * Math.min(1, Math.max(0, 0.3 * g + 0.7 * (u - 0.49) / 0.29));
  return 0.32 + 0.68 * Math.min(1, 0.6 * g + 0.4 * u);
}
export const emitTimeOf = (n: number) => 100 + 18 * n;
export const landTimeOf = (n: number) => 1112 + 54 * (1 - n);

function svgImage(text: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
  });
}

export async function buildPigment(svgs: Record<string, string>, disp: CanvasImageSource & {width: number; height: number}): Promise<PigmentData & {heightAt: (x: number, y: number) => number}> {
  // CPU copy of the rock displacement so particles sit on the relief
  const DS = 512;
  const dc = document.createElement('canvas'); dc.width = dc.height = DS;
  const dctx = dc.getContext('2d', {willReadFrequently: true})!;
  dctx.drawImage(disp, 0, 0, DS, DS);
  const dd = dctx.getImageData(0, 0, DS, DS).data;
  // wall uv: plane 6x4 m, rock repeat 4 x 2.667 ; patch metres -> wall uv
  const heightAt = (x: number, y: number) => {
    const u = ((x + 3) / 6) * (6 / 1.5), v = ((y + 2) / 4) * (4 / 1.5);
    const fu = u - Math.floor(u), fv = v - Math.floor(v);
    const ix = Math.min(DS - 1, Math.floor(fu * DS)), iy = Math.min(DS - 1, Math.floor((1 - fv) * DS));
    return dd[(iy * DS + ix) * 4] / 255;
  };
  const S = MASK;
  const toPx = (m: number) => (m / PATCH) * S;
  const data = new Uint8Array(S * S * 4);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d', {willReadFrequently: true})!;
  const regionAlpha: Record<number, Uint8ClampedArray> = {};
  const bbox: Record<number, [number, number, number, number]> = {};
  for (const m of MOTIFS) {
    const img = await svgImage(svgs[m.name]);
    const vb = svgs[m.name].match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number);
    const aspect = vb[3] / vb[2];
    const wM = 'w' in m ? m.w : m.h / aspect;
    const hM = wM * aspect;
    const x0 = toPx(m.cx - wM / 2 + PATCH / 2);
    const y0 = toPx(PATCH / 2 - (m.cy + hM / 2));
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(img, x0, y0, toPx(wM), toPx(hM));
    regionAlpha[m.region] = ctx.getImageData(0, 0, S, S).data;
    bbox[m.region] = [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(S - 1, Math.ceil(x0 + toPx(wM))), Math.min(S - 1, Math.ceil(y0 + toPx(hM)))];
  }
  // compose channels (canvas y down -> texture row 0 = bottom, flip)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const si = (y * S + x) * 4 + 3;
      const di = ((S - 1 - y) * S + x) * 4;
      let ochre = 0, rust = 0, reg = 0, best = 0;
      for (const m of MOTIFS) {
        const a = regionAlpha[m.region][si];
        if (a > 0) {
          if (m.colour === 'ochre') ochre = Math.max(ochre, a); else rust = Math.max(rust, a);
          if (a > best) { best = a; reg = m.region; }
        }
      }
      data[di] = ochre; data[di + 1] = rust; data[di + 2] = reg * 60; data[di + 3] = 0;
    }
  }
  // static ochre wash blobs (do not lift; give the patch age)
  const rw = mulberry32(SEEDS.pigment ^ 0x55);
  for (let k = 0; k < 26; k++) {
    const cx = rw() * S, cy = rw() * S, r = (0.02 + rw() * 0.07) / PATCH * S, amt = 30 + rw() * 60;
    const r2 = r * r;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(S, cy + r); y += 1)
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(S, cx + r); x += 1) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 < r2) { const i = (y * S + x) * 4 + 3; data[i] = Math.max(data[i], amt * (1 - d2 / r2)); }
      }
  }
  const mask = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  mask.generateMipmaps = true; mask.minFilter = THREE.LinearMipmapLinearFilter; mask.magFilter = THREE.LinearFilter;
  mask.anisotropy = 8; mask.needsUpdate = true;

  // sample particles
  const rng = mulberry32(SEEDS.pigment);
  const px = new Float32Array(N_PIGMENT), py = new Float32Array(N_PIGMENT), n = new Float32Array(N_PIGMENT);
  const region = new Uint8Array(N_PIGMENT), col = new Float32Array(N_PIGMENT * 3);
  const tEmit = new Float32Array(N_PIGMENT), tLand = new Float32Array(N_PIGMENT);
  const ochreC = new THREE.Color('#E0A458'), rustC = new THREE.Color('#B5652B');
  let i = 0;
  for (const reg of [4, 1, 2, 3]) {
    const [bx0, by0, bx1, by1] = bbox[reg];
    const A = regionAlpha[reg];
    let need = SHARE[reg], guard = 0;
    while (need > 0 && guard++ < 2_000_000) {
      const x = Math.floor(bx0 + rng() * (bx1 - bx0)), y = Math.floor(by0 + rng() * (by1 - by0));
      const a = A[(y * S + x) * 4 + 3] / 255;
      if (a > 0.25 && rng() < a) {
        const u = (x + 0.5) / S, v = 1 - (y + 0.5) / S;
        px[i] = u * PATCH - PATCH / 2; py[i] = v * PATCH - PATCH / 2;
        region[i] = reg;
        n[i] = emitN(u, v, reg);
        tEmit[i] = emitTimeOf(n[i]); tLand[i] = landTimeOf(n[i]);
        const c = (reg === 3 ? ochreC : rustC).clone().lerp(reg === 3 ? rustC : ochreC, rng() * 0.35);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        i++; need--;
      }
    }
  }
  // per-texel emit / land times (512^2), same function as the particles
  const TS = 512;
  const td = new Uint8Array(TS * TS * 4);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const u = (x + 0.5) / TS, v = (y + 0.5) / TS;
    const mx = Math.min(S - 1, Math.floor(u * S)), my = Math.min(S - 1, Math.floor(v * S));
    const reg = Math.round(data[(my * S + mx) * 4 + 2] / 60) || 2;
    const nn = emitN(u, v, reg);
    const o = (y * TS + x) * 4;
    td[o] = Math.round(nn * 255); td[o + 1] = Math.round((1 - nn) * 255); td[o + 2] = 0; td[o + 3] = 255;
  }
  const times = new THREE.DataTexture(td, TS, TS, THREE.RGBAFormat);
  times.magFilter = THREE.NearestFilter; times.minFilter = THREE.NearestFilter; times.needsUpdate = true;
  return {mask, times, px, py, region, col, tEmit, tLand, n, heightAt};
}
