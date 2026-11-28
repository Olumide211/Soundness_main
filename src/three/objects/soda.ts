import * as THREE from 'three';
import { Blobs, Sprites } from '../lib/particles';
import { makePuddleGeometry } from '../lib/shapes';
import { rr, rnd } from '../lib/rng';
import { clamp, smoothstep, G } from '../lib/math';
import { R_ORB, sodaDent } from '../state';
import { Ctx, SceneObject, steamEmitter } from './common';

const RB = 3.2; // body radius
const AX = RB; // axis height above table
const S0 = 6.0; // contact position along axis
const LEN = 15.6; // shell length (mouth)
const POP = 84;

function radiusAt(s: number) {
  if (s < 0) return 0;
  if (s < 0.9) { const k = s / 0.9; return 2.1 + (RB - 2.1) * Math.sqrt(1 - (1 - k) * (1 - k)); }
  if (s < 9.6) {
    let r = RB;
    for (const g of [2.2, 8.6]) r -= 0.16 * Math.exp(-Math.pow((s - g) / 0.22, 2));
    return r;
  }
  if (s < 13.0) { const k = (s - 9.6) / 3.4; return 1.32 + (RB - 1.32) * (0.5 + 0.5 * Math.cos(Math.PI * k)); }
  let r = 1.32;
  r += 0.32 * Math.exp(-Math.pow((s - 13.6) / 0.09, 2)); // support ring
  return r;
}

function premulShell(mat: THREE.MeshPhysicalMaterial) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aStress;\nvarying float vStress;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStress = aStress;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vStress;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.5, 0.36), smoothstep(0.75, 1.0, vStress));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, smoothstep(0.3, 1.0, vStress));')
      .replace(
        '#include <opaque_fragment>',
        `float fres = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 3.0);
         float aa = clamp(opacity + fres * 0.55 + vStress * 0.45, 0.0, 1.0);
         gl_FragColor = vec4(totalDiffuse * aa + totalSpecular + totalEmissiveRadiance, aa);`
      );
  };
  mat.customProgramCacheKey = () => 'premulShell';
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.premultipliedAlpha = false;
  return mat;
}

const BUBBLE_MAT = () => new THREE.ShaderMaterial({
  uniforms: {},
  vertexShader: /* glsl */ `
    varying vec3 vN; varying vec3 vV;
    void main(){
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vN; varying vec3 vV;
    void main(){
      vec3 n = normalize(vN);
      float f = 1.0 - abs(dot(n, normalize(vV)));
      float rim = pow(f, 1.6);
      float spec = pow(max(dot(n, normalize(vec3(-0.5, 0.75, 0.45))), 0.0), 40.0);
      vec3 col = vec3(0.92, 1.0, 0.86) * (0.12 + rim * 1.1) + vec3(spec * 3.0);
      gl_FragColor = vec4(col, clamp(0.06 + rim * 0.75 + spec, 0.0, 1.0));
    }`,
  transparent: true, depthWrite: false,
});

export function createSoda(): SceneObject {
  const group = new THREE.Group();
  const bottle = new THREE.Group(); // axis along +x, contact at origin
  bottle.rotation.y = -0.38;
  group.add(bottle);

  const NS = 150, NA = 72;
  const sArr: number[] = [];
  for (let i = 0; i < NS; i++) sArr.push((i / (NS - 1)) * LEN);
  const mkGrid = (inset: number, sMin: number, sMax: number) => {
    const pos = new Float32Array(NS * NA * 3);
    const idx: number[] = [];
    for (let i = 0; i < NS - 1; i++) for (let a = 0; a < NA; a++) {
      const a1 = (a + 1) % NA;
      const i0 = i * NA + a, i1 = i * NA + a1, i2 = (i + 1) * NA + a, i3 = (i + 1) * NA + a1;
      idx.push(i0, i1, i2, i1, i3, i2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    return { g, pos, inset, sMin, sMax };
  };
  const shell = mkGrid(0, 0, LEN);
  const stress = new Float32Array(NS * NA);
  shell.g.setAttribute('aStress', new THREE.BufferAttribute(stress, 1));
  const liquid = mkGrid(0.12, 0.2, 13.9);

  const shellMat = premulShell(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#eef7ff'), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.1, side: THREE.DoubleSide,
    depthWrite: false, envMapIntensity: 2.4, specularIntensity: 1, ior: 1.5,
  }));
  const shellMesh = new THREE.Mesh(shell.g, shellMat);
  shellMesh.renderOrder = 3;
  const liqMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f3ffd6'), transmission: 1, roughness: 0.04, ior: 1.34, thickness: 5.5,
    attenuationColor: new THREE.Color('#b9e35a'), attenuationDistance: 7, envMapIntensity: 1.2, depthWrite: false,
  });
  const liqMesh = new THREE.Mesh(liquid.g, liqMat);
  liqMesh.castShadow = true;
  liqMesh.renderOrder = 1;
  bottle.add(liqMesh, shellMesh);
  // shadow proxy for the shell is the liquid; a faint contact shadow is enough.

  // cap
  const capGeo = new THREE.CylinderGeometry(1.52, 1.52, 1.9, 64, 1, false);
  const cp = capGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    if (r > 1.4) { const k = 1 + 0.025 * Math.sign(Math.sin(a * 32)); cp.setX(i, x * k); cp.setZ(i, z * k); }
  }
  capGeo.computeVertexNormals();
  capGeo.rotateZ(-Math.PI / 2);
  const capMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#1f8a3c'), roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.castShadow = true;
  const capRest = new THREE.Vector3(LEN - S0 - 0.75, AX, 0);
  bottle.add(cap);

  // bubbles
  const bubbles = new Blobs(900, BUBBLE_MAT(), 10);
  bubbles.mesh.renderOrder = 2;
  bottle.add(bubbles.mesh);
  // spray droplets & foam
  const dropMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e9f7c0'), roughness: 0.05, transmission: 0, transparent: true, opacity: 0.75, envMapIntensity: 2.0, clearcoat: 1 });
  const drops = new Blobs(320, dropMat, 10);
  const foamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f4f8ea'), roughness: 0.6 });
  const foam = new Blobs(160, foamMat, 10);
  foam.mesh.castShadow = true;
  group.add(drops.mesh, foam.mesh);
  const wet = new THREE.Mesh(makePuddleGeometry(41, 96, 12, 0.25), new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f3ffe0'), transmission: 1, roughness: 0.03, ior: 1.33, thickness: 0.3, envMapIntensity: 1.6,
  }));
  wet.receiveShadow = true;
  group.add(wet);
  const smoke = new Sprites(50, 'smoke');
  group.add(smoke.mesh);

  const axisW = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), bottle.rotation.y);
  const mouthL = new THREE.Vector3(LEN - S0, AX, 0); // bottle-local
  const mouthG = mouthL.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), bottle.rotation.y);
  const tmp = new THREE.Vector3();
  const oB = new THREE.Vector3();
  let lastT = -1e9;

  function deform(grid: ReturnType<typeof mkGrid>, o: THREE.Vector3, dent: number, t: number, isShell: boolean) {
    const { pos, inset } = grid;
    const wr = clamp(dent / 2.4);
    for (let i = 0; i < NS; i++) {
      const sN = sArr[i];
      const s = grid.sMin + (sN / LEN) * (grid.sMax - grid.sMin);
      let rBase = radiusAt(s) - inset;
      if (!isShell) {
        // rounded liquid ends
        const e0 = clamp((s - grid.sMin) / 0.5), e1 = clamp((grid.sMax - s) / 0.35);
        rBase *= Math.sqrt(Math.min(e0, 1)) * Math.sqrt(Math.min(e1, 1));
      }
      if (isShell && s > LEN - 0.12) rBase = radiusAt(s) * 0.86; // lip
      const x = s - S0;
      for (let a = 0; a < NA; a++) {
        const phi = (a / NA) * Math.PI * 2;
        const uy = Math.cos(phi), uz = Math.sin(phi);
        let rho = rBase;
        // smooth sag + buckling folds around the dent
        const arc = rBase * phi > rBase * Math.PI ? rBase * (phi - 2 * Math.PI) : rBase * phi;
        const d = Math.hypot(x, arc);
        const alpha = Math.atan2(arc, x);
        const sag = dent * 0.42 * Math.exp(-(d * d) / 9);
        const fold = wr * 0.32 * Math.sin(alpha * 7 + 1.3) * Math.exp(-Math.pow((d - 3.9) / 1.2, 2)) * (rBase / RB);
        rho -= (sag + fold) * (rBase / RB);
        // conform to the orb sphere (push radially inward until outside)
        const ax = x - o.x, py = AX - o.y, pz = -o.z;
        const bq = py * uy + pz * uz;
        const cq = ax * ax + py * py + pz * pz - Math.pow(R_ORB + 0.05 + inset, 2);
        const disc = bq * bq - cq;
        let st = 0;
        if (disc > 0) {
          const r1 = -bq - Math.sqrt(disc), r2 = -bq + Math.sqrt(disc);
          if (rho > r1 && rho < r2 + 0.001) { rho = Math.max(0.2, r1); st = 1; }
        }
        const k = (i * NA + a) * 3;
        pos[k] = x; pos[k + 1] = AX + rho * uy; pos[k + 2] = rho * uz;
        if (isShell) stress[i * NA + a] = Math.max(st * clamp(dent / 0.6), clamp(sag * 0.9 + Math.abs(fold) * 1.6));
      }
    }
    grid.g.attributes.position.needsUpdate = true;
    grid.g.computeVertexNormals();
    void t;
  }

  return {
    group,
    update(c: Ctx) {
      const t = c.t;
      const dent = t < 40 ? 0 : sodaDent(t);
      oB.copy(c.orbLocal).applyAxisAngle(new THREE.Vector3(0, 1, 0), -bottle.rotation.y);
      if (t !== lastT) {
        lastT = t;
        deform(shell, oB, dent, t, true);
        (shell.g.attributes.aStress as THREE.BufferAttribute).needsUpdate = true;
        deform(liquid, oB, dent, t, false);
      }
      // ---- boiling bubbles (bottle-local) ----
      const boil = smoothstep(44, 80, t);
      bubbles.begin();
      const NB = 900;
      for (let k = 0; k < NB; k++) {
        const hot = k < 380; // nucleate at the hot dent
        const b = hot ? 42 + rr(5000 + k, 0, 62) : 50 + rr(5000 + k, 0, 56) * (0.4 + 0.6 * rnd(7000 + k));
        const age = t - b;
        if (age < 0) continue;
        const life = hot ? rr(6000 + k, 8, 22) : rr(6000 + k, 20, 60);
        if (age > life && !(age < life + 200 && !hot)) continue;
        let s: number, ry: number, rz: number;
        if (hot) {
          const a = rr(8000 + k, -1.2, 1.2), rr2 = rr(8100 + k, 0, 3.4);
          s = S0 + Math.cos(a * 2) * rr2;
          ry = AX + 1.2 - age * 0.06; rz = Math.sin(a * 2) * rr2 * 0.6;
          // jitter like rolling boil
          rz += Math.sin(age * 1.7 + k) * 0.15; ry += Math.cos(age * 2.1 + k) * 0.12;
        } else {
          s = rr(8200 + k, 1.0, 12.4);
          const ang = rr(8300 + k, 0, 6.28), rad = Math.sqrt(rnd(8400 + k)) * (radiusAt(s) - 0.5);
          ry = AX + Math.cos(ang) * rad + age * rr(8500 + k, 0.05, 0.14) + 0.002 * age * age;
          rz = Math.sin(ang) * rad + Math.sin(age * 0.4 + k) * 0.12;
          if (t > POP) s += Math.pow(Math.max(0, t - Math.max(POP, b)), 1.6) * 0.06; // rush to the mouth
        }
        const rIn = radiusAt(Math.min(s, 13.8)) - 0.25;
        const yz = Math.hypot(ry - AX, rz);
        const rad = (hot ? rr(9000 + k, 0.05, 0.17) : rr(9000 + k, 0.04, 0.12)) * (1 + Math.min(age, 40) * 0.015) * (0.3 + 0.7 * boil);
        if (yz > rIn - rad) { const f = (rIn - rad) / yz; ry = AX + (ry - AX) * f; rz *= f; }
        if (s > 14.6) continue;
        // keep out of the dent: crude test against orb sphere
        const dx = s - S0 - oB.x, dy = ry - oB.y, dz = rz - oB.z;
        if (dx * dx + dy * dy + dz * dz < (R_ORB + 0.3) ** 2) continue;
        bubbles.push(s - S0, ry, rz, rad);
      }
      bubbles.end();

      // ---- cap pop ----
      const tp = t - POP;
      if (tp < 0) {
        const shake = t > 76 ? 0.03 * Math.sin(t * 3.1) * (t - 76) / 8 : 0;
        cap.position.set(capRest.x + shake, capRest.y, 0);
        cap.rotation.set(0, 0, 0);
        cap.visible = true;
      } else {
        const vx = 2.3, vy = 4.8;
        cap.position.set(capRest.x + vx * tp, capRest.y + vy * tp - 0.5 * G * tp * tp, 0.25 * tp);
        cap.rotation.set(tp * 0.5, 0, -tp * 0.7);
        cap.visible = cap.position.y > -5;
      }
      // spray + foam (group-local, world-aligned gravity)
      drops.begin();
      const ND = 320;
      for (let k = 0; k < ND; k++) {
        const b = POP + Math.pow(rnd(11000 + k), 1.8) * 18;
        const age = t - b;
        if (age < 0) continue;
        const sp = rr(11100 + k, 1.4, 4.2) * (1 - 0.5 * (b - POP) / 18);
        const up = rr(11200 + k, 0.4, 2.6);
        const side = rr(11300 + k, -0.7, 0.7);
        const vx = axisW.x * sp - axisW.z * side, vz = axisW.z * sp + axisW.x * side;
        let x = mouthG.x + vx * age, z = mouthG.z + vz * age;
        let y = mouthG.y + up * age - 0.5 * G * age * age;
        const r = rr(11400 + k, 0.06, 0.2);
        if (y <= r * 0.3) {
          // landed: becomes a flat splat where it hit
          const tl = (up + Math.sqrt(up * up + 2 * G * (mouthG.y - r * 0.3))) / G;
          x = mouthG.x + vx * tl; z = mouthG.z + vz * tl;
          drops.pushFlat(x, 0.03, z, r * 2.2, r * 0.25, r * 2.2, rnd(11500 + k) * 6);
        } else {
          drops.push(x, y, z, r, vx, up - G * age, vz, 1.5);
        }
      }
      drops.end();
      foam.begin();
      for (let k = 0; k < 160; k++) {
        const b = POP + 1 + k * 0.11;
        const age = t - b;
        if (age < 0) continue;
        const sp = rr(12000 + k, 0.25, 0.8);
        const s = Math.min(age, 6) * sp;
        let y = mouthG.y + 0.3 - 0.5 * G * Math.max(0, age - 4) ** 2 * 0.25;
        const x = mouthG.x + axisW.x * (s + 0.3) + rr(12100 + k, -0.4, 0.4), z = mouthG.z + axisW.z * (s + 0.3) + rr(12200 + k, -0.4, 0.4);
        const r = rr(12300 + k, 0.25, 0.55) * clamp(age / 3);
        if (y < r * 0.6) y = r * 0.6;
        foam.push(x, y, z, r, 0, 1, 0, 0.8);
      }
      foam.end();
      const wp = clamp((t - POP - 4) / 20);
      wet.visible = wp > 0;
      wet.position.set(mouthG.x + axisW.x * 4.5, 0.02, mouthG.z + axisW.z * 4.5);
      wet.scale.set(1.2 + 3.5 * wp, 0.12, 1.0 + 2.6 * wp);
      wet.rotation.y = bottle.rotation.y;
      // hot plastic fumes
      tmp.set(c.orbLocal.x, c.orbLocal.y - R_ORB + 0.5, c.orbLocal.z);
      steamEmitter(smoke, 1300, t, {
        start: 44, end: 108, origin: tmp, spread: 1.0, ring: 2.0, rise: 0.13, life: 34, size0: 0.6, size1: 3.0,
        alpha: 0.12, color: [0.6, 0.6, 0.6], warm: c.orbLocal, warmAmt: 0.3,
      });
      smoke.commit(c.time);
      void tmp;
    },
  };
}
