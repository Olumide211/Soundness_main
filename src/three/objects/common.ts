import * as THREE from 'three';
import { Sprites } from '../lib/particles';
import { rr } from '../lib/rng';
import { clamp } from '../lib/math';

export type Ctx = {
  frame: number;
  t: number; // local frame of this object's segment
  time: number; // seconds
  orb: THREE.Vector3; // world
  orbLocal: THREE.Vector3; // in object group space
  heat: number;
  camera: THREE.PerspectiveCamera;
  shimmer: (worldPos: THREE.Vector3, radius: number, strength: number) => void;
};

export type SceneObject = { group: THREE.Group; update: (c: Ctx) => void; reflectOn?: boolean };

/** Steam/smoke puffs rising from around a point. Fully analytic in time. */
export function steamEmitter(
  sp: Sprites, seed: number, t: number, opts: {
    start: number; end: number; origin: THREE.Vector3; spread: number; rise: number; life: number; size0: number; size1: number;
    alpha: number; color: [number, number, number]; warm?: THREE.Vector3; warmAmt?: number; offset?: number; ring?: number; drift?: number;
  }
) {
  const n = sp.count;
  const off = opts.offset ?? 0;
  const span = opts.end - opts.start;
  for (let k = 0; k < n; k++) {
    const i = k + off;
    if (i >= sp.count) break;
    const b = opts.start + (k / n) * span + rr(seed + k * 13, -1.5, 1.5);
    const life = opts.life * rr(seed + k * 13 + 1, 0.7, 1.3);
    const age = t - b;
    if (age < 0 || age > life) { sp.a.alpha[i] = 0; continue; }
    const p = age / life;
    const ang = rr(seed + k * 13 + 2, 0, Math.PI * 2);
    const rad = (opts.ring ?? 0) + opts.spread * Math.sqrt(rr(seed + k * 13 + 3, 0, 1));
    const sway = Math.sin(age * 0.11 + k) * 0.6 * p;
    const drift = opts.drift ?? 0.4;
    const x = opts.origin.x + Math.cos(ang) * rad * (1 + p * 0.8) + sway + drift * age * 0.06;
    const z = opts.origin.z + Math.sin(ang) * rad * (1 + p * 0.8) + Math.cos(age * 0.09 + k) * 0.4 * p;
    const y = opts.origin.y + opts.rise * age * rr(seed + k * 13 + 4, 0.7, 1.3) * (1 - 0.35 * p);
    const size = opts.size0 + (opts.size1 - opts.size0) * Math.sqrt(p);
    const a = opts.alpha * clamp(p / 0.15) * (1 - p) * (1 - p) * rr(seed + k * 13 + 5, 0.6, 1.0);
    let [r, g, bb] = opts.color;
    if (opts.warm) {
      const d = Math.hypot(x - opts.warm.x, y - opts.warm.y, z - opts.warm.z);
      const w = (opts.warmAmt ?? 1) * Math.exp(-d / 4.5);
      r += w * 1.6; g += w * 0.55; bb += w * 0.12;
    }
    sp.set(i, x, y, z, size, a, r, g, bb, rr(seed + k * 13 + 6, 0, 6.28) + age * 0.01 * (k % 2 ? 1 : -1));
  }
}

export const smoothMin = (a: number, b: number, k: number) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
};
export const smoothMax = (a: number, b: number, k: number) => -smoothMin(-a, -b, k);

/** fake subsurface glow from the orb into translucent materials */
export function addOrbGlow(mat: THREE.MeshPhysicalMaterial, color: [number, number, number], near: number, strength: number, key: string) {
  const u = { uOrb: { value: new THREE.Vector3() }, uGlow: { value: strength } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform vec3 uOrb; uniform float uGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float dO = max(0.0, length(vWp - uOrb) - 3.0);
        totalEmissiveRadiance += vec3(${color.map((c) => c.toFixed(3)).join(',')}) * uGlow * (exp(-dO / ${near.toFixed(2)}) + 0.25 * exp(-dO / ${(near * 3).toFixed(2)}));`);
  };
  mat.customProgramCacheKey = () => 'orbglow' + key;
  return u;
}
