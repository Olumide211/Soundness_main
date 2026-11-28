import * as THREE from 'three';
import { Blobs, Sprites } from '../lib/particles';
import { NOISE_GLSL } from '../lib/glsl';
import { rr, rnd, noise1 } from '../lib/rng';
import { clamp, smoothstep, G } from '../lib/math';
import { R_ORB, u60 } from '../state';
import { Ctx, SceneObject, steamEmitter } from './common';

const RM = 8.2, HM = 6.0;

export function createMelon(): SceneObject {
  const group = new THREE.Group();
  // ---- rind dome (cut face up) ----
  const dome = new THREE.SphereGeometry(RM, 120, 48, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const dp = dome.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    let y = dp.getY(i) * (HM / RM); // squash
    y += HM;
    if (y < 0.35) { const k = (0.35 - y); y = 0.35 - k * 0.15; }
    dp.setY(i, y);
  }
  dome.computeVertexNormals();
  const rindMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 1.1 });
  rindMat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLoc;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float th = atan(vLoc.z, vLoc.x);
        float w = fbm2(vec2(th * 3.0, vLoc.y * 0.5)) - 0.5;
        float st = sin(th * 11.0 + w * 3.2 + vLoc.y * 0.08);
        float stripe = smoothstep(-0.05, 0.35, st + (vnoise2(vec2(th * 40.0, vLoc.y * 3.0)) - 0.5) * 0.5);
        vec3 light = vec3(0.32, 0.5, 0.17), dark = vec3(0.05, 0.16, 0.05);
        vec3 col = mix(light, dark, stripe) * (0.85 + 0.3 * vnoise2(vLoc.xz * 2.0 + vLoc.y));
        diffuseColor.rgb = col;`);
  };
  rindMat.customProgramCacheKey = () => 'rind';
  const rind = new THREE.Mesh(dome, rindMat);
  rind.castShadow = true; rind.receiveShadow = true;
  group.add(rind);

  // ---- cut face (polar grid, deformable for the crater) ----
  const NA = 180, NR = 80;
  const fpos = new Float32Array((NA * NR + 1) * 3);
  const fbase = new Float32Array((NA * NR + 1) * 2);
  const burn = new Float32Array(NA * NR + 1);
  fbase[0] = 0; fbase[1] = 0;
  for (let r = 1; r <= NR; r++) for (let a = 0; a < NA; a++) {
    const rho = RM * Math.pow(r / NR, 0.85);
    const th = (a / NA) * Math.PI * 2;
    const i = 1 + (r - 1) * NA + a;
    fbase[i * 2] = Math.cos(th) * rho; fbase[i * 2 + 1] = Math.sin(th) * rho;
  }
  const fidx: number[] = [];
  for (let a = 0; a < NA; a++) fidx.push(0, 1 + ((a + 1) % NA), 1 + a);
  for (let r = 1; r < NR; r++) for (let a = 0; a < NA; a++) {
    const a1 = (a + 1) % NA;
    const i0 = 1 + (r - 1) * NA + a, i1 = 1 + (r - 1) * NA + a1, i2 = 1 + r * NA + a, i3 = 1 + r * NA + a1;
    fidx.push(i0, i1, i2, i1, i3, i2);
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('aBurn', new THREE.BufferAttribute(burn, 1));
  fgeo.setIndex(fidx);
  const faceMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.2, envMapIntensity: 1.0, sheen: 0.3, sheenColor: new THREE.Color('#ff8090') });
  faceMat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBurn; varying float vBurn; varying vec3 vLoc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBurn = aBurn; vLoc = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vBurn; varying vec3 vLoc;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rho = length(vLoc.xz);
        float grain = vnoise2(vLoc.xz * 7.0) * 0.6 + vnoise2(vLoc.xz * 19.0) * 0.4;
        vec3 flesh = mix(vec3(0.86, 0.08, 0.12), vec3(0.95, 0.28, 0.3), smoothstep(${(RM * 0.55).toFixed(2)}, ${(RM - 1.1).toFixed(2)}, rho));
        flesh *= 0.86 + 0.28 * grain;
        vec3 white = vec3(0.86, 0.9, 0.72);
        vec3 skin = vec3(0.12, 0.3, 0.09);
        vec3 col = mix(flesh, white, smoothstep(${(RM - 1.25).toFixed(2)}, ${(RM - 0.95).toFixed(2)}, rho));
        col = mix(col, skin, smoothstep(${(RM - 0.38).toFixed(2)}, ${(RM - 0.22).toFixed(2)}, rho));
        vec3 charC = mix(vec3(0.22, 0.03, 0.02), vec3(0.04, 0.012, 0.01), smoothstep(0.4, 1.0, vBurn));
        col = mix(col, charC, smoothstep(0.05, 0.6, vBurn));
        diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.42 - 0.22 * grain, 0.15, smoothstep(0.1, 0.5, vBurn));');
  };
  faceMat.customProgramCacheKey = () => 'melonface';
  const face = new THREE.Mesh(fgeo, faceMat);
  face.receiveShadow = true; face.castShadow = true;
  group.add(face);

  // seeds
  const seedMat = new THREE.MeshPhysicalMaterial({ color: '#120c08', roughness: 0.2, clearcoat: 1 });
  const seeds = new Blobs(26, seedMat, 10);
  const seedList: { x: number; z: number; a: number }[] = [];
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2 + rr(2200 + k, -0.08, 0.08);
    const r = RM * rr(2230 + k, 0.48, 0.62);
    seedList.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, a });
  }
  group.add(seeds.mesh);

  // juice droplets + table splatter decals
  const juiceMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e11d3c'), roughness: 0.06, clearcoat: 1, envMapIntensity: 1.6, transparent: true, opacity: 0.92 });
  const drops = new Blobs(260, juiceMat, 10);
  const splatMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#7a0818'), roughness: 0.06, clearcoat: 1, envMapIntensity: 1.6, transparent: true, opacity: 0.72, polygonOffset: true, polygonOffsetFactor: -2 });
  const splats = new Blobs(260, splatMat, 14);
  splats.mesh.receiveShadow = true;
  group.add(drops.mesh, splats.mesh);
  const steam = new Sprites(150, 'smoke');
  group.add(steam.mesh);
  let lastT = -1e9;
  const tmp = new THREE.Vector3();

  return {
    group,
    update(c: Ctx) {
      const t = c.t;
      const u = u60(t);
      const o = c.orbLocal;
      if (t !== lastT) {
        lastT = t;
        const nV = NA * NR + 1;
        for (let i = 0; i < nV; i++) {
          const x = fbase[i * 2], z = fbase[i * 2 + 1];
          let y = HM;
          const dx = x - o.x, dz = z - o.z;
          const d = Math.hypot(dx, dz);
          let bn = 0;
          if (t >= 40) {
            const r2 = (R_ORB + 0.05) ** 2 - d * d;
            if (r2 > 0) { const yS = o.y - Math.sqrt(r2); if (y > yS) y = yS; }
            // crater rim: flesh shrinks and puckers outward
            const pen = clamp((HM - (o.y - R_ORB)) / 2.6);
            y += 0.28 * pen * Math.exp(-Math.pow((d - (R_ORB + 0.45)) / 0.55, 2)) * (1 + 0.4 * noise1(Math.atan2(dz, dx) * 4, 7));
            y -= 0.25 * pen * Math.exp(-Math.pow((d - R_ORB) / 1.4, 2));
            bn = clamp(1 - (d - R_ORB * 0.8) / 1.6) * smoothstep(40, 62, t);
          }
          fpos[i * 3] = x; fpos[i * 3 + 1] = y; fpos[i * 3 + 2] = z;
          burn[i] = bn;
        }
        fgeo.attributes.position.needsUpdate = true;
        (fgeo.attributes.aBurn as THREE.BufferAttribute).needsUpdate = true;
        fgeo.computeVertexNormals();
      }
      seeds.begin();
      for (const s of seedList) {
        const d = Math.hypot(s.x - o.x, s.z - o.z);
        if (d < R_ORB + 0.2 && t > 40) continue;
        seeds.push(s.x, HM + 0.01, s.z, 0.17, Math.cos(s.a), 0, Math.sin(s.a), 1.9, 1);
      }
      seeds.end();
      // ---- juice splash ----
      drops.begin(); splats.begin();
      for (let k = 0; k < 260; k++) {
        const burst = k < 150;
        const b = burst ? 40.5 + Math.pow(rnd(2400 + k), 2) * 9 : 48 + rnd(2400 + k) * 52;
        const age = t - b;
        if (age < 0) continue;
        const a = rr(2410 + k, 0, Math.PI * 2);
        const r0 = R_ORB + rr(2420 + k, 0.0, 0.6);
        const x0 = o.x + Math.cos(a) * r0, z0 = o.z + Math.sin(a) * r0, y0 = HM + 0.3;
        const vh = burst ? rr(2430 + k, 0.5, 1.9) : rr(2430 + k, 0.3, 1.1);
        const vy = burst ? rr(2440 + k, 0.8, 2.6) : rr(2440 + k, 0.6, 1.6);
        const vx = Math.cos(a) * vh, vz = Math.sin(a) * vh;
        const rad = rr(2450 + k, 0.07, burst ? 0.26 : 0.14);
        // landing on the face (y = HM) or the table (y = 0)
        const tFace = (vy + Math.sqrt(vy * vy + 2 * G * (y0 - HM))) / G;
        const xf = x0 + vx * tFace, zf = z0 + vz * tFace;
        let tl: number, ly: number;
        if (Math.hypot(xf, zf) < RM - 0.1) { tl = tFace; ly = HM; }
        else { tl = (vy + Math.sqrt(vy * vy + 2 * G * y0)) / G; ly = 0; }
        if (age < tl) {
          const x = x0 + vx * age, z = z0 + vz * age, y = y0 + vy * age - 0.5 * G * age * age;
          drops.push(x, y, z, rad, vx, vy - G * age, vz, 1.6);
        } else {
          const xl = x0 + vx * tl, zl = z0 + vz * tl;
          if (ly > 0) continue; // absorbed into the flesh
          const sp = clamp((age - tl) / 3);
          const sz = rad * (1.1 + 0.8 * sp);
          const yaw = Math.atan2(vx, vz);
          splats.pushFlat(xl, ly + 0.02, zl, sz, rad * 0.22, sz * 1.5, yaw);
        }
      }
      drops.end(); splats.end();
      tmp.set(o.x, HM + 0.2, o.z);
      steamEmitter(steam, 2600, t, {
        start: 40, end: 108, origin: tmp, spread: 1.0, ring: R_ORB, rise: 0.2, life: 30, size0: 1.0, size1: 4.8,
        alpha: 0.32 * (1 - 0.4 * u), color: [0.82, 0.82, 0.84], warm: o, warmAmt: 0.6,
      });
      steam.commit(c.time);
    },
  };
}
