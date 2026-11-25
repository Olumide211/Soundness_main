import * as THREE from 'three';
import data from '../../public/hello-film-pack/data/camera_keyframes.json';
import {pnoise} from './noise';
import {smoothstep} from './ease';
import {eraWeights} from './eras';

type Key = {frame: number; position: number[]; target: number[]; fovDeg: number; focusDistance: number; ease: string; beat: string};
const keys: Key[] = (data.keyframes as Key[]).filter((k) => k.frame < 1200); // 24 distinct keys
const N = keys.length;
const L = 1200;

const posCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...(k.position as [number, number, number]))), true, 'centripetal', 0.5);
const tgtCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...(k.target as [number, number, number]))), true, 'centripetal', 0.5);

/** periodic Fritsch–Carlson monotone cubic through (frame_i, y_i), period L */
function makeMonotone(xs: number[], ys: number[], periodicY?: number) {
  const n = xs.length;
  // extended arrays with wrap
  const X = [xs[n - 1] - L, ...xs, xs[0] + L, xs[1] + L];
  const off = periodicY ?? 0;
  const Y = [ys[n - 1] - off, ...ys, ys[0] + off, ys[1] + off];
  const m = X.length;
  const d: number[] = [];
  for (let i = 0; i < m - 1; i++) d.push((Y[i + 1] - Y[i]) / (X[i + 1] - X[i]));
  const t: number[] = new Array(m).fill(0);
  for (let i = 1; i < m - 1; i++) {
    if (d[i - 1] * d[i] <= 0) t[i] = 0;
    else {
      const w1 = 2 * (X[i + 1] - X[i]) + (X[i] - X[i - 1]);
      const w2 = (X[i + 1] - X[i]) + 2 * (X[i] - X[i - 1]);
      t[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x: number) => {
    x = ((x % L) + L) % L;
    let i = 1;
    while (i < m - 2 && X[i + 1] <= x) i++;
    const h = X[i + 1] - X[i];
    const s = (x - X[i]) / h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * Y[i] + (s3 - 2 * s2 + s) * h * t[i] + (-2 * s3 + 3 * s2) * Y[i + 1] + (s3 - s2) * h * t[i + 1];
  };
}
const frames = keys.map((k) => k.frame);
// frame -> curve index (0..N), monotone, C1, periodic (index wraps by N)
const indexOf = makeMonotone(frames, keys.map((_, i) => i), N);
const fovOf = makeMonotone(frames, keys.map((k) => k.fovDeg));
const focusOf = makeMonotone(frames, keys.map((k) => k.focusDistance));

export const SQUARE_ASPECT = 1;
const _p = new THREE.Vector3(), _t = new THREE.Vector3();

export type CamState = {pos: THREE.Vector3; target: THREE.Vector3; fov: number; focus: number; roll: number; shakeUp: number; shakeRight: number};

export function curveU(f: number) {
  const idx = indexOf(f);
  return ((idx / N) % 1 + 1) % 1;
}

/** vertical-only target offsets (§11), blended by era weight */
const V_OFFSET: Record<string, number> = {cave: 0.1, papyrus: -0.04, press: 0.06, telegraph: 0, phone: 0.03, smartphone: 0, chat: 0, ret: 0.1};

export function evalCamera(f: number, vertical = false): CamState {
  const u = curveU(f);
  posCurve.getPoint(u, _p);
  tgtCurve.getPoint(u, _t);
  const pos = _p.clone();
  const target = _t.clone();
  // hand-held micro drift (loops: integer cycles over 1200)
  pos.x += 0.0015 * pnoise(f, 11, 5);
  pos.y += 0.0015 * pnoise(f, 23, 5);
  pos.z += 0.0015 * pnoise(f, 37, 5);
  const roll = THREE.MathUtils.degToRad(0.05) * pnoise(f, 51, 4);
  let fov = fovOf(f);
  if (vertical) {
    const w = eraWeights(f);
    let off = 0;
    for (const k in w) off += (w as any)[k] * (V_OFFSET[k] ?? 0);
    target.y += off;
    pos.y += off * 0.6;
    fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * (1920 / 1080)));
  }
  // impact shake §4
  let shakeUp = 0, shakeRight = 0;
  if (f >= 330 && f <= 345) {
    const d = f - 330;
    const a = 0.004 * Math.exp(-d / 2.5) * Math.sin(d * 2.6);
    shakeUp = a;
    shakeRight = a * 0.7;
  }
  return {pos, target, fov, focus: focusOf(f), roll, shakeUp, shakeRight};
}

/** look-at matrix world for a camera state (without shake) */
export function cameraMatrix(c: CamState): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.lookAt(c.pos, c.target, new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), c.roll);
  q.multiply(r);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const p = c.pos.clone().addScaledVector(up, c.shakeUp).addScaledVector(right, c.shakeRight);
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
}

/** carrier anchor: camera spline 48 f ahead, 0.6 x focus along the view dir */
export function carrierAt(f: number, lead = 48): THREE.Vector3 {
  const c = evalCamera(f + lead);
  const dir = c.target.clone().sub(c.pos).normalize();
  return c.pos.clone().addScaledVector(dir, 0.6 * c.focus);
}

export const smooth = smoothstep;

/** the camera actually used for a shot: credit hold + vertical-only smartphone dolly */
export function shotCamera(rawFrame: number, vertical: boolean, credit: boolean): CamState {
  let f = rawFrame;
  if (credit && rawFrame >= 1200) {
    // ease to a stop just after the loop point (held at the frame-0 pose)
    const d = rawFrame - 1200;
    f = 1200 + 5 * (1 - Math.exp(-d / 5));
  }
  const c = evalCamera(f % 1200 === 0 && f >= 1200 ? 0 : f, vertical);
  if (vertical) {
    const ff = f % 1200;
    const w = smoothstep(690, 722, ff) * (1 - smoothstep(826, 852, ff));
    const k = 1 - 0.6 * w;
    c.pos.sub(c.target).multiplyScalar(k).add(c.target);
  }
  return c;
}

/** DOF bokeh scale per era (storyboards) */
export function bokehAt(f: number) {
  const w = eraWeights(f);
  let b = w.cave * 2 + w.papyrus * 3.5 + w.press * 3 + w.telegraph * 6 + w.phone * 4 + w.smartphone * 2.5 + w.chat * 0;
  return b;
}
