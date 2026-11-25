import * as THREE from 'three';
import {FIRE_POS, PHONE, uiToPhone} from '../layout';
import {cameraMatrix, shotCamera} from '../../lib/camera';
import {SHOT} from '../../lib/shot';
import {stationMatrix} from '../../lib/stations';
import {easeInOutCubic, remap, smoothstep, lerp} from '../../lib/ease';

export const fireAnchorWorld = () => FIRE_POS;

/** the smartphone's resting pose at its station: floating, 15 deg tilt back, gentle bob */
export function phoneStationMatrix(f: number) {
  const bob = 0.002 * Math.sin((f / 30) * 1.3);
  return stationMatrix('smartphone').multiply(
    new THREE.Matrix4().compose(new THREE.Vector3(0, bob, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-THREE.MathUtils.degToRad(15) + 0.0, 0.02 * Math.sin(f / 40), 0)), new THREE.Vector3(1, 1, 1)),
  );
}
export const SOCKET_D = 0.1231;
/** which UI y (pt) sits on the optical axis while the phone rides the camera */
export function socketFocusY(f: number) {
  const v = SHOT.vertical;
  return lerp(v ? 330 : 262, v ? 440 : 468, smoothstep(950, 1012, f));
}
export function socketLocal(f: number) {
  const p = uiToPhone(195, socketFocusY(f));
  return new THREE.Matrix4().makeTranslation(-p.x, -p.y, -(SOCKET_D + p.z));
}
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _s = new THREE.Vector3();
/** world matrix of the smartphone at frame f (station -> camera socket 828-860 -> rides camera to 1110) */
export function phoneWorldMatrix(f: number): THREE.Matrix4 {
  if (f < 828) return phoneStationMatrix(f);
  const ff = Math.min(f, 1110);
  const camM = cameraMatrix(shotCamera(ff, SHOT.vertical, false));
  const sock = camM.clone().multiply(socketLocal(ff));
  void sock;
  if (f >= 860) return sock;
  // blend in camera space so the phone never swings edge-on: start from its pose relative to the 828 camera
  const t = easeInOutCubic(remap(f, 828, 860));
  const cam828 = cameraMatrix(shotCamera(828, SHOT.vertical, false));
  const rel0 = cam828.clone().invert().multiply(phoneStationMatrix(828));
  const rel1 = socketLocal(ff);
  rel0.decompose(_p1, _q1, _s);
  rel1.decompose(_p2, _q2, _s);
  const rel = new THREE.Matrix4().compose(_p1.clone().lerp(_p2, t), _q1.clone().slerp(_q2, t), new THREE.Vector3(1, 1, 1));
  return camM.clone().multiply(rel);
}
export const ORB_UI = {x: 195, y: 520};
/** the orb's world position: on the screen until 1060, then drifts down-left into the fire key light by 1120 */
export function orbWorld(f: number): THREE.Vector3 {
  const onScreen = uiToPhone(ORB_UI.x, ORB_UI.y).add(new THREE.Vector3(0, 0, 0.003)).applyMatrix4(phoneWorldMatrix(Math.min(f, 1110)));
  if (f < 1060) return onScreen;
  const t = easeInOutCubic(remap(f, 1060, 1120));
  // arc: drop below the frame on the way
  const p = onScreen.clone().lerp(FIRE_POS, t);
  p.y -= 0.25 * Math.sin(Math.PI * t) * 0.5;
  return p;
}
export {PHONE};
