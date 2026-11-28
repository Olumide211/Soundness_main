import * as THREE from 'three';
import { Sprites } from '../lib/particles';
import { Flame } from '../lib/flame';
import { NOISE_GLSL } from '../lib/glsl';
import { rr, rnd, noise1 } from '../lib/rng';
import { clamp, smoothstep } from '../lib/math';
import { R_ORB, u60 } from '../state';
import { Ctx, SceneObject, steamEmitter } from './common';

const PW = 14, PD = 10, TH = 0.11, NSHEET = 9;

function burnMaterial(seed: number) {
  const uniforms = { uR: { value: -5 }, uC: { value: new THREE.Vector2() }, uTime: { value: 0 }, uSeed: { value: seed } };
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f2f0ea'), roughness: 0.92, side: THREE.DoubleSide, flatShading: true });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uR; uniform vec2 uC; uniform float uSeed; varying float vB; varying vec2 vP;\n${NOISE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 pp = position.xy; // plane is rotated later: local xy is the sheet
        float dn = length(pp - uC) + (fbm2(pp * 0.5 + uSeed) - 0.5) * 2.2;
        float b = uR - dn;
        vB = b; vP = pp;
        float curl = smoothstep(0.1, 1.2, b) * (0.45 + 0.75 * fbm2(pp * 1.1 + uSeed + 7.0));
        vec2 dir = normalize(pp - uC + 1e-4);
        transformed.z += curl * 1.05 + smoothstep(-1.0, 0.2, b) * 0.06;
        transformed.xy -= dir * curl * 0.38;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uSeed; varying float vB; varying vec2 vP;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float b = vB;
        if (b > 1.3) discard;
        float fiber = vnoise2(vP * vec2(9.0, 2.0)) * 0.5 + vnoise2(vP * 23.0) * 0.5;
        vec3 paper = vec3(0.93, 0.92, 0.89) * (0.96 + 0.05 * fiber);
        vec3 sL = vec3(0.70, 0.52, 0.30), sD = vec3(0.24, 0.12, 0.05), ch = vec3(0.025, 0.022, 0.02), ash = vec3(0.32, 0.31, 0.3);
        vec3 col = paper;
        col = mix(col, sL, smoothstep(-2.2, -0.9, b));
        col = mix(col, sD, smoothstep(-0.9, -0.1, b));
        col = mix(col, ch, smoothstep(-0.1, 0.18, b));
        col = mix(col, ash, smoothstep(0.95, 1.25, b) * (0.5 + 0.5 * fiber));
        diffuseColor.rgb = col;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fl = 0.65 + 0.7 * vnoise2(vP * 3.0 + vec2(uTime * 2.5, -uTime * 1.7));
        float ember = (1.0 - smoothstep(0.0, 0.16, abs(b - 0.07))) * step(-0.5, b);
        float specks = smoothstep(0.78, 0.92, vnoise2(vP * 7.0 + uSeed * 3.0 + uTime * 0.6)) * smoothstep(0.1, 0.4, b) * (1.0 - smoothstep(0.9, 1.2, b));
        totalEmissiveRadiance += vec3(1.0, 0.33, 0.05) * (ember * 7.0 * fl + specks * 2.5 * fl);`);
  };
  m.customProgramCacheKey = () => 'burn';
  return { m, uniforms };
}

export function createPaper(): SceneObject {
  const group = new THREE.Group();
  const sheetMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#efede6'), roughness: 0.93 });
  const burns: { mesh: THREE.Mesh; u: ReturnType<typeof burnMaterial>['uniforms']; lag: number }[] = [];
  for (let k = 0; k < NSHEET; k++) {
    const y = TH * (k + 0.5);
    const rot = rr(1500 + k, -0.03, 0.03), ox = rr(1520 + k, -0.22, 0.22), oz = rr(1540 + k, -0.18, 0.18);
    const isBurn = k >= NSHEET - 3;
    if (!isBurn) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(PW, TH * 0.95, PD), sheetMat);
      m.position.set(ox, y, oz); m.rotation.y = rot;
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    } else {
      const { m, uniforms } = burnMaterial(k * 3.3);
      const g = new THREE.PlaneGeometry(PW, PD, 150, 108);
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rot;
      mesh.position.set(ox, TH * (k + 0.9), oz);
      mesh.receiveShadow = true;
      group.add(mesh);
      burns.push({ mesh, u: uniforms, lag: (NSHEET - 1 - k) * 1.7 });
    }
  }
  // fire: flames distributed around the burning front
  const NF = 16;
  const flames: { f: Flame; a: number; s: number }[] = [];
  for (let k = 0; k < NF; k++) {
    const f = new Flame(rr(1600 + k, 0, 10), { turb: 0.35, blue: 0.25 });
    group.add(f.mesh);
    flames.push({ f, a: (k / NF) * Math.PI * 2 + rr(1620 + k, -0.15, 0.15), s: rr(1640 + k, 0.7, 1.25) });
  }
  const fireLight = new THREE.PointLight(new THREE.Color('#ff8a2a'), 0, 0, 2);
  fireLight.position.set(0, 3.5, 2);
  group.add(fireLight);
  const ash = new Sprites(110, 'ash');
  const smoke = new Sprites(90, 'smoke');
  group.add(ash.mesh, smoke.mesh);
  const tmp = new THREE.Vector3();
  const wp = new THREE.Vector3();

  return {
    group,
    update(c: Ctx) {
      const t = c.t;
      const u = u60(t);
      const o = c.orbLocal;
      const R = t < 40 ? -6 : 0.6 + 6.0 * Math.pow(u, 0.85);
      for (const b of burns) {
        b.u.uR.value = R - b.lag;
        // plane local xy: x -> x, y -> -z
        b.u.uC.value.set(o.x - b.mesh.position.x, -(o.z - b.mesh.position.z));
        b.u.uTime.value = c.time;
      }
      // fire
      const fire = smoothstep(54, 68, t);
      let fl = 0;
      for (const f of flames) {
        const rad = Math.max(0.5, R - 0.45 + 0.6 * noise1(f.a * 2 + 3, 4));
        const x = o.x + Math.cos(f.a) * rad * 1.05, z = o.z + Math.sin(f.a) * rad * 0.95;
        const inside = Math.abs(x) < PW / 2 - 0.3 && Math.abs(z) < PD / 2 - 0.3;
        const flick = 0.75 + 0.45 * noise1(c.frame * 0.5 + f.a * 7, 8);
        const h = fire * f.s * (1.6 + 2.6 * u) * flick * (inside ? 1 : 0);
        f.f.mesh.position.set(x, TH * NSHEET + 0.35 + 0.5 * smoothstep(0, 1, u), z);
        f.f.set(c.time + f.a * 3, 0.55 * h + 0.2, h, 0.9, 0.12 * noise1(c.frame * 0.3 + f.a, 9));
        fl += h;
      }
      fireLight.intensity = 9 * fl / NF * (1 + 0.15 * noise1(c.frame * 0.6, 3));
      fireLight.position.set(o.x, 3.0, o.z + 2.5);
      if (fire > 0) { wp.set(o.x, TH * NSHEET + 2.5, o.z + R * 0.7); group.localToWorld(wp); c.shimmer(wp, 3.5 + R * 0.5, 0.9 * fire); }
      // ash flakes
      for (let k = 0; k < ash.count; k++) {
        const b = 58 + (k / ash.count) * 50 + rr(1700 + k, -2, 2);
        const age = t - b;
        if (age < 0) { ash.a.alpha[k] = 0; continue; }
        const life = rr(1710 + k, 25, 45);
        if (age > life) { ash.a.alpha[k] = 0; continue; }
        const a0 = rr(1720 + k, 0, 6.28), r0 = Math.max(0.5, R - 0.8);
        const x = o.x + Math.cos(a0) * r0 + Math.sin(age * 0.17 + k) * 0.6 + age * 0.03;
        const z = o.z + Math.sin(a0) * r0 + Math.cos(age * 0.13 + k) * 0.5;
        const y = TH * NSHEET + 0.6 + age * rr(1730 + k, 0.12, 0.28);
        const glow = rnd(1740 + k) < 0.35 ? Math.max(0, 1 - age / 14) * 3.5 : 0;
        ash.set(k, x, y, z, rr(1750 + k, 0.22, 0.55), 0.95 * (1 - Math.pow(age / life, 3)), glow, glow * 0.3, glow * 0.04, age * rr(1760 + k, -0.3, 0.3));
      }
      ash.commit(c.time);
      tmp.set(o.x, TH * NSHEET + 1.5, o.z);
      steamEmitter(smoke, 1800, t, {
        start: 46, end: 108, origin: tmp, spread: 1.5, ring: Math.max(0.5, R * 0.6), rise: 0.2, life: 40, size0: 1.2, size1: 5.0,
        alpha: 0.18 + 0.12 * fire, color: [0.3, 0.29, 0.28], warm: o, warmAmt: 0.25,
      });
      smoke.commit(c.time);
      void R_ORB;
    },
  };
}
