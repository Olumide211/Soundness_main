import * as THREE from 'three';
import morse from '../../../public/hello-film-pack/data/morse_hello.json';
import {WIRE_B, WIRE_B_LEN, KEY} from '../layout';
import {toWorld} from '../../lib/stations';

export const EVENTS = morse.events as {letter: string; symbol: string; downFrame: number; upFrame: number; pulseLaunchFrame: number}[];
export const PULSE_SPEED = 1.2 / 30; // m per frame
export type Pulse = {s: number; len: number; launch: number};

/** all pulses on wire B at frame f (arc-length centre s, length len) */
export function pulsesAt(f: number): Pulse[] {
  const out: Pulse[] = [];
  for (const e of EVENTS) {
    if (f < e.pulseLaunchFrame) continue;
    const len = (e.upFrame - e.downFrame) * PULSE_SPEED;
    // while the key is held the pulse keeps being fed: tail anchored at s=0 until release
    const head = (f - e.pulseLaunchFrame) * PULSE_SPEED;
    const s = head - len / 2;
    if (s - len > WIRE_B_LEN + 0.1) continue;
    out.push({s, len, launch: e.pulseLaunchFrame});
  }
  return out.slice(-16);
}
const _p = new THREE.Vector3();
export function pulseLights(f: number): {pos: THREE.Vector3; k: number}[] {
  // only pulses near the key get a light; each fades in with age and out with distance (no on/off pops)
  const ps = pulsesAt(f).filter((p) => p.s > -p.len && p.s < 0.5).slice(-3);
  return ps.map((p) => {
    const u = Math.min(1, Math.max(0, p.s / WIRE_B_LEN));
    WIRE_B.getPointAt(u, _p);
    const age = f - p.launch;
    const kIn = Math.min(1, Math.max(0, age / 5));
    const kOut = 1 - Math.min(1, Math.max(0, (p.s - 0.2) / 0.3));
    const k = kIn * kIn * (3 - 2 * kIn) * kOut * kOut;
    return {pos: _p.clone().add(new THREE.Vector3(0, 0.035, 0.01)), k};
  });
}
/** smoothed press amount 0..1 for the finger (eased over +-2 f around each event) */
export function pressAmount(f: number) {
  let k = 0;
  for (const e of EVENTS) {
    const a = Math.min(1, Math.max(0, (f - (e.downFrame - 2)) / 2));
    const b = Math.min(1, Math.max(0, ((e.upFrame + 2) - f) / 2));
    const t = Math.min(a, b);
    k = Math.max(k, t * t * (3 - 2 * t));
  }
  return k;
}
export const CONTACT_WORLD = toWorld('telegraph', KEY.contactLocal.x, KEY.contactLocal.y, KEY.contactLocal.z);
export function sparkFlash(f: number) {
  let k = 0;
  for (const e of EVENTS) if (f >= e.downFrame && f < e.downFrame + 2) k = Math.max(k, 1 - (f - e.downFrame) / 2);
  return {pos: CONTACT_WORLD, k};
}
/** key arm angle (deg, negative = down): -4 during [down, up] with 1 f ease in/out */
export function keyArmDeg(f: number) {
  let a = 0;
  for (const e of EVENTS) {
    if (f >= e.downFrame - 1 && f <= e.upFrame + 1) {
      const din = Math.min(1, Math.max(0, f - (e.downFrame - 1)));
      const dout = Math.min(1, Math.max(0, e.upFrame + 1 - f));
      a = Math.min(a, -4 * Math.min(din, dout));
    }
  }
  return a;
}
