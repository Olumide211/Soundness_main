import {hash} from './rng';
const TAU = Math.PI * 2;
export const LOOP = 1200;

/** §8.1 exactly periodic over 1200 frames */
export function flicker(f: number): number {
  return (
    1 +
    0.1 * Math.sin((TAU * 37 * f) / LOOP + 0.3) +
    0.06 * Math.sin((TAU * 53 * f) / LOOP + 1.7) +
    0.04 * Math.sin((TAU * 89 * f) / LOOP + 4.1) +
    0.03 * Math.sin((TAU * 131 * f) / LOOP + 2.2) +
    0.02 * Math.sin((TAU * 197 * f) / LOOP + 5.9)
  );
}
/** same structure, different phases; returns roughly [-1,1] */
export function flickerVariant(f: number, phase: number): number {
  return (
    (0.1 * Math.sin((TAU * 37 * f) / LOOP + 0.3 + phase * 1.3) +
      0.06 * Math.sin((TAU * 53 * f) / LOOP + 1.7 + phase * 2.1) +
      0.04 * Math.sin((TAU * 89 * f) / LOOP + 4.1 + phase * 0.7) +
      0.03 * Math.sin((TAU * 131 * f) / LOOP + 2.2 + phase * 3.3) +
      0.02 * Math.sin((TAU * 197 * f) / LOOP + 5.9 + phase * 1.9)) /
    0.25
  );
}
/** periodic smooth noise of frame: integer cycles over the loop -> loops exactly. ~[-1,1] */
export function pnoise(f: number, seed: number, baseCycles = 3): number {
  let s = 0;
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const cyc = baseCycles * (k + 1) + Math.floor(hash(k, seed) * 3);
    const ph = hash(k + 17, seed) * TAU;
    const amp = 1 / (k + 1);
    s += amp * Math.sin((TAU * cyc * f) / LOOP + ph);
    n += amp;
  }
  return s / n;
}
/** analytic divergence-free-ish drift: sum of 3 rotated sin fields, pure fn of (seed,t) */
export function curlDrift(seed: number, t: number, out: [number, number, number]) {
  let x = 0, y = 0, z = 0;
  for (let k = 0; k < 3; k++) {
    const a = hash(k * 3 + 1, seed) * TAU;
    const b = hash(k * 3 + 2, seed) * TAU;
    const fr = 0.8 + 1.7 * hash(k * 3 + 3, seed) + k;
    const s = Math.sin(fr * t + a);
    const c = Math.cos(fr * t * 0.83 + b);
    // rotate the 2D swirl into a different plane per k
    if (k === 0) { x += s; y += c; }
    else if (k === 1) { y += s * 0.7; z += c * 0.7; }
    else { z += s * 0.5; x += c * 0.5; }
  }
  out[0] = x / 2.2; out[1] = y / 2.2; out[2] = z / 2.2;
  return out;
}
/** 2D value noise (pure) */
function vn(ix: number, iy: number, seed: number) {
  return hash(ix * 374761 + iy * 668265, seed);
}
export function valueNoise2(x: number, y: number, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = vn(ix, iy, seed), b = vn(ix + 1, iy, seed), c = vn(ix, iy + 1, seed), d = vn(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm2(x: number, y: number, seed = 0, oct = 4) {
  let s = 0, amp = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * valueNoise2(x, y, seed + i * 31);
    n += amp; x *= 2.03; y *= 2.03; amp *= 0.5;
  }
  return s / n;
}
