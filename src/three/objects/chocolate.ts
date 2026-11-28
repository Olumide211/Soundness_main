import * as THREE from 'three';
import { Sprites } from '../lib/particles';
import { makeDripGeometry, makePuddleGeometry } from '../lib/shapes';
import { noise2, rr } from '../lib/rng';
import { clamp, smoothstep, easeOutCubic } from '../lib/math';
import { R_ORB, u60 } from '../state';
import { Ctx, SceneObject, steamEmitter } from './common';

const W = 11, H = 1.8, Dp = 5.4; // bar size
const NX = 5, NZ = 2;

/** inject a per-vertex melt attribute: molten = glossy, darker, smoother */
function meltMaterial(base: THREE.MeshPhysicalMaterial, glossR: number, darken: number) {
  base.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMelt;\nvarying float vMelt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMelt = aMelt;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMelt;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${glossR.toFixed(3)}, vMelt);`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, ${darken.toFixed(3)}, vMelt);`);
  };
  base.customProgramCacheKey = () => 'melt' + glossR + darken;
  return base;
}

export function createChocolate(): SceneObject {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(W, H, Dp, 176, 10, 86);
  geo.translate(0, H / 2, 0);
  const base = (geo.attributes.position.array as Float32Array).slice();
  const nV = base.length / 3;
  const melt = new Float32Array(nV);
  geo.setAttribute('aMelt', new THREE.BufferAttribute(melt, 1));
  // classify vertices & compute embossed top pattern
  const pattern = new Float32Array(nV);
  const sqW = W / NX, sqD = Dp / NZ;
  for (let v = 0; v < nV; v++) {
    const x = base[v * 3], y = base[v * 3 + 1], z = base[v * 3 + 2];
    {
      const gx = ((x + W / 2) % sqW + sqW) % sqW, gz = ((z + Dp / 2) % sqD + sqD) % sqD;
      const e = Math.min(gx, sqW - gx, gz, sqD - gz);
      const eo = Math.min(W / 2 - Math.abs(x), Dp / 2 - Math.abs(z));
      const groove = 0.3 * (1 - smoothstep(0.0, 0.34, e));
      const edge = 0.22 * (1 - smoothstep(0.0, 0.3, eo));
      pattern[v] = -Math.max(groove, edge);
    }
  }
  const mat = meltMaterial(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#5a2c18'), roughness: 0.46, sheen: 0.35, sheenColor: new THREE.Color('#8a5a40'), sheenRoughness: 0.5,
    envMapIntensity: 1.0, clearcoat: 0.0,
  }), 0.09, 0.78);
  const bar = new THREE.Mesh(geo, mat);
  bar.castShadow = true; bar.receiveShadow = true;
  group.add(bar);

  const moltenMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#4a2212'), roughness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.08, envMapIntensity: 1.2,
  });
  // drips on the front face and the right end, plus pools on the table
  const drips: { m: THREE.Mesh; pool: THREE.Mesh; x: number; z: number; b: number; L: number; face: 'front' | 'end' }[] = [];
  const dripGeo = makeDripGeometry(0.17, 0.32);
  const D = [
    { x: -1.6, b: 49 }, { x: 0.4, b: 46 }, { x: 1.9, b: 53 }, { x: -0.6, b: 58 }, { x: 2.9, b: 64 }, { x: -2.8, b: 66 }, { x: 1.1, b: 72 },
  ];
  D.forEach((d, k) => {
    const m = new THREE.Mesh(dripGeo, moltenMat);
    m.castShadow = true;
    const pool = new THREE.Mesh(makePuddleGeometry(20 + k, 64, 10, 0.22), moltenMat);
    pool.receiveShadow = true;
    group.add(m, pool);
    drips.push({ m, pool, x: d.x, z: Dp / 2, b: d.b, L: rr(300 + k, 0.9, 1.15), face: 'front' });
  });

  const smoke = new Sprites(60, 'smoke');
  group.add(smoke.mesh);
  const pos = geo.attributes.position.array as Float32Array;
  let lastT = -1e9;
  const tmp = new THREE.Vector3();

  return {
    group,
    update(c: Ctx) {
      const t = c.t;
      const u = u60(t);
      const o = c.orbLocal;
      const rm = t < 40 ? 0 : 1.6 + 4.2 * Math.pow(u, 0.75);
      if (t !== lastT) {
        lastT = t;
        for (let v = 0; v < nV; v++) {
          let x = base[v * 3], y = base[v * 3 + 1], z = base[v * 3 + 2];
          const rho = Math.hypot(x - o.x, z - o.z);
          let mu = t < 40 ? 0 : clamp((rm - rho) / 1.8);
          mu = mu * mu * (3 - 2 * mu);
          const hf = y / H;
          {
            let top = H + pattern[v] * (1 - mu) - mu * 0.12 + mu * 0.05 * noise2(x * 1.3, z * 1.3, 4);
            // displaced molten bead around the orb
            top += 0.32 * mu * Math.exp(-Math.pow((rho - 2.2) / 0.9, 2)) * smoothstep(40, 60, t);
            y = hf * top;
          }
          // sag & bulge of softened walls
          const bulge = mu * 0.55 * Math.pow(hf, 1.4);
          if (Math.abs(z) > Dp / 2 - 0.01) z += Math.sign(z) * bulge;
          if (Math.abs(x) > W / 2 - 0.01) x += Math.sign(x) * bulge;
          y -= mu * 0.32 * hf * hf;
          // orb imprint: push out of sphere downward
          const dx = x - o.x, dz = z - o.z;
          const r2 = (R_ORB + 0.04) * (R_ORB + 0.04) - dx * dx - dz * dz;
          if (r2 > 0) {
            const yS = o.y - Math.sqrt(r2);
            if (y > yS) y = yS;
          }
          if (y < 0) y = 0;
          pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
          melt[v] = mu;
        }
        geo.attributes.position.needsUpdate = true;
        (geo.attributes.aMelt as THREE.BufferAttribute).needsUpdate = true;
        geo.computeVertexNormals();
      }
      // drips
      for (const d of drips) {
        const age = t - d.b;
        const on = age > 0 && Math.abs(d.x) < rm - 0.4;
        d.m.visible = on;
        const len = on ? Math.min(H * 0.95, 0.25 + age * 0.09) * d.L : 0;
        const bulge = 0.5;
        d.m.position.set(d.x, H - 0.25, d.z + bulge - 0.05);
        d.m.scale.set(1 + 0.25 * clamp(age / 30), Math.max(0.01, len), 1);
        const pAge = age - 10;
        const pr = pAge > 0 ? 0.35 + 1.3 * easeOutCubic(clamp(pAge / 45)) * d.L : 0;
        d.pool.visible = on && pAge > 0;
        d.pool.position.set(d.x, 0.015, d.z + bulge + pr * 0.55);
        d.pool.scale.set(pr * 1.1, 0.14 + 0.1 * clamp(pAge / 30), pr * 0.8);
      }
      tmp.set(o.x, o.y - R_ORB + 0.3, o.z);
      steamEmitter(smoke, 900, t, {
        start: 44, end: 108, origin: tmp, spread: 1.0, ring: 2.6, rise: 0.12, life: 40, size0: 0.8, size1: 3.6,
        alpha: 0.12, color: [0.42, 0.38, 0.36], warm: o, warmAmt: 0.25,
      });
      smoke.commit(c.time);
    },
  };
}
