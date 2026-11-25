export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** normalised position of f inside [a,b], clamped */
export const remap = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = remap(x, a, b);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a: number, b: number, x: number) => {
  const t = remap(x, a, b);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
export const easeInOutCubic = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeInOutQuad = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3);
export const easeInQuad = (t: number) => clamp01(t) * clamp01(t);
export const easeOutQuad = (t: number) => 1 - (1 - clamp01(t)) * (1 - clamp01(t));
export const easeOutBack = (t: number, s = 1.70158) => {
  t = clamp01(t) - 1;
  return t * t * ((s + 1) * t + s) + 1;
};
/** damped spring step response 0->1, analytic (stateless) */
export const spring = (tSec: number, stiffness = 120, damping = 18, mass = 1) => {
  if (tSec <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * tSec) * (Math.cos(wd * tSec) + ((zeta * w0) / wd) * Math.sin(wd * tSec));
  }
  return 1 - Math.exp(-w0 * tSec) * (1 + w0 * tSec);
};
/** window: 0 outside [a,d], ramps up a->b, holds, ramps down c->d (smoothstep) */
export const window4 = (f: number, a: number, b: number, c: number, d: number) =>
  smoothstep(a, b, f) * (1 - smoothstep(c, d, f));
export const EASES: Record<string, (t: number) => number> = {
  inOutSine: easeInOutSine,
  inOutCubic: easeInOutCubic,
  inOutQuad: easeInOutQuad,
  outCubic: easeOutCubic,
  linear: (t) => clamp01(t),
};
