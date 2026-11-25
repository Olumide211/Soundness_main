import {smoothstep} from '../lib/ease';
import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {useCurrentFrame} from 'remotion';
import {eraWeights} from '../lib/eras';
import {ERA_BG, StationName, stationPos, stationRotY, STATIONS} from '../lib/stations';
import {getAssets} from '../lib/assets';

export const StationRoot: React.FC<{name: StationName; children?: React.ReactNode}> = ({name, children}) => {
  const p = stationPos(name);
  return (
    <group position={p} rotation={[0, stationRotY(name), 0]}>
      {children}
    </group>
  );
};

const _c = new THREE.Color();
export function eraColour(f: number, out = new THREE.Color()) {
  const w = eraWeights(f);
  out.setRGB(0, 0, 0);
  for (const k in w) {
    const wk = (w as any)[k];
    if (wk > 0) {
      _c.set(ERA_BG[k]);
      out.r += _c.r * wk; out.g += _c.g * wk; out.b += _c.b * wk;
    }
  }
  return out;
}

const BACKDROP: Record<StationName, {floorY: number; floorR: number; tint: string}> = {
  cave: {floorY: -1.65, floorR: 3.0, tint: '#0A0604'},
  papyrus: {floorY: -0.9, floorR: 1.8, tint: '#120C08'},
  press: {floorY: -0.95, floorR: 1.8, tint: '#0E0C0B'},
  telegraph: {floorY: -0.02, floorR: 0.9, tint: '#0B1220'},
  phone: {floorY: -0.06, floorR: 0.9, tint: '#0A0E16'},
  smartphone: {floorY: -0.42, floorR: 1.2, tint: '#1C1B26'},
};

function makeFloorMat(tint: string) {
  const m = new THREE.MeshStandardMaterial({color: new THREE.Color(tint).multiplyScalar(2.2), roughness: 0.92, metalness: 0, transparent: true, depthWrite: false});
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vR;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvR = position.xy;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vR;\nuniform float uR;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\nfloat rr = length(vR)/uR; gl_FragColor.a *= 1.0 - smoothstep(0.35, 1.0, rr);');
    s.uniforms.uR = {value: 1};
    (m as any).userData.shader = s;
  };
  return m;
}

/** false when the camera is within 0.35 m of this station's cyclorama surface (never clip through it) */
function nearCyc(k: StationName, cam: THREE.Vector3) {
  const c = stationPos(k);
  const n = new THREE.Vector3(Math.sin(stationRotY(k)), 0, Math.cos(stationRotY(k)));
  const cx = c.x + n.x * 0.6, cz = c.z + n.z * 0.6;
  const d = Math.hypot(cam.x - cx, cam.z - cz);
  // smooth fade (0 near the surface, 1 well away) instead of a hard toggle: a toggle pops in transit
  const x = Math.abs(d - 2.2);
  const t = Math.min(1, Math.max(0, (x - 0.45) / (1.6 - 0.45)));
  return t * t * (3 - 2 * t);
}
/** cyclorama + soft floor disc for each station; the cave uses its own wall. */
export const Backdrops: React.FC<{camPos: THREE.Vector3}> = ({camPos}) => {
  const frame = useCurrentFrame() % 1200;
  const mats = useMemo(() => {
    const out: Record<string, {cyc: THREE.Material; floor: THREE.Material}> = {};
    for (const k of Object.keys(BACKDROP)) {
      const b = BACKDROP[k as StationName];
      const cyc = new THREE.MeshStandardMaterial({color: new THREE.Color(b.tint).multiplyScalar(1.6), roughness: 1, metalness: 0, side: THREE.BackSide, transparent: true, depthWrite: false});
      const floor = makeFloorMat(b.tint);
      floor.onBeforeCompile = ((orig) => (s: any, r: any) => { orig(s, r); s.uniforms.uR.value = b.floorR; })(floor.onBeforeCompile as any);
      out[k] = {cyc, floor};
    }
    return out;
  }, []);
  return (
    <>
      {(Object.keys(BACKDROP) as StationName[]).map((k) => {
        const b = BACKDROP[k];
        // the smartphone backdrop clears with the ragged screen so the cave shows through it (return, 1040-1072)
        // during the return every other station's backdrop clears (they would silhouette against the rock fill)
        const ret = frame >= 1000 ? (k === 'smartphone' ? smoothstep(1036, 1070, frame) : smoothstep(1030, 1046, frame)) * (1 - smoothstep(1118, 1150, frame)) : 0;
        const fade = k === 'cave' ? 0 : nearCyc(k, camPos) * (1 - ret);
        (mats[k].floor as THREE.MeshStandardMaterial).opacity = 1 - ret;
        (mats[k].cyc as THREE.MeshStandardMaterial).opacity = fade;
        return (
          <StationRoot key={k} name={k}>
            {fade > 0.002 && (
              // arc centred on the station, behind it (local -Z), spanning +-75 deg
              <mesh position={[0, 0.3, 0.6]} material={mats[k].cyc} renderOrder={-2}>
                <cylinderGeometry args={[2.2, 2.2, 3.2, 64, 1, true, Math.PI - THREE.MathUtils.degToRad(78), THREE.MathUtils.degToRad(156)]} />
              </mesh>
            )}
            <mesh visible={ret < 0.999} position={[0, b.floorY, 0.2]} rotation={[-Math.PI / 2, 0, 0]} material={mats[k].floor} renderOrder={-1}>
              <circleGeometry args={[b.floorR, 96]} />
            </mesh>
          </StationRoot>
        );
      })}
    </>
  );
};

/** global environment: fog + clear colour + HDRI env */
export const Environment: React.FC = () => {
  const frame = useCurrentFrame();
  const {scene, gl} = useThree();
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const rt = pm.fromEquirectangular(getAssets().hdr);
    pm.dispose();
    return rt.texture;
  }, [gl]);
  const col = eraColour(frame);
  const w = eraWeights(frame);
  const density = 0.12 * w.cave + 0.18 * (1 - w.cave);
  scene.environment = env;
  scene.background = null;
  if (!scene.fog) scene.fog = new THREE.FogExp2(col.getHex(), density);
  (scene.fog as THREE.FogExp2).color.copy(col);
  (scene.fog as THREE.FogExp2).density = density;
  gl.setClearColor(col, 1);
  return null;
};
export {STATIONS};
