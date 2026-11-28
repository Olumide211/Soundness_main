import * as THREE from "three";

// ---------------------------------------------------------------------------
// Easing helpers
// ---------------------------------------------------------------------------
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOutCubic = (t: number) => {
  const c = clamp(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
export const easeInOut = (t: number) => {
  const c = clamp(t);
  return c * c * c * (c * (c * 6 - 15) + 10);
};

// ---------------------------------------------------------------------------
// Hermite spline in time (non-uniform Catmull-Rom tangents)
// ---------------------------------------------------------------------------
export type Key = [number, number[]];
export function hermite(keys: Key[], t: number): number[] {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1].slice();
  if (t >= keys[n - 1][0]) return keys[n - 1][1].slice();
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i];
  const [t1, p1] = keys[i + 1];
  const dt = t1 - t0;
  const tangent = (k: number) => {
    if (k <= 0 || k >= n - 1) return keys[k][1].map(() => 0);
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
// World (1 unit = 210 mm, the sheet width)
// ---------------------------------------------------------------------------
export const FPS = 30;
export const DURATION = 360;
export const SHEET_W = 1;
export const SHEET_H = Math.SQRT2; // A4
export const HFOV = 2 * Math.atan(12 / 35); // 35 mm lens (24 mm side across the frame width)
export const vfovFor = (aspect: number) => 2 * Math.atan(Math.tan(HFOV / 2) / aspect);
export const CAM_NEAR = 0.4;
export const CAM_FAR = 42000;

export const ROOF_A = { x0: -42, x1: 42, z0: -80, z1: 1.9, h: 520 };
export const TABLE = { x0: -3.3, x1: 3.3, z0: -2.4, z1: 1.6, top: ROOF_A.h + 3.6, thick: 0.17 };
export const SHEET_REST = 0.0022; // sheet origin above a surface
export const TABLE_POS = new THREE.Vector3(0, TABLE.top + SHEET_REST, -0.3);
export const LEDGE = { x0: 140, x1: 240, z0: 279.15, z1: 280.85, top: 470 };
export const ROOF_B = { x0: 140, x1: 240, z0: 196, z1: 280.85, h: LEDGE.top - 4.5 };
export const LAND_POS = new THREE.Vector3(185.8, LEDGE.top + SHEET_REST, 280);

/** Sky sun (just below the horizon) + warm key light used for the paper. */
export const sunState = (frame: number) => {
  const t = clamp(frame / DURATION);
  const az = THREE.MathUtils.degToRad(8);
  const el = THREE.MathUtils.degToRad(lerp(-0.9, -2.0, t));
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const kaz = THREE.MathUtils.degToRad(52);
  const kel = THREE.MathUtils.degToRad(frame < 290 ? 17 : lerp(17, 30, smoothstep(290, 330, frame)));
  const key = new THREE.Vector3(Math.sin(kaz) * Math.cos(kel), Math.sin(kel), Math.cos(kaz) * Math.cos(kel));
  return { dir, key, dusk: lerp(0.15, 0.6, t) };
};

// ---------------------------------------------------------------------------
// Flight path
// ---------------------------------------------------------------------------
export const LAUNCH = 175;
export const TOUCHDOWN = 304;
export const LANDED = 308;
const YT = TABLE_POS.y;
const YL = LAND_POS.y;
const PATH_KEYS: Key[] = [
  [LAUNCH, [0, YT, TABLE_POS.z]],
  [180, [0, YT, 0.1]],
  [184, [0, YT, 1.25]],
  [188, [0, YT - 0.3, 3.2]],
  [194, [0, YT - 2.1, 7.6]],
  [202, [0, YT - 6.3, 17]],
  [212, [0.4, YT - 12.5, 38]],
  [226, [2.5, YT - 20.5, 80]],
  [242, [9, YT - 28.5, 132]],
  [256, [26, YT - 35.5, 182]],
  [268, [55, YT - 41.5, 222]],
  [280, [98, YT - 47, 256]],
  [291, [140, YL + 3.0, 275]],
  [299, [170, YL + 1.0, 279.6]],
  [TOUCHDOWN, [182.4, YL, 280]],
  [LANDED, [LAND_POS.x, YL, LAND_POS.z]],
];
export const pathPos = (f: number) => {
  const p = hermite(PATH_KEYS, clamp(f, LAUNCH, LANDED));
  const v = new THREE.Vector3(p[0], p[1], p[2]);
  if (v.z < TABLE.z1 + 0.05 && f < 200) v.y = Math.max(v.y, YT); // still sliding on the table
  if (f > 295) v.y = Math.max(v.y, YL); // ledge contact
  return v;
};
export const pathVel = (f: number) => pathPos(f + 0.5).sub(pathPos(f - 0.5));

// heading (azimuth: 0 = +Z, 90° = +X), unwrapped + smoothed
const HEADING: number[] = [];
(() => {
  let prev = 0;
  for (let i = 0; i <= DURATION + 20; i++) {
    let h = prev;
    if (i > 186 && i < TOUCHDOWN) {
      const v = pathPos(i + 2).sub(pathPos(i - 2));
      if (v.x * v.x + v.z * v.z > 1e-4) {
        h = Math.atan2(v.x, v.z);
        while (h - prev > Math.PI) h -= 2 * Math.PI;
        while (h - prev < -Math.PI) h += 2 * Math.PI;
      }
    } else if (i >= TOUCHDOWN) h = Math.PI / 2;
    else h = 0;
    HEADING.push(h);
    prev = h;
  }
  const sm = HEADING.slice();
  for (let i = 0; i < HEADING.length; i++) {
    let s = 0;
    let w = 0;
    for (let k = -7; k <= 7; k++) {
      const j = clamp(i + k, 0, HEADING.length - 1);
      const g = Math.exp(-(k * k) / 24);
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
// Paper transform. Local frame: sheet in XY, printed front = +Z, top = +Y.
// As a plane: nose = +Y, plane-up = -Z.
// ---------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const basisPlane = (F: THREE.Vector3, Up: THREE.Vector3) => {
  const R = new THREE.Vector3().crossVectors(F, Up).normalize();
  const m = new THREE.Matrix4().makeBasis(R.clone().negate(), F, Up.clone().negate());
  return new THREE.Quaternion().setFromRotationMatrix(m);
};
const Q_PHOTO_UP = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))
);
const Q_PLANE_TABLE = basisPlane(new THREE.Vector3(0, 0, 1), UP);
const Q_PLANE_LAND = basisPlane(new THREE.Vector3(1, 0, 0), UP);
export const FLIP1 = [57, 71] as const;
export const FLIP2 = [329, 344] as const;

const flightQuat = (f: number) => {
  const v = pathVel(f);
  const F = v.lengthSq() > 1e-8 ? v.clone().normalize() : new THREE.Vector3(1, 0, 0);
  // the plane slides level on the table, then the nose follows the trajectory
  if (f < 184) F.set(0, 0, 1);
  if (f >= TOUCHDOWN) F.set(1, 0, 0);
  else if (f > 298) F.lerp(new THREE.Vector3(1, 0, 0), smoothstep(298, TOUCHDOWN, f)).normalize();
  const right0 = new THREE.Vector3().crossVectors(F, UP).normalize();
  const pitchAdd = THREE.MathUtils.degToRad(3.5) * smoothstep(190, 205, f) * (1 - smoothstep(296, 303, f));
  F.applyAxisAngle(right0, -pitchAdd).normalize();
  const Up = UP.clone().sub(F.clone().multiplyScalar(F.dot(UP))).normalize();
  const yawRate = (headingAt(f + 2) - headingAt(f - 2)) / 4;
  const flying = smoothstep(186, 196, f) * (1 - smoothstep(298, 304, f));
  const bank = (clamp(-yawRate * 11, -0.45, 0.45) + 0.06 * Math.sin(f * 0.19) + 0.03 * Math.sin(f * 0.43)) * flying;
  Up.applyAxisAngle(F, bank);
  return basisPlane(F, Up);
};

export const paperTransform = (f: number) => {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  if (f < LAUNCH) {
    pos.copy(TABLE_POS);
    const p = easeInOut((f - FLIP1[0]) / (FLIP1[1] - FLIP1[0]));
    pos.y += 0.64 * Math.sin(Math.PI * p);
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI * p);
    quat.copy(Q_PHOTO_UP).premultiply(rot);
    return { pos, quat };
  }
  if (f < LANDED) {
    pos.copy(pathPos(f));
    quat.copy(flightQuat(f));
    return { pos, quat };
  }
  pos.copy(LAND_POS);
  const p = easeInOut((f - FLIP2[0]) / (FLIP2[1] - FLIP2[0]));
  // tiny settle bounce after the flip lands
  const settle = f > FLIP2[1] ? 0.012 * Math.sin(Math.PI * clamp((f - FLIP2[1]) / 3)) : 0;
  pos.y += 0.86 * Math.sin(Math.PI * p) + settle;
  quat.copy(Q_PLANE_LAND).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * p));
  return { pos, quat };
};

/** 0..1 how much the plane is in fast flight (for motion trails). */
export const flightAmount = (f: number) => smoothstep(186, 196, f) * (1 - smoothstep(294, 302, f));

// ---------------------------------------------------------------------------
// Fold state
// ---------------------------------------------------------------------------
export type FoldState = { angles: number[]; curls: number[]; creases: number[] };
// op order: 0 center, 1 cornerR, 2 cornerL, 3 edgeR, 4 edgeL, 5 wingR, 6 wingL, 7 bodyR, 8 bodyL
export const OP_COUNT = 9;
const D = THREE.MathUtils.degToRad;
const PI = Math.PI;

/** ease-in-out to the target at b-2, then a tiny 2-frame overshoot that settles at b. */
const foldTo = (f: number, a: number, b: number, target: number, over: number) => {
  if (f <= a) return 0;
  const main = b - 2;
  if (f < main) return target * easeInOutCubic((f - a) / (main - a));
  if (f < b) return target + over * Math.sin((Math.PI * (f - main)) / 2);
  return target;
};
const liftCurl = (f: number, a: number, b: number, amt: number) => {
  const p = clamp((f - a) / (b - 2 - a));
  return f > a && f < b ? amt * Math.sin(Math.PI * p) : 0;
};
const openAmt = (f: number, a: number, b: number) => 1 - easeInOut((f - a) / (b - a)); // 1 folded -> 0 open

export const foldState = (f: number): FoldState => {
  const angles = new Array(OP_COUNT).fill(0);
  const curls = new Array(OP_COUNT).fill(0);
  const creases = new Array(OP_COUNT).fill(0);
  // memory of the creases flips sign whenever the sheet is turned over so it never digs into a surface
  const s2 = 1 - 2 * easeInOut((f - FLIP2[0]) / (FLIP2[1] - FLIP2[0]));
  const flying = flightAmount(f);

  // 0: half fold lengthwise (lifts up off the table) then open again
  {
    let a: number;
    if (f < 45) a = foldTo(f, 28, 44, D(170), D(3));
    else a = lerp(D(170), D(4), easeInOut((f - 45) / 11));
    if (f > 56) a = 0;
    angles[0] = a;
    curls[0] = liftCurl(f, 28, 44, 0.9) - (f > 45 && f < 56 ? 0.55 * Math.sin((Math.PI * (f - 45)) / 11) : 0);
    creases[0] = smoothstep(36, 43, f);
  }
  // 1,2 corners; 3,4 edges (180° flat folds: overshoot = tiny rebound)
  const flat = [
    [1, 72, 92, 330, 337],
    [2, 75, 95, 330, 337],
    [3, 97, 117, 322, 330],
    [4, 100, 120, 322, 330],
  ] as const;
  for (const [k, a, b, ua, ub] of flat) {
    const folded = foldTo(f, a, b, PI, -D(3.5));
    const o = openAmt(f, ua, ub);
    // only the corner creases keep a little memory (their lines are exact in the flat sheet)
    const resid = k <= 2 ? D(3) * s2 : 0;
    angles[k] = f < ua ? folded : PI * o + resid * (1 - o);
    curls[k] = liftCurl(f, a, b, 1.35) - (f > ua && f < ub ? 0.9 * Math.sin((Math.PI * (f - ua)) / (ub - ua)) : 0);
    creases[k] = smoothstep(a + 8, b - 2, f);
  }
  // 7,8 fold in half (the body stands up on its keel)
  for (const k of [7, 8]) {
    const folded = foldTo(f, 122, 145, D(86), D(3));
    const o = openAmt(f, 314, 323);
    const resid = D(2.5) * s2;
    const breathe = flying * D(1.0) * Math.sin(f * 0.9);
    angles[k] = f < 314 ? folded + breathe : D(86) * o + resid * (1 - o);
    curls[k] = liftCurl(f, 122, 145, 0.5) - (f > 314 && f < 323 ? 0.4 * Math.sin((Math.PI * (f - 314)) / 9) : 0);
    creases[k] = smoothstep(130, 143, f);
  }
  // 5,6 wings + ±2° flutter in flight
  for (const [k, a, b, ph] of [
    [5, 148, 168, 0],
    [6, 151, 171, 1.7],
  ] as const) {
    const folded = foldTo(f, a, b, D(82), D(3));
    const flutter = flying * (D(1.4) * Math.sin(f * 1.35 + ph) + D(0.6) * Math.sin(f * 2.9 + ph * 2));
    const o = openAmt(f, 309, 316);
    angles[k] = f < 309 ? folded + flutter : D(82) * o;
    curls[k] =
      liftCurl(f, a, b, 0.8) + flying * 0.16 * Math.sin(f * 1.7 + ph) - (f > 309 && f < 316 ? 0.6 * Math.sin((Math.PI * (f - 309)) / 7) : 0);
    creases[k] = smoothstep(a + 6, b - 2, f);
  }
  return { angles, curls, creases };
};

// ---------------------------------------------------------------------------
// Camera: one continuous rig. Spherical offset around the paper in its heading
// frame: [azimuth relative to heading (0 = in front, 180 = behind), elevation,
// distance, nose lead, top-down framing shift]
// ---------------------------------------------------------------------------
const CAM_KEYS: Key[] = [
  [0, [180, 56, 3.3, 0, 0]],
  [28, [184, 55, 3.2, 0, 0]],
  [55, [188, 53, 3.35, 0, 0]],
  [64, [190, 54, 4.15, 0, 0]],
  [75, [192, 52, 3.35, 0, 0]],
  [96, [198, 49, 3.1, 0, 0]],
  [120, [203, 46, 3.15, 0, 0]],
  [145, [200, 38, 2.95, 0, 0]],
  [166, [196, 33, 2.6, 0, 0]],
  [178, [186, 26, 2.5, 0.1, 0]],
  [190, [182, 30, 2.65, 0.2, 0]],
  [205, [186, 40, 3.0, 0.15, 0]],
  [214, [189, 50, 2.6, 0.08, 0]],
  [220, [190, 55, 2.5, 0.05, 0]],
  [226, [192, 50, 3.1, 0.03, 0]],
  [236, [190, 10, 5.6, 0, 0]],
  [246, [196, -5, 6.6, 0, 0]],
  [256, [152, -4, 6.0, 0, 0]],
  [267, [114, 3, 3.9, 0.1, 0]],
  [279, [97, -2, 3.5, 0.1, 0]],
  [292, [48, 9, 4.3, 0, 0]],
  [304, [8, 17, 4.5, 0, 0.05]],
  [318, [2, 30, 4.1, 0, 0.12]],
  [334, [0, 62, 4.45, 0, 0.3]],
  [341, [0, 80, 4.3, 0, 0.34]],
  [350, [0, 89.4, 3.65, 0, 0.36]],
  [360, [0, 89.8, 3.6, 0, 0.36]],
];

const targetBase = (f: number) => {
  if (f < LAUNCH) return TABLE_POS.clone();
  if (f < LANDED) return pathPos(f);
  return LAND_POS.clone();
};

export const cameraRaw = (f: number) => {
  const [az, el, dist, lead, shift] = hermite(CAM_KEYS, f);
  const target = targetBase(f);
  if (lead !== 0 && f >= LAUNCH && f < LANDED) {
    const { quat } = paperTransform(f);
    target.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(quat), lead);
  }
  const a = headingAt(f) + THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  const horiz = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  target.addScaledVector(horiz, shift);
  const offset = horiz.clone().multiplyScalar(Math.cos(e) * dist).add(new THREE.Vector3(0, Math.sin(e) * dist, 0));
  // up: world up, turning into "away from the camera" as it goes top-down
  const up = UP.clone().lerp(horiz.clone().negate(), smoothstep(55, 88, el)).normalize();
  return { position: target.clone().add(offset), target, up };
};

export const cameraAt = (f: number) => {
  const pos = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const up = new THREE.Vector3();
  let wsum = 0;
  for (let k = -5; k <= 5; k++) {
    const w = Math.exp(-(k * k) / 10);
    const c = cameraRaw(clamp(f + k * 0.8, 0, DURATION));
    pos.addScaledVector(c.position, w);
    tgt.addScaledVector(c.target, w);
    up.addScaledVector(c.up, w);
    wsum += w;
  }
  pos.multiplyScalar(1 / wsum);
  tgt.multiplyScalar(1 / wsum);
  up.normalize();
  const hand = 1 - smoothstep(340, 350, f);
  pos.x += 0.004 * Math.sin(f * 0.13) * hand;
  pos.y += 0.003 * Math.sin(f * 0.17 + 1.3) * hand;
  return { position: pos, target: tgt, up };
};
