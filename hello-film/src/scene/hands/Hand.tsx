import React, {useMemo} from 'react';
import * as THREE from 'three';
import {clone as skClone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {getAssets} from '../../lib/assets';
import {pnoise} from '../../lib/noise';
import {spring} from 'remotion';

export type Pose = {index: number; middle: number; ring: number; pinky: number; thumbCurl: number; thumbOpp: number; spread?: number};
export const POSES: Record<string, Pose> = {
  penGrip: {index: 0.45, middle: 0.55, ring: 0.8, pinky: 0.85, thumbCurl: 0.3, thumbOpp: 0.7},
  grip: {index: 0.85, middle: 0.9, ring: 0.9, pinky: 0.9, thumbCurl: 0.6, thumbOpp: 0.6},
  pressFinger: {index: 0.15, middle: 0.9, ring: 0.95, pinky: 0.95, thumbCurl: 0.5, thumbOpp: 0.3},
  hold: {index: 0.7, middle: 0.75, ring: 0.8, pinky: 0.8, thumbCurl: 0.3, thumbOpp: 0.8},
  tap: {index: 0.6, middle: 0.7, ring: 0.75, pinky: 0.8, thumbCurl: 0.2, thumbOpp: 0.1},
  relax: {index: 0.12, middle: 0.18, ring: 0.24, pinky: 0.3, thumbCurl: 0.1, thumbOpp: 0.25, spread: 6},
};
export const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  index: a.index + (b.index - a.index) * t, middle: a.middle + (b.middle - a.middle) * t, ring: a.ring + (b.ring - a.ring) * t,
  pinky: a.pinky + (b.pinky - a.pinky) * t, thumbCurl: a.thumbCurl + (b.thumbCurl - a.thumbCurl) * t, thumbOpp: a.thumbOpp + (b.thumbOpp - a.thumbOpp) * t,
  spread: (a.spread ?? 0) + ((b.spread ?? 0) - (a.spread ?? 0)) * t,
});

const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
const CH = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
const D2R = Math.PI / 180;

type Rig = {
  root: THREE.Object3D; bones: Record<string, THREE.Bone>; restP: Record<string, THREE.Vector3>; restQ: Record<string, THREE.Quaternion>;
  palmN: THREE.Vector3; fingerF: THREE.Vector3; wrist: THREE.Vector3; mat: THREE.MeshPhysicalMaterial; blob: THREE.Mesh;
};

export const clayMaterial = () => new THREE.MeshPhysicalMaterial({color: '#C99A72', roughness: 0.62, sheen: 0.35, sheenColor: new THREE.Color('#FFD8B0'), sheenRoughness: 0.6, metalness: 0});

/** per-era stylised skin (FIX 2) */
export type HandLook = 'cave' | 'papyrus' | 'press' | 'cool';
const LOOKS: Record<HandLook, {base: string; rough: number; sheen: number; sheenCol: string; fleck: number; ink: number; smudge: number; rim: string; rimK: number; thick: number; bump: number}> = {
  cave: {base: '#9A4A24', rough: 0.95, sheen: 0.0, sheenCol: '#FFB070', fleck: 1, ink: 0, smudge: 0, rim: '#FF9A4C', rimK: 0.7, thick: 0.0, bump: 1.4},
  papyrus: {base: '#A85A3A', rough: 0.62, sheen: 0.3, sheenCol: '#FFC9A0', fleck: 0, ink: 1, smudge: 0.0, rim: '#FFD9A8', rimK: 0.45, thick: 0.25, bump: 1.0},
  press: {base: '#A05A3E', rough: 0.6, sheen: 0.3, sheenCol: '#FFC9A0', fleck: 0, ink: 0.7, smudge: 0.35, rim: '#DCEBFF', rimK: 1.0, thick: 0.2, bump: 1.0},
  cool: {base: '#8A665B', rough: 0.55, sheen: 0.3, sheenCol: '#B7A3B4', fleck: 0, ink: 0, smudge: 0, rim: '#CFE8FF', rimK: 0.4, thick: 0.3, bump: 0.8},
};
function skinMaterial() {
  const m = new THREE.MeshPhysicalMaterial({color: '#B9A0A0', roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color('#FFD0C0'), sheenRoughness: 0.55, metalness: 0});
  const u = {
    uBase: {value: new THREE.Color()}, uFleck: {value: 0}, uInk: {value: 0}, uSmudge: {value: 0}, uRim: {value: new THREE.Color()}, uRimK: {value: 0},
    uThick: {value: 0}, uBump: {value: 1},
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTip; attribute vec3 aJ; attribute vec3 aD;\nvarying float vTip; varying vec3 vHP; varying vec3 vJ; varying vec3 vD;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTip = aTip; vHP = position; vJ = aJ; vD = aD;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vTip; varying vec3 vHP; varying vec3 vJ; varying vec3 vD;
uniform vec3 uBase; uniform float uFleck, uInk, uSmudge, uRimK, uThick, uBump; uniform vec3 uRim;
float hh(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x), mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x), mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x), f.y), f.z); }
float creases(){
  vec3 d = vHP - vJ; float sA = dot(d, vD); float r = length(d - sA*vD);
  float c = 0.0;
  c += exp(-pow((sA + 0.0013)/0.00032, 2.0)); c += exp(-pow((sA)/0.00038, 2.0)) * 1.2; c += exp(-pow((sA - 0.0014)/0.0003, 2.0));
  return c * exp(-pow(sA/0.0045, 2.0)) * step(0.0001, dot(vD, vD)) * smoothstep(0.016, 0.006, r);
}
float skinH(){
  float pores = n3(vHP*2600.0)*0.25 + n3(vHP*700.0)*0.5 + n3(vHP*180.0)*0.25;
  return pores * 0.35 - creases() * 0.6;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 c = uBase;
  float big = n3(vHP*120.0);
  c *= 0.9 + 0.2*big;
  // pigment flecks / dust (cave)
  float fl = smoothstep(0.78, 0.86, n3(vHP*900.0 + 3.0));
  c = mix(c, vec3(0.42, 0.06, 0.02), fl * uFleck * 0.8);
  c = mix(c, vec3(0.75, 0.55, 0.30), smoothstep(0.6, 0.9, n3(vHP*400.0 + 9.0)) * uFleck * 0.35);
  // ink-stained fingertips + smudges
  float ink = smoothstep(0.9, 1.0, vTip) * smoothstep(0.5, 0.8, n3(vHP*350.0 + 1.0) + 0.2) * 0.65;
  float sm = smoothstep(0.62, 0.8, n3(vHP*90.0 + 5.0)) * uSmudge;
  c = mix(c, vec3(0.03, 0.02, 0.018), clamp(ink * uInk + sm * 0.75, 0.0, 0.92));
  // knuckle creases slightly darker
  c *= 1.0 - 0.25 * creases();
  diffuseColor.rgb = c; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float hB = skinH();
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float dhx = dFdx(hB), dhy = dFdy(hB);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad * 0.0009 * uBump); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float ndv = abs(dot(normal, normalize(vViewPosition)));
  float fr = pow(1.0 - ndv, 3.0);
  totalEmissiveRadiance += uRim * uRimK * fr * 0.55;
  // warm thickness tint: thin edges and fingertips glow warm (fake subsurface)
  totalEmissiveRadiance += vec3(0.55, 0.12, 0.06) * uThick * (pow(1.0 - ndv, 1.6) * 0.35 + vTip * 0.08) * (0.4 + 0.6*diffuseColor.r); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + 0.12*(n3(vHP*500.0)-0.5), 0.2, 1.0);');
  };
  (m as any).userData.u = u;
  m.customProgramCacheKey = () => 'handSkin';
  return m;
}
export function setLook(m: THREE.MeshPhysicalMaterial, look: HandLook) {
  const L = LOOKS[look];
  const u = (m as any).userData.u;
  u.uBase.value.set(L.base); u.uFleck.value = L.fleck; u.uInk.value = L.ink; u.uSmudge.value = L.smudge;
  u.uRim.value.set(L.rim); u.uRimK.value = L.rimK; u.uThick.value = L.thick; u.uBump.value = L.bump;
  m.roughness = L.rough; m.sheen = L.sheen; m.sheenColor.set(L.sheenCol);
}

/** per-vertex fingertip mask + nearest-joint frame (bind space) for the procedural creases */
function skinAttributes(m: THREE.SkinnedMesh) {
  const g = m.geometry;
  const sk = m.skeleton;
  const jp = sk.boneInverses.map((bi) => new THREE.Vector3().setFromMatrixPosition(bi.clone().invert()).applyMatrix4(m.bindMatrixInverse));
  const names = sk.bones.map((b) => b.name);
  const idx = (n: string) => names.indexOf(n);
  const joints: {p: THREE.Vector3; d: THREE.Vector3}[] = [];
  for (const fi of ['index', 'middle', 'ring', 'pinky']) {
    const ch = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((c) => idx(`${fi}-finger-${c}`));
    for (let k = 0; k < 3; k++) if (ch[k] >= 0 && ch[k + 1] >= 0) joints.push({p: jp[ch[k]], d: jp[ch[k + 1]].clone().sub(jp[ch[k]]).normalize()});
  }
  const th = ['thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'].map(idx);
  for (let k = 0; k < 2; k++) if (th[k] >= 0 && th[k + 1] >= 0) joints.push({p: jp[th[k]], d: jp[th[k + 1]].clone().sub(jp[th[k]]).normalize()});
  const tipBones = new Set(names.map((n, i) => (/phalanx-distal|tip/.test(n) ? i : -1)).filter((i) => i >= 0));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
  const aTip = new Float32Array(pos.count), aJ = new Float32Array(pos.count * 3), aD = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    let t = 0;
    for (let k = 0; k < 4; k++) if (tipBones.has(si.getComponent(i, k))) t += sw.getComponent(i, k);
    aTip[i] = t;
    v.fromBufferAttribute(pos, i);
    let best = -1, bd = 1e9;
    joints.forEach((j, k) => { const d = v.distanceToSquared(j.p); if (d < bd) { bd = d; best = k; } });
    if (best >= 0 && bd < 0.02 * 0.02) { aJ.set(joints[best].p.toArray(), i * 3); aD.set(joints[best].d.toArray(), i * 3); }
  }
  g.setAttribute('aTip', new THREE.BufferAttribute(aTip, 1));
  g.setAttribute('aJ', new THREE.BufferAttribute(aJ, 3));
  g.setAttribute('aD', new THREE.BufferAttribute(aD, 3));
}

const blobMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false,
  uniforms: {uA: {value: 0}},
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'varying vec2 vUv; uniform float uA; void main(){ vec2 p = (vUv-0.5)*2.0; float d = dot(p,p); gl_FragColor = vec4(0.0,0.0,0.0, uA * exp(-d*3.2) * (1.0 - smoothstep(0.8,1.0,d))); }',
});

function buildRig(side: 'right' | 'left'): Rig {
  const g = side === 'right' ? getAssets().handR : getAssets().handL;
  const root = skClone(g.scene);
  const bones: Record<string, THREE.Bone> = {};
  const mat = skinMaterial();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
      const m = o as THREE.SkinnedMesh;
      m.material = mat; m.frustumCulled = false; m.castShadow = true;
      // smoother, softer clay: recompute normals
      m.geometry = m.geometry.clone(); m.geometry.computeVertexNormals();
      skinAttributes(m);
    }
  });
  const restP: Record<string, THREE.Vector3> = {}, restQ: Record<string, THREE.Quaternion> = {};
  for (const [k, b] of Object.entries(bones)) { restP[k] = b.position.clone(); restQ[k] = b.quaternion.clone(); }
  const wrist = restP['wrist'];
  const F = restP['middle-finger-tip'].clone().sub(wrist).normalize();
  const A = restP['pinky-finger-phalanx-proximal'].clone().sub(restP['index-finger-phalanx-proximal']).normalize();
  const c = new THREE.Vector3().crossVectors(F, A).normalize();
  const s = Math.sign(restP['thumb-tip'].clone().sub(restP['index-finger-phalanx-proximal']).dot(c)) || 1;
  const palmN = c.multiplyScalar(s);
  // forearm (clay), not skinned
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.34, 8, 24), mat);
  arm.scale.set(1, 1, 0.78);
  const up = F.clone().negate();
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  arm.position.copy(wrist).addScaledVector(up, 0.19).addScaledVector(palmN, -0.004);
  arm.castShadow = true;
  root.add(arm);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat());
  blob.frustumCulled = false; blob.matrixAutoUpdate = false;
  return {root, bones, restP, restQ, palmN, fingerF: F, wrist, mat, blob};
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
/** apply a pose (armature space FK on the flat WebXR joint list); returns posed joint positions */
function applyPose(r: Rig, p: Pose) {
  const posed: Record<string, THREE.Vector3> = {};
  for (const fi of FINGERS) {
    const names = CH.map((c) => `${fi}-finger-${c}`);
    const amt = (p as any)[fi] as number;
    const P = names.map((n) => r.restP[n]);
    const dir = P[4].clone().sub(P[1]).normalize();
    const axis = new THREE.Vector3().crossVectors(dir, r.palmN).normalize();
    const angles = [70, 95, 60].map((a) => a * amt * D2R);
    const spreadAx = r.palmN;
    const sp = ((p.spread ?? 0) * D2R) * ({index: -1, middle: -0.3, ring: 0.4, pinky: 1} as any)[fi];
    let R = new THREE.Quaternion().setFromAxisAngle(spreadAx, sp);
    const Q: THREE.Vector3[] = [P[0].clone(), P[1].clone()];
    r.bones[names[0]].position.copy(P[0]); r.bones[names[0]].quaternion.copy(r.restQ[names[0]]);
    for (let k = 1; k <= 3; k++) {
      R = new THREE.Quaternion().setFromAxisAngle(axis, angles[k - 1]).multiply(R);
      const b = r.bones[names[k]];
      b.position.copy(Q[k]);
      b.quaternion.copy(R).multiply(r.restQ[names[k]]);
      Q.push(Q[k].clone().add(P[k + 1].clone().sub(P[k]).applyQuaternion(R)));
    }
    const tip = r.bones[names[4]];
    tip.position.copy(Q[4]); tip.quaternion.copy(R).multiply(r.restQ[names[4]]);
    names.forEach((n, k) => (posed[n] = Q[k] ?? P[k]));
  }
  // thumb: opposition swings the whole chain about the metacarpal toward the palm, then curls
  const tn = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
  const TP = tn.map((n) => r.restP[n]);
  const oppAxis = r.fingerF.clone();
  const Ropp = new THREE.Quaternion().setFromAxisAngle(oppAxis, -Math.sign(_v.copy(TP[3]).sub(r.wrist).dot(new THREE.Vector3().crossVectors(r.fingerF, r.palmN))) * p.thumbOpp * 55 * D2R);
  const tdir = TP[3].clone().sub(TP[0]).normalize();
  const tax = new THREE.Vector3().crossVectors(tdir, r.palmN).normalize();
  let R = Ropp.clone();
  const Q: THREE.Vector3[] = [TP[0].clone()];
  const tAng = [0, 35, 60].map((a) => a * p.thumbCurl * D2R);
  for (let k = 0; k < 3; k++) {
    R = new THREE.Quaternion().setFromAxisAngle(tax.clone().applyQuaternion(Ropp), tAng[k]).multiply(R);
    const b = r.bones[tn[k]];
    b.position.copy(Q[k]); b.quaternion.copy(R).multiply(r.restQ[tn[k]]);
    Q.push(Q[k].clone().add(TP[k + 1].clone().sub(TP[k]).applyQuaternion(R)));
  }
  r.bones[tn[3]].position.copy(Q[3]); r.bones[tn[3]].quaternion.copy(R).multiply(r.restQ[tn[3]]);
  tn.forEach((n, k) => (posed[n] = Q[k]));
  return posed;
}

export type Placement = {pose: Pose; effector: string; target: THREE.Vector3; fingerDir: THREE.Vector3; palmDir: THREE.Vector3};
export type HandProps = Placement & {
  side: 'right' | 'left';
  frame: number;
  visible?: boolean;
  seed?: number;
  /** optional second placement to blend toward (t 0..1); the finger pose follows it with a spring (damping 12) */
  to?: Placement; t?: number;
  look?: HandLook;
  /** surface under the hand for the soft contact shadow */
  ground?: {point: THREE.Vector3; normal: THREE.Vector3};
  /** frame the hand entered: fingers settle from a relaxed pose with spring overshoot */
  enterFrame?: number;
};
/** remotion spring (damping 12) evaluated at a 0..1 progress over ~1 s, ends exactly at 1 */
export function springT(t: number) {
  if (t <= 0) return 0; if (t >= 1) return 1;
  const v = spring({frame: t * 30, fps: 30, config: {damping: 12}});
  const end = spring({frame: 30, fps: 30, config: {damping: 12}});
  return v + (1 - end) * t;
}

function place(rig: Rig, pl: Placement) {
  const posed = applyPose(rig, pl.pose);
  const lF = rig.fingerF.clone(), lN = rig.palmN.clone().sub(lF.clone().multiplyScalar(rig.palmN.dot(lF))).normalize();
  const lB = new THREE.Matrix4().makeBasis(lF, lN, new THREE.Vector3().crossVectors(lF, lN));
  const fd = pl.fingerDir.clone().normalize();
  const wN = pl.palmDir.clone().sub(fd.clone().multiplyScalar(pl.palmDir.dot(fd))).normalize();
  const wB = new THREE.Matrix4().makeBasis(fd, wN, new THREE.Vector3().crossVectors(fd, wN));
  const q = new THREE.Quaternion().setFromRotationMatrix(wB.multiply(lB.transpose()));
  const tipL = posed[pl.effector] ?? rig.restP[pl.effector];
  const pos = pl.target.clone().sub(tipL.clone().applyQuaternion(q));
  return {pos, q};
}

/** analytic placement: the hand is rotated to (fingerDir, palmDir) and translated so the effector hits the target */
export const Hand: React.FC<HandProps> = (props) => {
  const {side, frame, visible = true, seed = 1, to, t = 0, look = 'cool', ground, enterFrame} = props;
  const rig = useMemo(() => buildRig(side), [side]);
  setLook(rig.mat, look);
  let blobOn = false;
  if (visible) {
    let {pos, q} = place(rig, props);
    let pose = props.pose;
    if (enterFrame !== undefined) pose = mixPose(POSES.relax, pose, Math.min(1.15, spring({frame: frame - enterFrame, fps: 30, config: {damping: 12}})));
    if (to && t > 0) {
      const b = place(rig, to);
      pos = pos.lerp(b.pos, t);
      q = q.slerp(b.q, t);
      pose = mixPose(pose, to.pose, springT(t));
    }
    applyPose(rig, pose);
    if (ground) {
      // soft contact shadow: palm centre projected on the surface; tighter and darker as the hand gets closer
      const palm = rig.restP['middle-finger-phalanx-proximal'].clone().lerp(rig.wrist, 0.4).applyQuaternion(q).add(pos);
      const n = ground.normal.clone().normalize();
      const h = palm.clone().sub(ground.point).dot(n);
      const c = palm.clone().addScaledVector(n, -h + 0.0008);
      const fdir = rig.fingerF.clone().applyQuaternion(q); fdir.addScaledVector(n, -fdir.dot(n)).normalize();
      const side2 = new THREE.Vector3().crossVectors(n, fdir);
      const sz = 0.09 + 0.9 * Math.max(0, h);
      const M = new THREE.Matrix4().makeBasis(fdir.multiplyScalar(sz * 1.5), side2.multiplyScalar(sz), n).setPosition(c);
      rig.blob.matrix.copy(M); rig.blob.matrixWorldNeedsUpdate = true;
      (rig.blob.material as THREE.ShaderMaterial).uniforms.uA.value = 0.6 * Math.exp(-Math.max(0, h) / 0.07);
      blobOn = h > -0.01 && h < 0.35;
    }
    const tr = new THREE.Euler(0.3 * D2R * pnoise(frame, 70 + seed, 7), 0.3 * D2R * pnoise(frame, 80 + seed, 7), 0.3 * D2R * pnoise(frame, 90 + seed, 7));
    q.multiply(_q.setFromEuler(tr));
    rig.root.quaternion.copy(q);
    rig.root.position.copy(pos);
  }
  rig.root.visible = visible;
  rig.blob.visible = visible && blobOn;
  return (
    <>
      <primitive object={rig.root} />
      <primitive object={rig.blob} />
    </>
  );
};
