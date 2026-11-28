import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { Sprites } from '../lib/particles';
import { makePuddleGeometry } from '../lib/shapes';
import { noise3 } from '../lib/rng';
import { clamp, smoothstep } from '../lib/math';
import { iceMelt, iceTop, R_ORB } from '../state';
import { Ctx, SceneObject, smoothMax, smoothMin, steamEmitter } from './common';

export function createIce(): SceneObject {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, roughness: 0.2, ior: 1.31, thickness: 3.0,
    attenuationColor: new THREE.Color('#cfe6ff'), attenuationDistance: 7, specularIntensity: 1, envMapIntensity: 1.6,
    clearcoat: 0, clearcoatRoughness: 0.05,
  });
  const iceU = { uOrb: { value: new THREE.Vector3() } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, iceU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform vec3 uOrb;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float dO = max(0.0, length(vWp - uOrb) - 3.0);
        float fr = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 2.0);
        totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * (exp(-dO / 0.9) * 0.45 + exp(-dO / 3.0) * 0.06);
        totalEmissiveRadiance += vec3(0.55, 0.62, 0.7) * fr * 0.06;`);
  };
  mat.customProgramCacheKey = () => 'iceglow';
  const RES = 56;
  const S = 4.4; // half extent
  const C = new THREE.Vector3(0, 2.75, 0); // box centre
  const mc = new MarchingCubes(RES, mat, false, false, 90000);
  mc.isolation = 0;
  mc.scale.set(S, S, S);
  mc.position.copy(C);
  mc.castShadow = true;
  mc.receiveShadow = false;
  group.add(mc);

  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, roughness: 0.03, ior: 1.33, thickness: 0.5, specularIntensity: 1, envMapIntensity: 1.8,
    attenuationColor: new THREE.Color('#e8f4ff'), attenuationDistance: 20,
  });
  const puddle = new THREE.Mesh(makePuddleGeometry(3, 128, 18, 0.16), puddleMat);
  puddle.position.y = 0.02;
  puddle.receiveShadow = true;
  group.add(puddle);

  const steam = new Sprites(130, 'smoke');
  group.add(steam.mesh);

  // precomputed lumpy-melt noise field per voxel
  const N3 = RES * RES * RES;
  const lump = new Float32Array(N3);
  const px = new Float32Array(RES);
  for (let i = 0; i < RES; i++) px[i] = ((i - RES / 2) / (RES / 2)) * S;
  for (let k = 0; k < RES; k++) for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const x = px[i] + C.x, y = px[j] + C.y, z = px[k] + C.z;
    lump[i + j * RES + k * RES * RES] = noise3(x * 0.9 + 3.1, y * 0.9, z * 0.9 + 7.7) * 0.6 + noise3(x * 2.3, y * 2.3 + 5.0, z * 2.3) * 0.4;
  }
  let lastT = -1e9;
  const tmp = new THREE.Vector3();

  function sdf(x: number, y: number, z: number, m: number, ox: number, oy: number, oz: number, li: number) {
    const top = iceTop(m);
    const hw = 2.5 - 0.95 * m;
    const hy = top / 2;
    const r = Math.min(0.32 + 1.0 * m, hy * 0.92, hw * 0.92);
    const qx = Math.abs(x) - (hw - r), qy = Math.abs(y - hy) - (hy - r), qz = Math.abs(z) - (hw - r);
    const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
    let d = Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
    // melt-water slump at the base (metaball-style smooth union)
    const br = hw + 0.35 + 0.9 * m, bh = 0.22 + 0.45 * m;
    const ex = x / br, ey = y / bh, ez = z / br;
    const dBlob = (Math.sqrt(ex * ex + ey * ey + ez * ez) - 1) * Math.min(br, bh);
    d = smoothMin(d, dBlob, 0.35 + 0.4 * m);
    d += lump[li] * (0.05 + 0.22 * m);
    // orb cavity (smooth subtraction leaves a melted rim)
    const dx = x - ox, dy = y - oy, dz = z - oz;
    const dOrb = Math.sqrt(dx * dx + dy * dy + dz * dz) - (R_ORB + 0.06);
    d = smoothMax(d, -dOrb, 0.45);
    d = Math.max(d, -y + 0.005);
    return d;
  }

  return {
    group,
    update(c: Ctx) {
      const t = c.t;
      const m = iceMelt(t);
      if (t !== lastT) {
        lastT = t;
        const o = c.orbLocal;
        const field = mc.field;
        let li = 0;
        for (let k = 0; k < RES; k++) {
          const z = px[k] + C.z;
          for (let j = 0; j < RES; j++) {
            const y = px[j] + C.y;
            for (let i = 0; i < RES; i++, li++) {
              const x = px[i] + C.x;
              field[li] = -sdf(x, y, z, m, o.x, o.y, o.z, li);
            }
          }
        }
        // outer shell must be outside
        mc.update();
      }
      iceU.uOrb.value.copy(c.orb);
      mat.roughness = 0.24 - 0.2 * smoothstep(0, 0.35, m);
      mat.clearcoat = smoothstep(0, 0.3, m);
      // puddle growth
      const pr = 2.3 + 6.2 * Math.pow(m, 0.85);
      puddle.scale.set(pr, 0.12 + 0.24 * smoothstep(0, 0.4, m), pr);
      puddle.visible = m > 0.01;
      puddle.rotation.y = 0.3 * m;
      // steam
      tmp.set(c.orbLocal.x, c.orbLocal.y - R_ORB + 0.4, c.orbLocal.z);
      steamEmitter(steam, 700, t, {
        start: 40, end: 108, origin: tmp, spread: 1.2, ring: 2.4, rise: 0.17, life: 34, size0: 1.0, size1: 4.6,
        alpha: 0.3, color: [0.78, 0.8, 0.84], warm: c.orbLocal, warmAmt: 0.6,
      });
      steam.commit(c.time);
      if (m > 0) c.shimmer(c.orb, 3.2, 0);
    },
  };
}
