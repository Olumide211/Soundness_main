import * as THREE from 'three';
import {toWorld} from '../lib/stations';
// Shared anchor points (world space) between eras. All pure, computed once.

// press: bed top surface at local y = 0; page 0.30 x 0.21 m centred on the bed
export const PAGE = {w: 0.3, h: 0.21};
// telegraph key (base 0.15 m along local X, knob at +X)
export const KEY = {len: 0.15, knobLocal: new THREE.Vector3(0.062, 0.03, 0.0), termA: new THREE.Vector3(-0.07, 0.0, -0.03), termB: new THREE.Vector3(0.07, 0.0, -0.03), contactLocal: new THREE.Vector3(0.035, 0.008, 0)};

function sagCurve(a: THREE.Vector3, b: THREE.Vector3, sag: number, lead: THREE.Vector3, tail: THREE.Vector3) {
  const pts: THREE.Vector3[] = [a.clone(), a.clone().add(lead)];
  const a2 = a.clone().add(lead), b2 = b.clone().add(tail);
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const p = a2.clone().lerp(b2, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  pts.push(b2, b.clone());
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

/** wire A: printed page right edge -> key terminal A */
export const WIRE_A = sagCurve(
  toWorld('press', PAGE.w / 2 + 0.004, 0.003, 0.0),
  toWorld('telegraph', KEY.termA.x, KEY.termA.y, KEY.termA.z),
  0.02,
  new THREE.Vector3(0.04, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(100)),
  new THREE.Vector3(-0.05, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(150)),
);
/** wire B: key terminal B -> rotary phone base (becomes the curly cord) */
export const PHONE_TERM_LOCAL = new THREE.Vector3(-0.112, -0.04, -0.03);
export const WIRE_B = sagCurve(
  toWorld('telegraph', KEY.termB.x, KEY.termB.y, KEY.termB.z),
  toWorld('phone', PHONE_TERM_LOCAL.x, PHONE_TERM_LOCAL.y, PHONE_TERM_LOCAL.z),
  0.02,
  new THREE.Vector3(0.05, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(150)),
  new THREE.Vector3(-0.06, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(200)),
);
export const WIRE_A_LEN = WIRE_A.getLength();
export const WIRE_B_LEN = WIRE_B.getLength();
/** the cave fire key light anchor (wall-local -0.9,-0.85,0.9) */
export const FIRE_POS = toWorld('cave', -0.9, -0.85, 0.9);

/** papyrus sheet on the lectern: 0.42 x 0.30 m, tilted 55 deg toward camera (normal 35 deg above horizontal) */
export const SHEET = {w: 0.42, h: 0.3, tiltX: -THREE.MathUtils.degToRad(35)};
import {stationMatrix} from '../lib/stations';
export const SHEET_MATRIX = stationMatrix('papyrus').multiply(new THREE.Matrix4().makeRotationX(SHEET.tiltX));
export const sheetToWorld = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z).applyMatrix4(SHEET_MATRIX);
export const SHEET_NORMAL = new THREE.Vector3(0, 0, 1).transformDirection(SHEET_MATRIX);

/** smartphone geometry (metres) */
export const PHONE = {w: 0.0715, h: 0.147, d: 0.0078, scrW: 0.0685, scrH: 0.144, pt: 0.0685 / 390};
/** UI point (390x844 pt space) -> phone-local metres on the screen surface */
export const uiToPhone = (x: number, y: number) => new THREE.Vector3((x - 195) * PHONE.pt, (422 - y) * PHONE.pt, PHONE.d / 2 + 0.0004);
