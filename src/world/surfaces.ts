import * as THREE from "three";
import { mulberry32 } from "../paper/textures";

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const finish = (map: HTMLCanvasElement, bump: HTMLCanvasElement) => {
  const m = new THREE.CanvasTexture(map);
  m.colorSpace = THREE.SRGBColorSpace;
  m.wrapS = m.wrapT = THREE.RepeatWrapping;
  m.anisotropy = 8;
  const b = new THREE.CanvasTexture(bump);
  b.wrapS = b.wrapT = THREE.RepeatWrapping;
  b.colorSpace = THREE.NoColorSpace;
  return { map: m, bump: b };
};

/** value noise field helper (tileable) */
const noiseField = (w: number, h: number, cells: number, seed: number) => {
  const r = mulberry32(seed);
  const cw = cells;
  const chh = Math.max(1, Math.round((cells * h) / w));
  const g = new Float32Array(cw * chh).map(() => r());
  return (x: number, y: number) => {
    const fx = (x / w) * cw;
    const fy = (y / h) * chh;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (i: number, j: number) => g[(((j % chh) + chh) % chh) * cw + (((i % cw) + cw) % cw)];
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
};

/** Dark matte walnut: flowing grain lines along U, plank seams, pores. */
export function woodTexture() {
  const W = 2048;
  const H = 1024;
  const map = canvas(W, H);
  const bump = canvas(W, H);
  const mctx = map.getContext("2d")!;
  const bctx = bump.getContext("2d")!;
  const img = mctx.createImageData(W, H);
  const bimg = bctx.createImageData(W, H);
  const n1 = noiseField(W, H, 6, 1);
  const n2 = noiseField(W, H, 48, 2);
  const n3 = noiseField(W, H, 400, 3);
  const plank = H / 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const pi = Math.floor(y / plank);
      const warp = n1(x + pi * 300, y) * 140 + n2(x, y + pi * 50) * 14;
      const ring = Math.sin((y + warp) * 0.055 + pi * 2.1);
      const ring2 = Math.sin((y + warp * 0.7) * 0.13 + n1(x * 0.5, y) * 4);
      let v = 0.52 + 0.14 * ring + 0.06 * ring2 + 0.1 * (n2(x, y * 3) - 0.5) + 0.06 * (n3(x, y) - 0.5);
      const pore = n3(x * 0.25, y * 2.2) < 0.12 ? -0.1 : 0;
      v += pore;
      const seam = Math.abs((y % plank) - 0) < 2 || Math.abs((y % plank) - plank) < 2 ? -0.35 : 0;
      v = Math.max(0, Math.min(1, v + seam));
      const o = (y * W + x) * 4;
      // walnut tones
      img.data[o] = 58 + 80 * v;
      img.data[o + 1] = 34 + 50 * v;
      img.data[o + 2] = 24 + 32 * v;
      img.data[o + 3] = 255;
      const bv = 120 + 90 * (v - 0.5) + (seam ? -60 : 0);
      bimg.data[o] = bimg.data[o + 1] = bimg.data[o + 2] = bv;
      bimg.data[o + 3] = 255;
    }
  }
  mctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  return finish(map, bump);
}

/** Dark poured concrete with aggregate speckle and saw-cut joints. */
export function concreteTexture() {
  const S = 1024;
  const map = canvas(S, S);
  const bump = canvas(S, S);
  const mctx = map.getContext("2d")!;
  const bctx = bump.getContext("2d")!;
  const img = mctx.createImageData(S, S);
  const bimg = bctx.createImageData(S, S);
  const a = noiseField(S, S, 5, 11);
  const b = noiseField(S, S, 40, 12);
  const c = noiseField(S, S, 300, 13);
  const r = mulberry32(14);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0.42 + 0.16 * (a(x, y) - 0.5) + 0.12 * (b(x, y) - 0.5) + 0.1 * (c(x, y) - 0.5);
      if (r() < 0.012) v += (r() - 0.4) * 0.35;
      const joint = x % 512 < 3 || y % 512 < 3 ? -0.22 : 0;
      v = Math.max(0, Math.min(1, v + joint));
      const o = (y * S + x) * 4;
      img.data[o] = 70 * v + 18;
      img.data[o + 1] = 70 * v + 18;
      img.data[o + 2] = 74 * v + 20;
      img.data[o + 3] = 255;
      const bv = 128 + 70 * (c(x, y) - 0.5) + (joint ? -70 : 0);
      bimg.data[o] = bimg.data[o + 1] = bimg.data[o + 2] = bv;
      bimg.data[o + 3] = 255;
    }
  }
  mctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  return finish(map, bump);
}

/** Warm limestone coping blocks with fossil speckle and mortar joints. */
export function stoneTexture() {
  const S = 1024;
  const map = canvas(S, S);
  const bump = canvas(S, S);
  const mctx = map.getContext("2d")!;
  const bctx = bump.getContext("2d")!;
  const img = mctx.createImageData(S, S);
  const bimg = bctx.createImageData(S, S);
  const a = noiseField(S, S, 4, 21);
  const b = noiseField(S, S, 36, 22);
  const c = noiseField(S, S, 260, 23);
  const r = mulberry32(24);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0.62 + 0.12 * (a(x, y) - 0.5) + 0.1 * (b(x, y) - 0.5) + 0.08 * (c(x, y) - 0.5);
      if (r() < 0.02) v -= r() * 0.2;
      // fossil shells / pits
      if (r() < 0.0015) v -= 0.35;
      const joint = x % 1024 < 7 ? -0.5 : x % 1024 < 10 ? 0.12 : 0;
      v = Math.max(0, Math.min(1, v + joint));
      const o = (y * S + x) * 4;
      img.data[o] = 175 * v + 48;
      img.data[o + 1] = 160 * v + 44;
      img.data[o + 2] = 138 * v + 40;
      img.data[o + 3] = 255;
      const bv = 128 + 80 * (c(x, y) - 0.5) + 30 * (b(x, y) - 0.5) + (joint ? -80 : 0);
      bimg.data[o] = bimg.data[o + 1] = bimg.data[o + 2] = bv;
      bimg.data[o + 3] = 255;
    }
  }
  mctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  return finish(map, bump);
}
