import * as THREE from "three";

// ---------------------------------------------------------------------------
// Generic easing helpers
// ---------------------------------------------------------------------------
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeInOut = (t: number) => {
  const c = clamp(t);
  return c * c * c * (c * (c * 6 - 15) + 10);
};

/** Damped spring 0 -> 1 with overshoot. */
const spring = (t: number, zeta = 0.42, omega = 11) => {
  if (t <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
};
/** Fold ease: accelerate in, overshoot and settle. */
export const foldEase = (p: number, bounce = true) => {
  const c = clamp(p);
  // remap so spring has essentially settled at p = 1
  const s = spring(easeInOutCubic(c) * 0.62 + c * 0.38, 0.45, 9.5);
  const settled = c >= 1 ? 1 : s + (1 - s) * smoothstep(0.85, 1, c);
  return bounce ? settled : Math.min(settled, 1);
};
/** For 180° folds the paper cannot pass through itself: reflect the overshoot (bounce back). */
export const flatFoldEase = (p: number) => {
  const v = foldEase(p);
  return v > 1 ? 2 - v : v;
};

// ---------------------------------------------------------------------------
// Hermite (non-uniform Catmull-Rom in time) splines
// ---------------------------------------------------------------------------
export type Key<T extends number[]> = [number, T];
export function hermite(keys: Key<number[]>[], t: number, zeroEnds = true): number[] {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1].slice();
  if (t >= keys[n - 1][0]) return keys[n - 1][1].slice();
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i];
  const [t1, p1] = keys[i + 1];
  const dt = t1 - t0;
  const tangent = (k: number) => {
    if (k <= 0 || k >= n - 1) {
      if (zeroEnds) return keys[k][1].map(() => 0);
      const a = keys[Math.max(0, k - 1)];
      const b = keys[Math.min(n - 1, k + 1)];
      return a[1].map((v, j) => (b[1][j] - v) / (b[0] - a[0]));
    }
    const a = keys[k - 1];
    const b = keys[k + 1];
    return a[1].map((v, j) => (b[1][j] - v) / (b[0] - a[0]));
  };
  const m0 = tangent(i);
  const m1 = tangent(i + 1);
  const s = (t - t0) / dt;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return p0.map((v, j) => h00 * v + h10 * dt * m0[j] + h01 * p1[j] + h11 * dt * m1[j]);
}

// ---------------------------------------------------------------------------
// World constants
// ---------------------------------------------------------------------------
export const FPS = 30;
export const DURATION = 360;
export const SHEET_W = 1;
export const SHEET_H = Math.SQRT2; // A4 ratio
export const START_POS = new THREE.Vector3(0, 305.2, 0);
export const ROOF_A = { x0: -14, x1: 14, z0: -10, z1: 6, h: 300 };
export const ROOF_B = { x0: 143, x1: 185, z0: -14, z1: 27, h: 244.2, parapetTop: 245.4 };
export const LAND_POS = new THREE.Vector3(163.5, ROOF_B.parapetTop + 0.003, 26.6);
export const STAND_POS = new THREE.Vector3(163.5, ROOF_B.parapetTop + SHEET_H / 2 + 0.02, 26.6);

/** Sun direction (towards the sun) and the dusk factor drift over time. */
export const sunState = (frame: number) => {
  const t = clamp(frame / DURATION);
  const elev = THREE.MathUtils.degToRad(lerp(6.5, 3.4, t));
  const az = Math.atan2(0.17, 1);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
  return { dir, dusk: lerp(0.0, 0.75, smoothstep(0, 1, t)) };
};

// ---------------------------------------------------------------------------
// Flight path
// ---------------------------------------------------------------------------
export const FLIGHT_START = 190;
export const LAND_FRAME = 317;
const PATH_KEYS: Key<number[]>[] = [
  [190, [0, 305.2, 0]],
  [200, [0, 304.9, 6.5]],
  [212, [0.8, 303.4, 29]],
  [226, [6, 298.2, 67]],
  [241, [30, 288.5, 119]],
  [255, [72, 276.5, 151]],
  [266, [110, 266, 150]],
  [279, [143, 257, 119]],
  [291, [159.5, 251, 75]],
  [300, [162.6, 248.2, 50]],
  [307, [163.3, 246.6, 36]],
  [313, [163.5, 245.65, 28.7]],
  [LAND_FRAME, [163.5, LAND_POS.y, LAND_POS.z]],
];
export const pathPos = (f: number) => {
  const p = hermite(PATH_KEYS, clamp(f, FLIGHT_START, LAND_FRAME));
  return new THREE.Vector3(p[0], p[1], p[2]);
};
export const pathVel = (f: number) => pathPos(f + 0.5).sub(pathPos(f - 0.5));

// Heading table (azimuth measured like the camera: 0 = +Z, +90 = +X), unwrapped
const HEADING: number[] = [];
(() => {
  let prev = 0;
  for (let i = 0; i <= DURATION + 20; i++) {
    let h = prev;
    if (i > FLIGHT_START + 3 && i < LAND_FRAME) {
      const v = pathPos(i + 2).sub(pathPos(i - 2));
      if (v.x * v.x + v.z * v.z > 1e-4) {
        h = Math.atan2(v.x, v.z);
        while (h - prev > Math.PI) h -= 2 * Math.PI;
        while (h - prev < -Math.PI) h += 2 * Math.PI;
      }
    } else if (i >= LAND_FRAME) {
      h = Math.PI;
    } else if (i <= FLIGHT_START + 3) {
      h = 0;
    }
    HEADING.push(h);
    prev = h;
  }
  // smooth
  const sm = HEADING.slice();
  for (let i = 0; i < HEADING.length; i++) {
    let s = 0;
    let w = 0;
    for (let k = -6; k <= 6; k++) {
      const j = clamp(i + k, 0, HEADING.length - 1);
      const g = Math.exp(-(k * k) / 18);
      s += HEADING[j] * g;
      w += g;
    }
    sm[i] = s / w;
  }
  for (let i = 0; i < HEADING.length; i++) HEADING[i] = sm[i];
})();
export const headingAt = (f: number) => {
  const c = clamp(f, 0, HEADING.length - 1.001);
  const i = Math.floor(c);
  return lerp(HEADING[i], HEADING[i + 1], c - i);
};

// ---------------------------------------------------------------------------
// Paper transform (position + orientation of the local sheet frame)
// local: sheet in XY, front (+Z) printed side, top = +Y.
// as a plane: nose = +Y, plane-up = -Z, so local X = -right.
// ---------------------------------------------------------------------------
const basisQuat = (F: THREE.Vector3, Up: THREE.Vector3) => {
  const R = new THREE.Vector3().crossVectors(F, Up).normalize();
  const m = new THREE.Matrix4().makeBasis(R.clone().negate(), F, Up.clone().negate());
  return new THREE.Quaternion().setFromRotationMatrix(m);
};
const Q_SHEET_START = new THREE.Quaternion();
const Q_PLANE_START = basisQuat(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
const Q_SHEET_END = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

const flightQuat = (f: number) => {
  const v = pathVel(f);
  const F = v.lengthSq() > 1e-6 ? v.clone().normalize() : new THREE.Vector3(0, 0, 1);
  if (f >= LAND_FRAME - 1) F.set(0, 0, -1);
  // limit pitch, add a little nose-up attitude while gliding
  const up0 = new THREE.Vector3(0, 1, 0);
  const pitchAdd = THREE.MathUtils.degToRad(4 + 6 * smoothstep(300, 316, f));
  const right0 = new THREE.Vector3().crossVectors(F, up0).normalize();
  F.applyAxisAngle(right0, -pitchAdd).normalize();
  const Up = up0.clone().sub(F.clone().multiplyScalar(F.dot(up0))).normalize();
  // bank from yaw rate
  const yawRate = (headingAt(f + 2) - headingAt(f - 2)) / 4; // rad / frame
  const bank = clamp(-yawRate * 10, -0.5, 0.5) + 0.05 * Math.sin(f * 0.21);
  Up.applyAxisAngle(F, bank);
  return basisQuat(F, Up);
};

export const paperTransform = (f: number) => {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  if (f < 186) {
    const bob = 0.018 * Math.sin(f * 0.11) + 0.008 * Math.sin(f * 0.27 + 1);
    pos.copy(START_POS).add(new THREE.Vector3(0.01 * Math.sin(f * 0.07), bob, 0));
    const sway = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.035 * Math.sin(f * 0.09 + 0.4), 0.06 * Math.sin(f * 0.065), 0.025 * Math.sin(f * 0.08 + 2))
    );
    const turn = easeInOut(smoothstep(124, 180, f));
    quat.copy(Q_SHEET_START).slerp(Q_PLANE_START, turn);
    // nose tilts up while the finished plane hangs
    const tilt = THREE.MathUtils.degToRad(11) * smoothstep(174, 186, f);
    const right = new THREE.Vector3(-1, 0, 0);
    const qTilt = new THREE.Quaternion().setFromAxisAngle(right, -tilt);
    quat.premultiply(qTilt);
    quat.premultiply(sway.slerp(new THREE.Quaternion(), turn * 0.6));
    return { pos, quat };
  }
  if (f < LAND_FRAME) {
    const pf = Math.max(f, FLIGHT_START);
    pos.copy(pathPos(pf));
    if (f < FLIGHT_START) {
      pos.y += 0.018 * Math.sin(f * 0.11) + 0.008 * Math.sin(f * 0.27 + 1);
    }
    const qHang = Q_PLANE_START.clone().premultiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1, 0, 0), -THREE.MathUtils.degToRad(11))
    );
    const qf = flightQuat(Math.max(pf, FLIGHT_START + 4));
    const b = easeInOut(smoothstep(186, 200, f));
    quat.copy(qHang).slerp(qf, b);
    return { pos, quat };
  }
  // landed -> stands up while unfolding
  const s = easeInOut(smoothstep(LAND_FRAME + 1, 343, f));
  pos.copy(LAND_POS).lerp(STAND_POS, s);
  pos.y += 0.06 * Math.sin(Math.PI * s); // lifts a little as it opens
  const qLand = flightQuat(LAND_FRAME - 0.5);
  quat.copy(qLand).slerp(Q_SHEET_END, s);
  const sway = smoothstep(343, 352, f);
  const swayQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.02 * Math.sin(f * 0.1) * sway, 0.03 * Math.sin(f * 0.07 + 1) * sway, 0)
  );
  quat.premultiply(swayQ);
  return { pos, quat };
};

// ---------------------------------------------------------------------------
// Fold state: angle (rad) + curl for each fold op
// ---------------------------------------------------------------------------
export type FoldState = {
  angles: number[]; // per op
  curls: number[]; // per op, curvature of the moving flap
  ripple: number;
  creases: number[]; // crease visibility 0..1 per op
};
// op order: 0 center, 1 cornerR, 2 cornerL, 3 edgeR, 4 edgeL, 5 wingR, 6 wingL, 7 bodyR, 8 bodyL
export const OP_COUNT = 9;
const D = THREE.MathUtils.degToRad;
const PI = Math.PI;

const foldPhase = (f: number, a: number, b: number) => clamp((f - a) / (b - a));

export const foldState = (f: number): FoldState => {
  const angles = new Array(OP_COUNT).fill(0);
  const curls = new Array(OP_COUNT).fill(0);
  const creases = new Array(OP_COUNT).fill(0);

  // unfold progress values (1 = folded, 0 = open)
  const un = (a: number, b: number) => 1 - easeInOut(foldPhase(f, a, b));
  const UN5 = un(317, 324);
  const UN4 = un(322, 330);
  const UN3 = un(328, 337);
  const UN2 = un(334, 344);

  // 0: half fold lengthwise and open again (f30-60)
  {
    const p = foldPhase(f, 30, 60);
    const up = easeInOutCubic(clamp(p / 0.55));
    const down = easeInOut(clamp((p - 0.55) / 0.45));
    angles[0] = lerp(0, D(168), up) * (1 - down) + D(5) * down;
    curls[0] = 0.9 * Math.sin(PI * clamp(p / 0.55)) - 0.6 * Math.sin(PI * clamp((p - 0.55) / 0.45));
    creases[0] = smoothstep(0.35, 0.55, p);
  }
  // 1,2: corners (f60-90), right leads slightly
  for (const [k, a, b] of [
    [1, 60, 86],
    [2, 64, 90],
  ] as const) {
    const p = foldPhase(f, a, b);
    const v = flatFoldEase(p);
    angles[k] = PI * v * UN2 + D(7) * (1 - UN2);
    if (p === 0) angles[k] = 0;
    curls[k] = 1.5 * Math.sin(PI * clamp(p * 1.15)) - 0.9 * Math.sin(PI * (1 - UN2));
    creases[k] = smoothstep(0.55, 0.85, p);
  }
  // 3,4: edges to center (f90-120)
  for (const [k, a, b] of [
    [3, 90, 116],
    [4, 94, 120],
  ] as const) {
    const p = foldPhase(f, a, b);
    const v = flatFoldEase(p);
    angles[k] = PI * v * UN3 + D(7) * (1 - UN3);
    if (p === 0) angles[k] = 0;
    curls[k] = 1.2 * Math.sin(PI * clamp(p * 1.15)) - 0.9 * Math.sin(PI * (1 - UN3));
    creases[k] = smoothstep(0.55, 0.85, p);
  }
  // 5,6: wings (f145-175) + flutter in flight
  const flight = smoothstep(192, 205, f) * (1 - smoothstep(309, 316, f));
  for (const [k, a, b, ph] of [
    [5, 145, 171, 0],
    [6, 149, 175, 1.7],
  ] as const) {
    const p = foldPhase(f, a, b);
    const target = D(82);
    const v = foldEase(p);
    const flutter = flight * (D(2.6) * Math.sin(f * 1.35 + ph) + D(1.4) * Math.sin(f * 2.9 + ph * 2));
    angles[k] = (lerp(0, target, v) + flutter) * UN5 + D(4) * (1 - UN5);
    if (p === 0) angles[k] = 0;
    curls[k] =
      0.9 * Math.sin(PI * clamp(p * 1.1)) +
      flight * 0.22 * Math.sin(f * 1.7 + ph) -
      0.8 * Math.sin(PI * (1 - UN5));
    creases[k] = smoothstep(0.5, 0.85, p);
  }
  // 7,8: fold in half (f120-145)
  for (const k of [7, 8]) {
    const p = foldPhase(f, 120, 145);
    const v = foldEase(p);
    const breathe = flight * D(1.2) * Math.sin(f * 0.9);
    angles[k] = (lerp(0, D(86), v) + breathe) * UN4 + D(4) * (1 - UN4);
    if (p === 0) angles[k] = 0;
    curls[k] = 0.5 * Math.sin(PI * clamp(p * 1.1)) - 0.35 * Math.sin(PI * (1 - UN4));
    creases[k] = smoothstep(0.5, 0.85, p);
  }
  // wind ripple only while the sheet is flat
  const ripple = 1 - smoothstep(26, 33, f) + smoothstep(344, 350, f) * 0.6;
  return { angles, curls, ripple, creases };
};

// ---------------------------------------------------------------------------
// Camera rig: spherical offset around the paper in its heading frame
// ---------------------------------------------------------------------------
// [frame, [azRelDeg, elevDeg, dist, lead]]
const CAM_KEYS: Key<number[]>[] = [
  [0, [-4, 3, 3.35, 0]],
  [30, [6, 4, 3.25, 0]],
  [60, [24, 7, 3.1, 0]],
  [90, [62, 12, 3.0, 0]],
  [118, [118, 18, 2.85, 0]],
  [140, [158, 24, 2.7, 0]],
  [168, [197, 32, 2.25, 0.05]],
  [188, [200, 24, 2.3, 0.15]],
  [204, [186, 14, 3.4, 0.4]],
  [216, [192, 46, 2.05, 0.05]],
  [228, [198, 38, 2.2, 0.2]],
  [242, [205, 30, 2.4, 0.2]],
  [254, [206, 30, 2.3, 0.25]],
  [266, [186, 15, 3.0, 0.3]],
  [280, [150, 9, 3.3, 0.2]],
  [292, [102, 8, 3.5, 0.1]],
  [304, [36, 9, 3.6, 0.05]],
  [317, [4, 5, 3.6, 0]],
  [345, [0, 2.5, 3.45, 0]],
  [360, [0, 2.2, 3.32, 0]],
];

export const cameraRaw = (f: number) => {
  const [az, el, dist, lead] = hermite(CAM_KEYS, f);
  const { pos, quat } = paperTransform(f);
  const target = pos.clone();
  // look slightly ahead of the plane along its nose
  const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
  target.addScaledVector(nose, lead);
  if (f >= LAND_FRAME) {
    // frame the standing sheet (its center rises as it unfolds)
  }
  const heading = headingAt(f);
  const a = heading + THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  const offset = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(dist);
  return { position: target.clone().add(offset), target };
};

export const cameraAt = (f: number) => {
  // gaussian smoothing over neighbouring frames for a single continuous, damped move
  const pos = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  let wsum = 0;
  for (let k = -5; k <= 5; k++) {
    const w = Math.exp(-(k * k) / 10);
    const c = cameraRaw(clamp(f + k * 0.8, 0, DURATION));
    pos.addScaledVector(c.position, w);
    tgt.addScaledVector(c.target, w);
    wsum += w;
  }
  pos.multiplyScalar(1 / wsum);
  tgt.multiplyScalar(1 / wsum);
  // subtle handheld drift
  pos.x += 0.006 * Math.sin(f * 0.13);
  pos.y += 0.005 * Math.sin(f * 0.17 + 1.3);
  return { position: pos, target: tgt };
};
