// Deterministic randomness: everything derives from mulberry32(2026). No Math.random anywhere.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const master = mulberry32(2026);
const N = 1 << 16;
const MASK = N - 1;
export const TABLE = new Float32Array(N);
for (let i = 0; i < N; i++) TABLE[i] = master();

/** Random value in [0,1) for an integer key (stable, order independent). */
export const rnd = (i: number) => TABLE[(((i | 0) % N) + N) & MASK];
/** Random in [a,b) for key. */
export const rr = (i: number, a: number, b: number) => a + (b - a) * rnd(i);
/** Sequential deterministic stream starting at an offset of the master table. */
export function stream(offset: number) {
  let i = offset;
  return () => rnd(i++);
}

const fade = (t: number) => t * t * (3 - 2 * t);
/** Smooth 1D value noise in [-1,1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = fade(x - i);
  const a = rnd(i * 7 + seed * 1013);
  const b = rnd((i + 1) * 7 + seed * 1013);
  return (a + (b - a) * f) * 2 - 1;
}
const h3 = (x: number, y: number, z: number) => rnd(x * 73 + y * 9277 + z * 26699);
/** Smooth 3D value noise in [-1,1]. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const a = h3(xi, yi, zi), b = h3(xi + 1, yi, zi), c = h3(xi, yi + 1, zi), d = h3(xi + 1, yi + 1, zi);
  const e = h3(xi, yi, zi + 1), f = h3(xi + 1, yi, zi + 1), g = h3(xi, yi + 1, zi + 1), h = h3(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return (y1 + (y2 - y1) * w) * 2 - 1;
}
export function noise2(x: number, y: number, seed = 0) {
  return noise3(x, y, seed * 3.7);
}
