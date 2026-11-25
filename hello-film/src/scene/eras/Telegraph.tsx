import React, {useMemo} from 'react';
import * as THREE from 'three';
import {getAssets, texSet, TILE} from '../../lib/assets';
import {StationRoot} from '../World';
import {stationMatrix, toWorld} from '../../lib/stations';
import {WIRE_A, WIRE_A_LEN, WIRE_B, WIRE_B_LEN, PAGE} from '../layout';
import {EVENTS, keyArmDeg, pulsesAt, CONTACT_WORLD, pressAmount} from './telegraphTiming';
import {Hand, POSES, mixPose} from '../hands/Hand';
import {easeInOutCubic, easeOutCubic, remap, smoothstep, lerp, clamp01} from '../../lib/ease';
import {morseLayout, pxToPage} from '../morph/glyphToMorse';
import {PEEL_MAX} from './Press';
import {useBillboards, BillboardPrim} from '../particles/Billboards';
import {hash} from '../../lib/rng';
import {coilPoints, cordMaterialMix} from '../morph/wireToHelix';
import {onTop} from '../Bridge';

export const KEY_LEN = 0.15;
type KeyRig = {group: THREE.Group; arm: THREE.Object3D; pivot: THREE.Vector3; knob: THREE.Vector3};

function buildKey(): KeyRig {
  const gltf = getAssets().radio;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const base = scene.getObjectByName('vintage_radio_transceiver_morse_key_base')!;
  const arm = scene.getObjectByName('vintage_radio_transceiver_morse_key_arm')!;
  const brass = texSet('brass', 0.15 / TILE.metal, 0.15 / TILE.metal);
  const fixMat = (o: THREE.Object3D) => o.traverse((m) => {
    const mm = m as THREE.Mesh;
    if (mm.isMesh) {
      const src = mm.material as THREE.MeshStandardMaterial;
      mm.material = new THREE.MeshPhysicalMaterial({map: brass.albedo, color: new THREE.Color('#C9A15A'), normalMap: src.normalMap ?? undefined, metalness: 1, roughness: 0.35, metalnessMap: brass.metalness});
      mm.castShadow = true;
    }
  });
  const inv = new THREE.Matrix4().copy(base.matrixWorld).invert();
  const baseC = base.clone(false) as THREE.Mesh; // geometry only
  baseC.position.set(0, 0, 0); baseC.quaternion.identity(); baseC.scale.set(1, 1, 1);
  const armC = arm.clone(false) as THREE.Mesh;
  new THREE.Matrix4().multiplyMatrices(inv, arm.matrixWorld).decompose(armC.position, armC.quaternion, armC.scale);
  fixMat(baseC); fixMat(armC);
  const inner = new THREE.Group();
  inner.add(baseC, armC);
  inner.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(baseC);
  const size = bb.getSize(new THREE.Vector3());
  const long = size.x >= size.z ? 'x' : 'z';
  const s = KEY_LEN / Math.max(size.x, size.z);
  const centre = bb.getCenter(new THREE.Vector3());
  // arm bbox in inner space to find knob (highest end) and pivot (opposite end)
  const ab = new THREE.Box3().setFromObject(armC);
  const outer = new THREE.Group();
  inner.position.set(-centre.x, -bb.min.y, -centre.z);
  outer.add(inner);
  outer.scale.setScalar(s);
  if (long === 'z') outer.rotation.y = Math.PI / 2;
  // determine which end of the arm is the knob: the end with more height
  const endA = new THREE.Vector3(ab.min.x, ab.max.y, (ab.min.z + ab.max.z) / 2), endB = new THREE.Vector3(ab.max.x, ab.max.y, (ab.min.z + ab.max.z) / 2);
  const armPos = armC.position.clone();
  const knobInner = armPos.distanceTo(endA) > armPos.distanceTo(endB) ? endA : endB;
  const pivotInner = knobInner === endA ? endB : endA;
  // pivot object so we can rotate the arm about its pivot
  const pivotObj = new THREE.Group();
  pivotObj.position.copy(pivotInner).setY(armPos.y);
  inner.add(pivotObj);
  armC.position.sub(pivotObj.position);
  pivotObj.add(armC);
  const group = new THREE.Group();
  group.add(outer);
  group.updateMatrixWorld(true);
  const knob = knobInner.clone().applyMatrix4(inner.matrixWorld);
  const pivot = pivotObj.getWorldPosition(new THREE.Vector3());
  // make knob point to +X (right): flip if needed
  if (knob.x < pivot.x) { outer.rotation.y += Math.PI; }
  group.updateMatrixWorld(true);
  return {group, arm: pivotObj, pivot: pivotObj.getWorldPosition(new THREE.Vector3()), knob: knobInner.clone().applyMatrix4(inner.matrixWorld)};
}

/** pulse shader for wire B: emissive += #CFE8FF * sum gauss((s - s_p)/len_p) * 3 (+ white core) */
function wireMaterial(len: number) {
  const ct = texSet('copper', 1 / TILE.metal, 0.02 / TILE.metal);
  const m = new THREE.MeshPhysicalMaterial({map: ct.albedo, normalMap: ct.normal_gl, roughnessMap: ct.roughness, metalness: 1, roughness: 0.3, color: new THREE.Color('#ffffff')});
  const u = {uS: {value: new Float32Array(16)}, uL: {value: new Float32Array(16)}, uN: {value: 0}, uLen: {value: len}, uE: {value: new THREE.Color('#CFE8FF')}, uPlastic: {value: 0}, uHot: {value: 0}, uFront: {value: 0}};
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vS;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvS = uv.x;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vS; uniform float uS[16]; uniform float uL[16]; uniform int uN; uniform float uLen; uniform vec3 uE; uniform float uPlastic; uniform float uHot; uniform float uFront;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006), uPlastic);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, uPlastic);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, uPlastic);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float s = vS * uLen; float acc = 0.0;
  for (int i = 0; i < 16; i++) { if (i >= uN) break; float d = (s - uS[i]) / max(uL[i] * 0.5, 0.004); acc += exp(-d * d); }
  totalEmissiveRadiance += uE * acc * 3.0 + vec3(1.0) * smoothstep(0.8, 1.0, acc) * 4.0;
  // light line left by the impact flash: a white-hot front runs along the wire, then cools to copper
  float lit = smoothstep(uFront, uFront - 0.06, s);
  totalEmissiveRadiance += vec3(1.0, 0.9, 0.78) * uHot * lit * (2.5 + 6.0 * exp(-pow((s - uFront) / 0.03, 2.0))); }`);
  };
  (m as any).userData.u = u;
  m.customProgramCacheKey = () => 'wirePulse';
  return m;
}

export const Telegraph: React.FC<{frame: number}> = ({frame: f}) => {
  const R = useMemo(() => {
    const key = buildKey();
    const wireA = new THREE.Mesh(new THREE.TubeGeometry(WIRE_A, 400, 0.0012, 12, false), wireMaterial(WIRE_A_LEN));
    const wireBMat = wireMaterial(WIRE_B_LEN);
    const wireB = new THREE.Mesh(new THREE.TubeGeometry(WIRE_B, 400, 0.0012, 12, false), wireBMat);
    wireA.frustumCulled = wireB.frustumCulled = false;
    const L = morseLayout();
    const capMat = new THREE.MeshPhysicalMaterial({color: '#CFE8FF', emissive: new THREE.Color('#CFE8FF'), emissiveIntensity: 0.4, roughness: 0.3});
    const caps = L.capsules.map((c) => {
      const g = c.dash ? new THREE.CapsuleGeometry(0.0015, 0.006, 6, 16) : new THREE.SphereGeometry(0.0015, 16, 12);
      if (c.dash) g.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(g, capMat.clone());
      m.frustumCulled = false;
      return m;
    });
    const termMat = new THREE.MeshPhysicalMaterial({color: '#C9A15A', metalness: 1, roughness: 0.3});
    return {key, wireA, wireB, wireBMat, L, caps, termMat};
  }, []);

  // ---- key arm ----
  const armDeg = keyArmDeg(f);
  R.key.arm.rotation.z = THREE.MathUtils.degToRad(armDeg);

  // ---- wire B pulses + coil morph ----
  const ps = pulsesAt(f);
  const wu = (R.wireBMat as any).userData.u;
  wu.uN.value = ps.length;
  ps.forEach((p, i) => { wu.uS.value[i] = p.s; wu.uL.value[i] = p.len; });
  const coil = f >= 525;
  if (coil) {
    const pts = coilPoints(f);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0);
    R.wireB.geometry.dispose();
    R.wireB.geometry = new THREE.TubeGeometry(curve, Math.min(9000, pts.length * 2), 0.0012 + 0.0006 * cordMaterialMix(f), 8, false);
  }
  wu.uPlastic.value = cordMaterialMix(f);
  // wire A: the impact's light line (334 -> 400 front travel, cools by 424)
  const au = (R.wireA.material as any).userData.u;
  au.uHot.value = smoothstep(332, 338, f) * (1 - smoothstep(404, 424, f));
  au.uFront.value = WIRE_A_LEN * (0.02 + 1.0 * easeInOutCubic(remap(f, 334, 400)));
  onTop(R.wireA, f >= 372 && f <= 418);
  onTop(R.wireB, f >= 524 && f <= 568);
  R.caps.forEach((m) => onTop(m, f >= 372 && f <= 418, 1001));

  // ---- morse capsules: lift off page, glow, slide to the page edge, ride wire A, get absorbed ----
  const pageM = stationMatrix('press');
  const a = PEEL_MAX;
  const caps: React.ReactNode[] = [];
  if (f >= 395 && f <= 428) {
    const N = R.L.capsules.length;
    R.L.capsules.forEach((c, i) => {
      const m = R.caps[i];
      const pp = pxToPage(c.cx, c.cy);
      const tLift = easeOutCubic(remap(f, 397, 402));
      const tSlide = easeInOutCubic(remap(f, 400 + i * 0.25, 407 + i * 0.25));
      const tRide = remap(f, 406 + i * 0.35, 419 + i * 0.35);
      const nrmL = new THREE.Vector3(0, -Math.cos(a), Math.sin(a));
      const float = 1; // page float offset (matches Press)
      const pageLocal = (x: number, d: number) => new THREE.Vector3(x, 0.0254 + 0.03 * float + Math.sin(a) * d, -PAGE.h / 2 + 0.13 * float + Math.cos(a) * d);
      let p = pageLocal(lerp(pp.x, PAGE.w / 2 + 0.004, tSlide), pp.d * (1 - tSlide) + 0.004 * tSlide).addScaledVector(nrmL, 0.001 + 0.0015 * tLift).applyMatrix4(pageM);
      let tan = new THREE.Vector3(1, 0, 0).transformDirection(pageM);
      if (tRide > 0) {
        const u = easeInOutCubic(tRide);
        const wp = WIRE_A.getPointAt(u);
        p = p.clone().lerp(wp.add(new THREE.Vector3(0, 0.002, 0)), smoothstep(0, 0.08, tRide));
        tan = WIRE_A.getTangentAt(Math.min(0.999, u));
      }
      const absorb = remap(f, 419 + i * 0.35, 424 + i * 0.35);
      const sc = (1 - absorb) * (c.dash ? 1 : 1);
      m.position.copy(p);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tan.normalize());
      m.scale.setScalar(Math.max(0.0001, sc) * smoothstep(395, 399, f) + 0.0001);
      (m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.4 + 2.6 * Math.sin(Math.PI * clamp01(absorb)) + 1.6 * tLift + 1.5 * smoothstep(0, 0.1, tRide);
      m.visible = sc > 0.01;
      caps.push(<primitive key={i} object={m} />);
      void N;
    });
  }

  // ---- index finger taps the knob ----
  const knobW = R.key.knob.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), 0);
  // knob in station-local (key group is at station origin); account for arm rotation about the pivot
  const kp = R.key.knob.clone().sub(R.key.pivot).applyAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(armDeg)).add(R.key.pivot);
  void knobW;
  const pressK = pressAmount(f);
  const handIn = easeOutCubic(remap(f, 408, 424)) * (1 - easeInOutCubic(remap(f, 526, 545)));
  const kpS = R.key.knob.clone().sub(R.key.pivot).applyAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(-4 * pressK)).add(R.key.pivot);
  void kp;
  const tipLocal = kpS.clone().add(new THREE.Vector3(0.0, 0.004, 0)).add(new THREE.Vector3(0.12, 0.08, 0.05).multiplyScalar(1 - handIn));
  const tipW = toWorld('telegraph', tipLocal.x, tipLocal.y, tipLocal.z);
  const sm = stationMatrix('telegraph');
  const dirW = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).transformDirection(sm);
  const pose = mixPose(POSES.pressFinger, {...POSES.pressFinger, index: 0.3}, pressK);

  return (
    <>
      <StationRoot name="telegraph">
        <primitive object={R.key.group} />
        {/* terminals */}
        <mesh material={R.termMat} position={[-0.07, 0.004, -0.03]}><cylinderGeometry args={[0.004, 0.004, 0.008, 16]} /></mesh>
        <mesh material={R.termMat} position={[0.07, 0.004, -0.03]}><cylinderGeometry args={[0.004, 0.004, 0.008, 16]} /></mesh>
      </StationRoot>
      {f < 560 && <primitive object={R.wireA} />}
      <primitive object={R.wireB} />
      {caps}
      <Sparks frame={f} />
      {f >= 406 && f <= 546 && (
        <Hand side="right" pose={pose} effector="index-finger-tip" target={tipW} fingerDir={dirW(-0.75, -0.45, -0.35)} palmDir={dirW(0, -1, 0.15)} frame={f} seed={5} look="cool" enterFrame={410} ground={{point: toWorld('telegraph', 0, 0, 0), normal: dirW(0, 1, 0)}} />
      )}
    </>
  );
};

/** 8-particle contact spark per key-down */
const Sparks: React.FC<{frame: number}> = ({frame: f}) => {
  const bb = useBillboards(16 * 8, {normalShare: 0.1, gain: 8, soft: 0.0});
  let n = 0;
  EVENTS.forEach((e, ei) => {
    const age = f - e.downFrame;
    if (age < 0 || age > 6) return;
    for (let k = 0; k < 8; k++) {
      const i = n++;
      const h1 = hash(ei * 8 + k, 77), h2 = hash(ei * 8 + k, 78);
      const dir = new THREE.Vector3(Math.cos(h1 * 6.28), 0.6 + h2, Math.sin(h1 * 6.28)).normalize();
      const p = CONTACT_WORLD.clone().addScaledVector(dir, 0.004 + 0.003 * age);
      p.y -= 0.0004 * age * age;
      bb.pos.set([p.x, p.y, p.z], i * 3);
      bb.size[i] = 0.0016;
      bb.col.set([1, 0.85, 0.6], i * 3);
      bb.alpha[i] = 1 - age / 6;
    }
  });
  bb.commit(n);
  bb.mesh.visible = n > 0;
  return <BillboardPrim bb={bb} />;
};
