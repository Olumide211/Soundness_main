// Deterministic randomness only. NO global random sources anywhere in src/.
export const SEEDS = {
  pigment: 0xc0ffee,
  embers: 0xe1be85,
  dust: 0xd057,
  tokens: 0x70c3,
  ribbon: 0x1a55,
} as const;

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

/** stateless hash -> [0,1) */
export function hash(i: number, seed = 0): number {
  let h = (Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const hashRange = (i: number, seed: number, a: number, b: number) => a + (b - a) * hash(i, seed);
/** a seeded per-system stream */
export const stream = (seed: number) => mulberry32(seed);
