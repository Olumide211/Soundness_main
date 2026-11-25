import React, {useMemo} from 'react';
import * as THREE from 'three';
import {clone as skClone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {getAssets} from '../../lib/assets';
import {pnoise} from '../../lib/noise';

export type Pose = {index: number; middle: number; ring: number; pinky: number; thumbCurl: number; thumbOpp: number; spread?: number};
export const POSES: Record<string, Pose> = {
  penGrip: {index: 0.45, middle: 0.55, ring: 0.8, pinky: 0.85, thumbCurl: 0.3, thumbOpp: 0.7},
  grip: {index: 0.85, middle: 0.9, ring: 0.9, pinky: 0.9, thumbCurl: 0.6, thumbOpp: 0.6},
  pressFinger: {index: 0.15, middle: 0.9, ring: 0.95, pinky: 0.95, thumbCurl: 0.5, thumbOpp: 0.3},
  hold: {index: 0.7, middle: 0.75, ring: 0.8, pinky: 0.8, thumbCurl: 0.3, thumbOpp: 0.8},
  tap: {index: 0.6, middle: 0.7, ring: 0.75, pinky: 0.8, thumbCurl: 0.2, thumbOpp: 0.1},
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
  palmN: THREE.Vector3; fingerF: THREE.Vector3; wrist: THREE.Vector3; mat: THREE.MeshPhysicalMaterial;
};

export const clayMaterial = () => new THREE.MeshPhysicalMaterial({color: '#C99A72', roughness: 0.62, sheen: 0.35, sheenColor: new THREE.Color('#FFD8B0'), sheenRoughness: 0.6, metalness: 0});

function buildRig(side: 'right' | 'left'): Rig {
  const g = side === 'right' ? getAssets().handR : getAssets().handL;
  const root = skClone(g.scene);
  const bones: Record<string, THREE.Bone> = {};
  const mat = clayMaterial();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
      const m = o as THREE.SkinnedMesh;
      m.material = mat; m.frustumCulled = false; m.castShadow = true;
      // smoother, softer clay: recompute normals
      m.geometry = m.geometry.clone(); m.geometry.computeVertexNormals();
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
  return {root, bones, restP, restQ, palmN, fingerF: F, wrist, mat};
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
  /** optional second placement to blend toward (t 0..1) */
  to?: Placement; t?: number;
};

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
  const {side, frame, visible = true, seed = 1, to, t = 0} = props;
  const rig = useMemo(() => buildRig(side), [side]);
  if (visible) {
    let {pos, q} = place(rig, props);
    let pose = props.pose;
    if (to && t > 0) {
      const b = place(rig, to);
      pos = pos.lerp(b.pos, t);
      q = q.slerp(b.q, t);
      pose = mixPose(props.pose, to.pose, t);
    }
    applyPose(rig, pose);
    const tr = new THREE.Euler(0.3 * D2R * pnoise(frame, 70 + seed, 7), 0.3 * D2R * pnoise(frame, 80 + seed, 7), 0.3 * D2R * pnoise(frame, 90 + seed, 7));
    q.multiply(_q.setFromEuler(tr));
    rig.root.quaternion.copy(q);
    rig.root.position.copy(pos);
  }
  rig.root.visible = visible;
  return <primitive object={rig.root} />;
};
