import * as THREE from 'three';
import { Sprites } from '../lib/particles';
import { noise1 } from '../lib/rng';
import { clamp, smoothstep } from '../lib/math';
import { R_ORB, jellyMelt, jellySquash } from '../state';
import { Ctx, SceneObject, steamEmitter, addOrbGlow } from './common';

// Fluted gelatin dome. Spring-damped modal jiggle per vertex, then melt into a translucent pool.
export function createJelly(): SceneObject {
  const group = new THREE.Group();
  const prof: [number, number][] = [];
  prof.push([0, 0]);
  for (let i = 1; i <= 10; i++) prof.push([4.6 * (i / 10), 0]);
  for (let i = 1; i <= 34; i++) { const k = i / 34; prof.push([4.6 - 0.9 * k - 0.15 * Math.sin(k * Math.PI), 5.0 * k]); }
  for (let i = 1; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; prof.push([2.2 + 1.5 * Math.cos(a), 5.0 + 1.0 * Math.sin(a)]); }
  for (let i = 1; i <= 16; i++) prof.push([2.2 * (1 - i / 16), 6.0]);
  const NA = 144, NP = prof.length;
  const base = new Float32Array(NA * NP * 4); // r, y, theta, profileParam
  const pos = new Float32Array(NA * NP * 3);
  for (let a = 0; a < NA; a++) {
    const th = (a / NA) * Math.PI * 2;
    for (let p = 0; p < NP; p++) {
      const [r, y] = prof[p];
      const k = (a * NP + p) * 4;
      base[k] = r; base[k + 1] = y; base[k + 2] = th; base[k + 3] = p / (NP - 1);
    }
  }
  const idx: number[] = [];
  for (let a = 0; a < NA; a++) {
    const a1 = (a + 1) % NA;
    for (let p = 0; p < NP - 1; p++) {
      const i0 = a * NP + p, i1 = a1 * NP + p, i2 = a * NP + p + 1, i3 = a1 * NP + p + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ff7080'), transmission: 1, roughness: 0.07, ior: 1.36, thickness: 3.5,
    attenuationColor: new THREE.Color('#ff1530'), attenuationDistance: 5.5, specularIntensity: 1, envMapIntensity: 1.5,
    clearcoat: 0.6, clearcoatRoughness: 0.05,
  });
  const glow = addOrbGlow(mat, [1.0, 0.12, 0.08], 1.6, 0.9, 'jelly');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  const steam = new Sprites(100, 'smoke');
  group.add(steam.mesh);
  let lastT = -1e9;
  const tmp = new THREE.Vector3();
  const swayDir = 0.7;

  return {
    group,
    update(c: Ctx) {
      const t = c.t;
      const o = c.orbLocal;
      glow.uOrb.value.copy(c.orb);
      if (t !== lastT) {
        lastT = t;
        const m = jellyMelt(t);
        const tau = t - 40;
        const H0 = 6.0;
        for (let a = 0; a < NA; a++) for (let p = 0; p < NP; p++) {
          const k4 = (a * NP + p) * 4;
          let r = base[k4], y = base[k4 + 1];
          const th = base[k4 + 2];
          const hf = y / H0;
          // flutes
          const flute = 1 + 0.075 * Math.cos(8 * th) * smoothstep(0.05, 0.4, hf) * (1 - m);
          r *= flute;
          // per-vertex damped spring: higher vertices lag (wave travels up the body)
          const lag = hf * 2.2;
          const S = jellySquash(t - lag) * (1 - 0.7 * m);
          const sway = tau > 0 ? 0.42 * Math.exp(-(tau - lag) / 15) * Math.sin(0.44 * (tau - lag)) * hf * hf * (1 - 0.8 * m) : 0;
          let yy = y * (1 - S);
          let rr2 = r * (1 + 0.5 * S);
          // melt: slump into a meniscus pool with irregular spreading edge
          if (m > 0) {
            const edgeNoise = 1 + 0.16 * m * noise1(th * 2.5 + 1.7, 3) + 0.08 * m * noise1(th * 6.0, 4);
            const sPool = Math.min(1, r / 4.6);
            const poolR = 4.6 * (1 + 0.85 * m) * edgeNoise;
            const poolH = 0.95 * Math.pow(Math.max(0, 1 - Math.pow(sPool, 6)), 0.38) + (p / (NP - 1)) * 0.02;
            // map profile param to pool: bottom ring stays, side+top flow outward
            const pp = base[k4 + 3];
            const targetR = poolR * (pp < 0.08 ? (r / 4.6) : Math.min(1, (1 - pp) * 1.25));
            const targetY = pp < 0.08 ? 0 : 0.95 * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, (1 - pp) * 1.25), 6)), 0.38);
            void poolH;
            rr2 = rr2 + (targetR - rr2) * m;
            yy = yy + (targetY - yy) * m;
          }
          let x = Math.cos(th) * rr2 + Math.cos(swayDir) * sway;
          let z = Math.sin(th) * rr2 + Math.sin(swayDir) * sway;
          // orb dent: push vertices out of the sphere (radially from orb centre)
          const dx = x - o.x, dy = yy - o.y, dz = z - o.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const Rr = R_ORB + 0.04;
          if (d < Rr && d > 1e-4) {
            if (yy > 0.02) { const f = Rr / d; x = o.x + dx * f; yy = o.y + dy * f; z = o.z + dz * f; }
          }
          if (yy < 0) yy = 0;
          const k3 = (a * NP + p) * 3;
          pos[k3] = x; pos[k3 + 1] = yy; pos[k3 + 2] = z;
        }
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
        mat.roughness = 0.07 - 0.04 * m;
        mat.thickness = 3.5 * (1 - 0.7 * m);
      }
      tmp.set(o.x, o.y - R_ORB + 0.5, o.z);
      steamEmitter(steam, 2100, t, {
        start: 44, end: 108, origin: tmp, spread: 1.4, ring: 2.3, rise: 0.15, life: 34, size0: 0.9, size1: 4.0,
        alpha: 0.2, color: [0.8, 0.78, 0.8], warm: o, warmAmt: 0.5,
      });
      steam.commit(c.time);
      void clamp;
    },
  };
}
