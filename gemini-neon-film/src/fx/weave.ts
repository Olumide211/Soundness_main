import {hash} from './rng';

// Gate weave: ≤1 px, slow, seeded. Two low-frequency sines per axis with seeded
// phases. Returns a CSS translate in pixels for the given global frame.
export const gateWeave = (frame: number, fps: number, amplitude = 1, seed = 11) => {
  const t = frame / fps;
  const p = (k: number) => hash(seed * 31 + k) * Math.PI * 2;
  const x = 0.65 * Math.sin(2 * Math.PI * 0.31 * t + p(1)) + 0.35 * Math.sin(2 * Math.PI * 0.73 * t + p(2));
  const y = 0.65 * Math.sin(2 * Math.PI * 0.23 * t + p(3)) + 0.35 * Math.sin(2 * Math.PI * 0.61 * t + p(4));
  return {x: x * amplitude, y: y * amplitude};
};

/** Over-scale so a 1 px weave never shows an edge. */
export const WEAVE_OVERSCALE = 1.004;
