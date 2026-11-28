import * as THREE from 'three';
import { Sprites } from '../lib/particles';
import { Flame } from '../lib/flame';
import { makeDripGeometry } from '../lib/shapes';
import { noise1, noise2 } from '../lib/rng';
import { clamp, smoothstep, easeOutCubic } from '../lib/math';
import { OBJ, R_ORB, u60 } from '../state';
import { Ctx, SceneObject, steamEmitter } from './common';

const RC = 5.0, HC = 10.0;
const WICK = new THREE.Vector3(-2.3, HC, -0.9);

function waxMaterial() {
  const uniforms = { uHeatPos: { value: new THREE.Vector3() }, uHeat: { value: 0 }, uFlame: { value: 0 }, uWick: { value: WICK.clone() } };
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#efe2c8'), roughness: 0.52, sheen: 0.6, sheenColor: new THREE.Color('#fff3dc'), sheenRoughness: 0.6,
    envMapIntensity: 0.9,
  });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMelt;\nvarying float vMelt;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMelt = aMelt; vLocal = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMelt; varying vec3 vLocal; uniform vec3 uHeatPos; uniform float uHeat; uniform float uFlame; uniform vec3 uWick;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.035, vMelt);')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.93, 0.86, 0.7), vMelt);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // fake subsurface: heat & flame light scattering through wax
        float dh = length(vLocal - uHeatPos);
        totalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * uHeat * (exp(-dh / 1.3) * 1.4 + exp(-dh / 3.5) * 0.25);
        float dw = length(vLocal - uWick);
        float topZone = smoothstep(${(HC - 3.5).toFixed(2)}, ${HC.toFixed(2)}, vLocal.y);
        totalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * uFlame * exp(-dw / 2.6) * (0.25 + 0.75 * topZone) * 0.55;`);
  };
  m.customProgramCacheKey = () => 'wax';
  return { m, uniforms };
}

export function createCandle(): SceneObject {
  const group = new THREE.Group();
  // profile (r, y) from bottom centre -> side -> rim -> top centre
  const prof: [number, number][] = [];
  prof.push([0, 0]);
  for (let i = 1; i <= 6; i++) prof.push([(RC - 0.2) * (i / 6), 0]);
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; prof.push([RC - 0.2 + 0.2 * Math.sin(a), 0.2 - 0.2 * Math.cos(a)]); }
  for (let i = 1; i <= 40; i++) prof.push([RC, 0.2 + (HC - 0.6) * (i / 40)]);
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; prof.push([RC - 0.4 + 0.4 * Math.cos(a), HC - 0.4 + 0.4 * Math.sin(a)]); }
  for (let i = 1; i <= 46; i++) prof.push([(RC - 0.4) * (1 - i / 46), HC]);
  const NA = 160;
  const NP = prof.length;
  const pos = new Float32Array(NA * NP * 3);
  const base = new Float32Array(NA * NP * 3);
  const melt = new Float32Array(NA * NP);
  for (let a = 0; a < NA; a++) {
    const th = (a / NA) * Math.PI * 2;
    for (let p = 0; p < NP; p++) {
      const [r, y] = prof[p];
      const k = (a * NP + p) * 3;
      // slight hand-poured irregularity on the side
      const irr = y > 0.3 && y < HC - 0.2 ? 0.03 * noise2(th * 3, y * 0.6, 2) : 0;
      base[k] = Math.cos(th) * (r + irr); base[k + 1] = y; base[k + 2] = Math.sin(th) * (r + irr);
    }
  }
  pos.set(base);
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
  geo.setAttribute('aMelt', new THREE.BufferAttribute(melt, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const { m: wax, uniforms } = waxMaterial();
  const candle = new THREE.Mesh(geo, wax);
  candle.castShadow = true; candle.receiveShadow = true;
  group.add(candle);

  // wick
  const wickCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(WICK.x, HC - 0.6, WICK.z), new THREE.Vector3(WICK.x, HC + 0.4, WICK.z), new THREE.Vector3(WICK.x + 0.12, HC + 0.95, WICK.z + 0.05),
    new THREE.Vector3(WICK.x + 0.32, HC + 1.25, WICK.z + 0.08),
  ]);
  const wickMat = new THREE.MeshStandardMaterial({ color: '#1b1612', roughness: 0.9, emissive: new THREE.Color('#ff4a10'), emissiveIntensity: 0 });
  const wick = new THREE.Mesh(new THREE.TubeGeometry(wickCurve, 16, 0.085, 8, false), wickMat);
  wick.castShadow = true;
  group.add(wick);

  const flame = new Flame(3.7, { turb: 0.0, blue: 1 });
  flame.mesh.position.set(WICK.x + 0.2, HC + 0.8, WICK.z + 0.05);
  group.add(flame.mesh);
  const flameLight = new THREE.PointLight(new THREE.Color('#ffa24a'), 0, 0, 2);
  flameLight.position.set(WICK.x, HC + 2.2, WICK.z);
  group.add(flameLight);

  // wax drips running down the side near the orb (front-right)
  const dripMat = wax; // shares melt shading through aMelt? use a glossy clone instead
  const dripM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e9d9b8'), roughness: 0.08, sheen: 0.4, sheenColor: new THREE.Color('#fff0d0'), envMapIntensity: 1.0, clearcoat: 0.6 });
  void dripMat;
  const dripGeo = makeDripGeometry(0.2, 0.36);
  const drips = [
    { th: 0.18, b: 52, L: 5.8 }, { th: 0.5, b: 60, L: 3.9 }, { th: -0.12, b: 68, L: 4.6 }, { th: 0.78, b: 75, L: 2.6 },
  ].map((d) => {
    const m = new THREE.Mesh(dripGeo, dripM);
    m.castShadow = true;
    group.add(m);
    return { ...d, m };
  });
  // the overflow lip where wax pours over the rim
  const smoke = new Sprites(50, 'smoke');
  group.add(smoke.mesh);

  const contact = new THREE.Vector3(OBJ[2].cx, HC, OBJ[2].cz);
  let lastT = -1e9;
  const tmp = new THREE.Vector3();
  const wickTipW = new THREE.Vector3();
  const IGNITE = 63;

  return {
    group,
    update(c: Ctx) {
      const t = c.t;
      const u = u60(t);
      const o = c.orbLocal;
      const Rp = t < 40 ? 0 : 1.2 + 4.6 * Math.pow(u, 0.8); // pool radius
      const drop = 0.5 + 0.7 * u; // pool depth
      if (t !== lastT) {
        lastT = t;
        for (let v = 0; v < NA * NP; v++) {
          const k = v * 3;
          const x = base[k], y0 = base[k + 1], z = base[k + 2];
          let y = y0;
          let mu = 0;
          if (y0 > HC - 1.6) {
            const d = Math.hypot(x - contact.x, z - contact.z);
            const dw = Math.hypot(x - WICK.x, z - WICK.z);
            const dd = Math.min(d, dw + (t > IGNITE ? 4.6 * (1 - Math.pow(1 - clamp((t - IGNITE) / 45), 2)) : -99));
            mu = t < 40 ? 0 : smoothstep(Rp, Rp - 0.8, d + 0.35 * noise1(Math.atan2(z, x) * 3, 9));
            mu = Math.max(mu, t > IGNITE ? smoothstep(2.4, 0.6, dw) * clamp((t - IGNITE) / 25) : 0);
            void dd;
            const flat = HC - drop * 0.42; // liquid level
            y = y0 - (y0 - Math.min(y0, flat)) * mu - (y0 > HC - 0.05 ? 0 : 0);
            if (y0 >= HC - 0.001) y = HC - mu * drop * 0.42;
            // rim melts down where the orb overhangs
            const rimLoss = smoothstep(4.0, 1.4, d) * (0.4 + 1.0 * u) * (t > 40 ? 1 : 0);
            if (y0 > HC - 1.2) y -= rimLoss * smoothstep(HC - 1.2, HC, y0);
            // orb imprint
            const dx = x - o.x, dz = z - o.z;
            const r2 = (R_ORB + 0.05) ** 2 - dx * dx - dz * dz;
            if (r2 > 0) { const yS = o.y - Math.sqrt(r2); if (y > yS) { y = yS; mu = Math.max(mu, 0.9); } }
            mu = Math.max(mu, rimLoss * 0.8);
          }
          pos[k + 1] = y;
          melt[v] = mu;
        }
        geo.attributes.position.needsUpdate = true;
        (geo.attributes.aMelt as THREE.BufferAttribute).needsUpdate = true;
        geo.computeVertexNormals();
      }
      uniforms.uHeatPos.value.set(o.x, o.y - R_ORB, o.z);
      uniforms.uHeat.value = t < 40 ? 0.15 * clamp((t - 25) / 15) : 0.15 + 0.85 * smoothstep(40, 70, t);
      // drips
      for (const d of drips) {
        const age = t - d.b;
        d.m.visible = age > 0;
        const len = age > 0 ? d.L * (1 - Math.exp(-age / 14)) + 0.3 : 0;
        const th = d.th;
        d.m.position.set(Math.cos(th) * (RC + 0.02), HC - 0.35 - 0.4 * u, Math.sin(th) * (RC + 0.02));
        d.m.scale.set(1, Math.max(0.01, len), 1);
      }
      // ignition
      const ig = clamp((t - IGNITE) / 8);
      const flick = 1 + 0.12 * noise1(c.frame * 0.45, 5) + 0.06 * Math.sin(c.frame * 1.7);
      const pop = ig > 0 ? ig * (1 + 0.35 * Math.exp(-(t - IGNITE) / 4) * Math.sin((t - IGNITE) * 0.9)) : 0;
      flame.set(c.time, 1.15 * pop, 3.4 * pop * flick, 1.15 * pop, 0.08 * noise1(c.frame * 0.2, 6));
      flameLight.intensity = 26 * pop * flick;
      wickMat.emissiveIntensity = t > 52 ? 2.5 * smoothstep(52, 63, t) : 0;
      if (pop > 0) {
        wickTipW.set(WICK.x, HC + 2.0, WICK.z);
        group.localToWorld(wickTipW);
        c.shimmer(wickTipW, 1.6, 0.8 * pop);
      }
      // wisps from the heating wick before it catches, then a thin smoke from the flame tip
      tmp.set(WICK.x + 0.3, HC + 1.2, WICK.z);
      steamEmitter(smoke, 1100, t, {
        start: 50, end: 108, origin: tmp, spread: 0.25, rise: 0.16, life: 30, size0: 0.4, size1: 2.2,
        alpha: 0.1, color: [0.5, 0.48, 0.46], drift: 0.2,
      });
      smoke.commit(c.time);
    },
  };
}
