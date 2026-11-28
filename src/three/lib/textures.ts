import * as THREE from 'three';
import { noise3, rnd } from './rng';

/** periodic value noise on a P x P lattice (tileable) */
function pnoise(x: number, y: number, P: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (i: number, j: number) => rnd((((i % P) + P) % P) * 131 + (((j % P) + P) % P) * 7919 + seed * 104729);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Matte concrete: albedo + bump (deterministic). */
export function makeConcrete(size = 512) {
  const ca = canvas(size), cb = canvas(size);
  const xa = ca.getContext('2d')!, xb = cb.getContext('2d')!;
  const ia = xa.createImageData(size, size), ib = xb.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let n = 0, amp = 0.5, P = 6;
      for (let o = 0; o < 6; o++) {
        n += amp * pnoise(u * P, v * P, P, o + 1);
        amp *= 0.55; P *= 2;
      }
      const big = pnoise(u * 3, v * 3, 3, 17);
      const grain = rnd(x * 7919 + y * 104729) - 0.5;
      const pit = rnd(x * 31 + y * 7717) > 0.9965 ? -0.5 : 0;
      const lum = 0.5 + 0.11 * n + 0.07 * big + 0.05 * grain + pit * 0.35;
      const i = (y * size + x) * 4;
      const c = Math.max(0, Math.min(255, lum * 255));
      ia.data[i] = c * 1.0; ia.data[i + 1] = c * 0.995; ia.data[i + 2] = c * 0.985; ia.data[i + 3] = 255;
      const h = Math.max(0, Math.min(255, (0.5 + 0.3 * n + 0.2 * grain + pit) * 255));
      ib.data[i] = ib.data[i + 1] = ib.data[i + 2] = h; ib.data[i + 3] = 255;
    }
  }
  xa.putImageData(ia, 0, 0); xb.putImageData(ib, 0, 0);
  const map = new THREE.CanvasTexture(ca);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(cb);
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, bump };
}

/** Brushed-metal roughness streaks. */
export function makeBrushed(size = 256) {
  const c = canvas(size);
  const x = c.getContext('2d')!;
  const im = x.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    const row = rnd(j * 977 + 5) * 0.6 + rnd(Math.floor(j / 3) * 31 + 2) * 0.4;
    for (let i = 0; i < size; i++) {
      const k = (j * size + i) * 4;
      const v = 0.55 + 0.35 * (row - 0.5) + 0.12 * noise3(i * 0.02, j * 0.6, 3.3);
      const c8 = Math.max(0, Math.min(255, v * 255));
      im.data[k] = im.data[k + 1] = im.data[k + 2] = c8; im.data[k + 3] = 255;
    }
  }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
