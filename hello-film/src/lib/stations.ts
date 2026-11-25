import * as THREE from 'three';
import st from '../../public/hello-film-pack/data/stations.json';
export type StationName = 'cave' | 'papyrus' | 'press' | 'telegraph' | 'phone' | 'smartphone';
export const STATIONS = st as Record<StationName, {angleDeg: number; centre: number[]; normal: number[]}>;
export const stationPos = (s: StationName) => new THREE.Vector3(...(STATIONS[s].centre as [number, number, number]));
export const stationRotY = (s: StationName) => THREE.MathUtils.degToRad(STATIONS[s].angleDeg);
export const stationMatrix = (s: StationName) =>
  new THREE.Matrix4().compose(stationPos(s), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), stationRotY(s)), new THREE.Vector3(1, 1, 1));
/** station-local point -> world */
export const toWorld = (s: StationName, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(stationMatrix(s));
export const ERA_BG: Record<string, string> = {
  cave: '#0A0604', papyrus: '#120C08', press: '#0E0C0B', telegraph: '#0B1220', phone: '#0E131D', smartphone: '#1A1922', chat: '#000000', ret: '#0A0604',
};
