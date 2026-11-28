import * as THREE from 'three';
import { clamp, lerp, smoothstep, easeInOutCubic, easeOutCubic, easeInOutSine } from './lib/math';
import { noise1 } from './lib/rng';

export const FPS = 30;
export const TOTAL = 1020;
export const INTRO = 60;
export const SEG = 108;
export const NSEG = 8;
export const segStart = (i: number) => INTRO + i * SEG;
export const OUTRO = segStart(NSEG); // 924
export const CREDIT = TOTAL - 45; // last 1.5s
export const R_ORB = 3;
export const SPACING = 45;
export const objX = (i: number) => i * SPACING;

export type ObjSpec = { name: string; cx: number; cy: number; cz: number; D0: number; D1: number; ty: number; el?: number };
export const OBJ: ObjSpec[] = [
  { name: 'ICE', cx: 0, cy: 5.0, cz: 0, D0: 50, D1: 41, ty: 5.0, el: 11 },
  { name: 'CHOCOLATE', cx: 0, cy: 1.8, cz: 0, D0: 52, D1: 43, ty: 4.0 },
  { name: 'CANDLE', cx: 1.9, cy: 10.0, cz: 0.7, D0: 60, D1: 50, ty: 7.5 },
  { name: 'SODA', cx: 0, cy: 6.4, cz: 0, D0: 60, D1: 51, ty: 5.5 },
  { name: 'PAPER', cx: 0, cy: 1.0, cz: 0, D0: 54, D1: 45, ty: 3.5 },
  { name: 'JELLY', cx: 0, cy: 6.0, cz: 0, D0: 52, D1: 43, ty: 5.0 },
  { name: 'WATERMELON', cx: 0, cy: 6.0, cz: 0, D0: 60, D1: 50, ty: 5.5 },
  { name: 'STEEL', cx: 0, cy: 5.0, cz: 0, D0: 54, D1: 46, ty: 5.0 },
];
export const hoverY = (i: number) => OBJ[i].cy + R_ORB + 9;

/** segment index + local frame. Before the first segment i = -1. */
export function segOf(frame: number) {
  if (frame < INTRO) return { i: -1, t: frame - INTRO };
  const i = Math.min(NSEG - 1, Math.floor((frame - INTRO) / SEG));
  return { i, t: frame - segStart(i) };
}

/** Whip-pan spring step response (rest -> 1, slight overshoot, settles). tau in frames. */
const WZ = 0.8, WW = 0.52, WD = WW * Math.sqrt(1 - WZ * WZ);
export function whipW(tau: number) {
  if (tau <= 0) return 0;
  if (tau > 40) return 1;
  const e = Math.exp(-WZ * WW * tau);
  return 1 - e * (Math.cos(WD * tau) + ((WZ * WW) / WD) * Math.sin(WD * tau));
}
export const whipV = (tau: number) => (whipW(tau + 0.5) - whipW(tau - 0.5));

// ---------- reaction progress functions shared by orb rig & objects ----------
export const u60 = (t: number) => clamp((t - 40) / 60);
export const iceMelt = (t: number) => { const u = u60(t); return 0.55 * Math.pow(u, 1.15) + 0.45 * (1 - Math.pow(1 - u, 2)) * u; };
export const iceTop = (m: number) => 5.0 - 3.15 * m;
export const jellyMelt = (t: number) => Math.pow(smoothstep(56, 102, t), 1.15);
export function jellySquash(t: number) {
  // damped spring response after impact at t=40, plus a static press
  const tau = t - 40;
  if (tau < 0) return 0;
  const press = 0.08 * easeOutCubic(clamp(tau / 6));
  return press + 0.17 * Math.exp(-tau / 13) * Math.sin(0.58 * tau);
}
export const jellyTop = (t: number) => 6.0 * (1 - jellySquash(t)) * (1 - 0.84 * jellyMelt(t));
export const sodaDent = (t: number) => 2.4 * easeOutCubic(clamp((t - 40) / 44));

function orbYReact(i: number, t: number) {
  const u = u60(t);
  switch (i) {
    case 0: { const m = iceMelt(t); return iceTop(m) + R_ORB - 1.5 * Math.pow(m, 0.8); }
    case 1: return 1.8 + R_ORB - 1.05 * Math.pow(u, 0.7);
    case 2: return 10 + R_ORB - 0.9 * Math.pow(u, 0.8);
    case 3: return 6.4 + R_ORB - sodaDent(t);
    case 4: return 1.0 + R_ORB - 0.55 * Math.pow(u, 1.2);
    case 5: { const press = 0.85 * easeOutCubic(clamp((t - 40) / 8)); return jellyTop(t) + R_ORB - press; }
    case 6: return 6.0 + R_ORB - 2.6 * (1 - Math.pow(1 - u, 2));
    default: return 5.0 + R_ORB;
  }
}

function orbLocal(i: number, t: number) {
  const contact = OBJ[i].cy + R_ORB;
  const hov = hoverY(i);
  if (t < 20) return hov + 0.12 * Math.sin(t * 0.21);
  if (t < 40) {
    const p = (t - 20) / 20;
    return lerp(hov + 0.12 * Math.sin(20 * 0.21), contact, easeInOutSine(p));
  }
  return orbYReact(i, Math.min(t, i === NSEG - 1 ? 1e9 : 100));
}

export type OrbState = { pos: THREE.Vector3; heat: number; jaw: number; lift: number; seg: number; t: number };

export function orbState(frame: number, out = new THREE.Vector3()): OrbState {
  const { i, t } = segOf(frame);
  let heat = 1;
  let jaw = 0, lift = 0;
  if (i < 0) {
    const f = frame;
    heat = 0.8 + 0.2 * smoothstep(0, 40, f);
    out.set(objX(0) + OBJ[0].cx, hoverY(0) - 4.5 * (1 - easeOutCubic(clamp(f / 44))), OBJ[0].cz);
    return { pos: out, heat, jaw, lift, seg: i, t };
  }
  const X = objX(i) + OBJ[i].cx;
  // arriving whip (residual settle) for t < 20
  if (i > 0 && t < 20) {
    const tau = t + 8;
    const w = whipW(tau);
    const xp = objX(i - 1) + OBJ[i - 1].cx;
    const y0 = orbYReact(i - 1, 100);
    const wy = easeOutCubic(clamp(tau / 11));
    const y = lerp(y0, orbLocal(i, t), wy) + 1.2 * Math.sin(Math.PI * clamp(tau / 11));
    out.set(lerp(xp, X, w), y, lerp(OBJ[i - 1].cz, OBJ[i].cz, w));
    return { pos: out, heat, jaw, lift, seg: i, t };
  }
  if (t >= 100 && i < NSEG - 1) {
    const tau = t - 100;
    const w = whipW(tau);
    const xn = objX(i + 1) + OBJ[i + 1].cx;
    const y0 = orbYReact(i, 100);
    const wy = easeOutCubic(clamp(tau / 11));
    const y = lerp(y0, hoverY(i + 1), wy) + 1.2 * Math.sin(Math.PI * clamp(tau / 11));
    out.set(lerp(X, xn, w), y, lerp(OBJ[i].cz, OBJ[i + 1].cz, w));
    return { pos: out, heat, jaw, lift, seg: i, t };
  }
  out.set(X, orbLocal(i, t), OBJ[i].cz);
  if (i === NSEG - 1) {
    jaw = smoothstep(47, 56, t);
    lift = Math.pow(clamp((t - 54) / 30), 2) * 70;
  }
  return { pos: out, heat, jaw, lift, seg: i, t };
}

// ---------------- camera ----------------
const EL = (17 * Math.PI) / 180;
const AZ = (9 * Math.PI) / 180;
function camSeg(i: number, t: number) {
  const o = OBJ[i];
  let D = lerp(o.D0, o.D1, easeInOutSine(clamp(t / 100)));
  let ty = o.ty;
  if (i === NSEG - 1 && t > 100) { D = o.D1 + 6 * easeInOutSine(clamp((t - 100) / 40)); ty = o.ty + 7.5 * easeInOutSine(clamp((t - 100) / 40)); }
  return { tx: objX(i) + o.cx * 0.4, ty, tz: o.cz * 0.4, D, el: ((o.el ?? 17) * Math.PI) / 180 };
}

export type CamState = { pos: THREE.Vector3; target: THREE.Vector3; roll: number; pitch: number; yaw: number };

export function camState(frame: number, out?: CamState): CamState {
  const res = out ?? { pos: new THREE.Vector3(), target: new THREE.Vector3(), roll: 0, pitch: 0, yaw: 0 };
  const { i, t } = segOf(frame);
  let tx: number, ty: number, tz: number, D: number, el = EL, lead = 0;
  if (i < 0) {
    const p = easeInOutCubic(clamp(frame / 62));
    const orb = orbState(frame).pos;
    const c = camSeg(0, 0);
    tx = lerp(orb.x, c.tx, p); ty = lerp(orb.y - 0.6, c.ty, p); tz = lerp(orb.z, c.tz, p);
    D = lerp(25, c.D, p);
    el = lerp((7 * Math.PI) / 180, c.el, p);
  } else if (i > 0 && t < 20) {
    const tau = t + 8;
    const a = camSeg(i - 1, 100), b = camSeg(i, t);
    const w = whipW(tau);
    tx = lerp(a.tx, b.tx, w); ty = lerp(a.ty, b.ty, w); tz = lerp(a.tz, b.tz, w); D = lerp(a.D, b.D, w); el = lerp(a.el, b.el, w);
    lead = whipV(tau) * (b.tx - a.tx) * 0.0;
  } else if (t >= 100 && i < NSEG - 1) {
    const tau = t - 100;
    const a = camSeg(i, 100), b = camSeg(i + 1, 0);
    const w = whipW(tau);
    tx = lerp(a.tx, b.tx, w); ty = lerp(a.ty, b.ty, w); tz = lerp(a.tz, b.tz, w); D = lerp(a.D, b.D, w); el = lerp(a.el, b.el, w);
    lead = whipV(tau) * (b.tx - a.tx) * 0.0;
  } else {
    const c = camSeg(i, t);
    tx = c.tx; ty = c.ty; tz = c.tz; D = c.D; el = c.el;
  }
  res.target.set(tx + lead, ty, tz);
  res.pos.set(tx + D * Math.sin(AZ) * Math.cos(el), ty + D * Math.sin(el), tz + D * Math.cos(AZ) * Math.cos(el));
  // gentle handheld drift ±0.3°
  const A = (0.3 * Math.PI) / 180;
  const f = frame * 0.035;
  res.yaw = A * (0.7 * noise1(f, 11) + 0.3 * noise1(f * 2.3, 12));
  res.pitch = A * (0.7 * noise1(f, 21) + 0.3 * noise1(f * 2.1, 22));
  res.roll = A * (0.7 * noise1(f * 0.8, 31) + 0.3 * noise1(f * 1.9, 32));
  return res;
}

export function applyCam(cam: THREE.PerspectiveCamera, s: CamState) {
  cam.position.copy(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(s.target);
  cam.rotateY(s.yaw);
  cam.rotateX(s.pitch);
  cam.rotateZ(s.roll);
  cam.updateMatrixWorld(true);
}
