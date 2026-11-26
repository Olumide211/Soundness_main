import React, {useMemo, useLayoutEffect} from 'react';
import * as THREE from 'three';
import {RectAreaLightUniformsLib} from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import {useThree} from '@react-three/fiber';
import {useCurrentFrame} from 'remotion';
import {eraWeights} from '../lib/eras';
import {flicker, flickerVariant} from '../lib/noise';
import {StationName, toWorld} from '../lib/stations';
import {smoothstep, easeInCubic, remap} from '../lib/ease';
import {pulseLights, sparkFlash} from './eras/telegraphTiming';
import {fireAnchorWorld} from './eras/returnTiming';

RectAreaLightUniformsLib.init();
/** scene calibration for punctual lights (cd) vs the ACES exposure of 1.0; see DECISIONS.md */
export const CAL = Number((globalThis as any).__CAL ?? 0.12);

type RA = {st: StationName; pos: [number, number, number]; look: [number, number, number]; w: number; h: number; color: string; I: number; era: string};
const RECTS: Record<string, RA> = {
  papyrusKey: {st: 'papyrus', pos: [-0.42, 0.5, 0.42], look: [0, 0, 0], w: 0.8, h: 0.5, color: '#FFE9C4', I: 6, era: 'papyrus'},
  pressRim: {st: 'press', pos: [0.05, 0.55, -0.7], look: [0, 0.05, 0], w: 0.9, h: 0.3, color: '#E4F0FF', I: 9, era: 'press'},
  pressFill: {st: 'press', pos: [0.6, 0.35, 0.7], look: [0, 0.1, 0], w: 0.6, h: 0.6, color: '#FFE2C0', I: 1.6, era: 'press'},
  telKey: {st: 'telegraph', pos: [0, 0.5, 0.05], look: [0, 0, 0], w: 0.6, h: 0.3, color: '#CFE8FF', I: 4, era: 'telegraph'},
  telRim: {st: 'telegraph', pos: [-0.42, 0.22, -0.45], look: [0, 0.02, 0], w: 0.5, h: 0.25, color: '#4C8DFF', I: 8, era: 'telegraph'},
  phoneTop: {st: 'phone', pos: [0, 0.62, 0.1], look: [0, 0, 0], w: 1.2, h: 0.6, color: '#EAF4FF', I: 5, era: 'phone'},
  phoneRimL: {st: 'phone', pos: [-0.4, 0.2, -0.38], look: [0, 0.06, 0], w: 0.08, h: 0.6, color: '#CFE8FF', I: 6, era: 'phone'},
  phoneRimR: {st: 'phone', pos: [0.4, 0.2, -0.38], look: [0, 0.06, 0], w: 0.08, h: 0.6, color: '#CFE8FF', I: 6, era: 'phone'},
  smScreen: {st: 'smartphone', pos: [0, 0, 0.012], look: [0, 0, 1], w: 0.068, h: 0.144, color: '#FFFFFF', I: 1.5, era: 'smartphone'},
  smRim: {st: 'smartphone', pos: [0.05, 0.05, -0.35], look: [0, 0, 0], w: 0.4, h: 0.4, color: '#7C5CFF', I: 4, era: 'smartphone'},
  smKey: {st: 'smartphone', pos: [-0.3, 0.32, 0.3], look: [0, 0, 0], w: 0.3, h: 0.3, color: '#FFFFFF', I: 2, era: 'smartphone'},
};
const ENV: Record<string, number> = {cave: 0.05, papyrus: 0.35, press: 0.8, telegraph: 0.6, phone: 0.8, smartphone: 1.0, chat: 1.0, ret: 0.05};

/** returns fire intensity multiplier (also used by the orb hand-over) */
export function fireWeight(f: number, credit: boolean) {
  const w = eraWeights(f % 1200);
  let fw = w.cave + 0.15 * w.papyrus;
  if (f % 1200 >= 1040) fw = smoothstep(1040, 1150, f % 1200); // hand-over from the orb
  if (credit && f >= 1200) fw *= 1 - 0.1 * easeInCubic(remap(f, 1200, 1230)); // the end card is painted on the firelit cave
  return fw;
}

export const Lights: React.FC<{credit: boolean}> = ({credit}) => {
  const frame = useCurrentFrame();
  const f = frame % 1200;
  const {scene} = useThree();
  const L = useMemo(() => {
    const fire = new THREE.PointLight('#FF9A3C', 40, 0, 2);
    const fill = new THREE.PointLight('#FFC872', 12, 0, 2);
    const papFill = new THREE.PointLight('#E0A458', 3, 0, 2);
    const hemi = new THREE.HemisphereLight('#3A1F12', '#000000', 0.08);
    const spot = new THREE.SpotLight('#FFF1DC', 60, 0, 0.45, 0.8, 2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0005;
    spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 3;
    const pulses = [0, 1, 2].map(() => new THREE.PointLight('#CFE8FF', 2, 0.6, 2));
    const spark = new THREE.PointLight('#FFE8C0', 0, 0.4, 2);
    const rects: Record<string, THREE.RectAreaLight> = {};
    for (const [k, r] of Object.entries(RECTS)) {
      const l = new THREE.RectAreaLight(r.color, r.I, r.w, r.h);
      l.position.copy(toWorld(r.st, ...r.pos));
      l.lookAt(toWorld(r.st, ...r.look));
      rects[k] = l;
    }
    spot.position.copy(toWorld('press', -0.6, 1.1, 0.5)); // warm key, upper left
    spot.target.position.copy(toWorld('press', 0, 0, 0));
    fill.position.copy(toWorld('cave', 0.7, -0.9, 0.8));
    papFill.position.copy(toWorld('papyrus', 0.5, -0.25, 0.45));
    return {fire, fill, papFill, hemi, spot, pulses, spark, rects};
  }, []);

  useLayoutEffect(() => {
    const all = [L.fire, L.fill, L.papFill, L.hemi, L.spot, L.spot.target, L.spark, ...L.pulses, ...Object.values(L.rects)];
    all.forEach((o) => scene.add(o));
    return () => { all.forEach((o) => scene.remove(o)); };
  }, [L, scene]);

  const w = eraWeights(f);
  // fire
  const fw = fireWeight(frame, credit);
  L.fire.intensity = CAL * 40 * flicker(f) * fw;
  const fp = fireAnchorWorld();
  L.fire.position.set(fp.x + 0.02 * flickerVariant(f, 1.1), fp.y + 0.02 * flickerVariant(f, 2.3), fp.z + 0.02 * flickerVariant(f, 3.7));
  L.fill.intensity = CAL * 12 * fw * (0.92 + 0.08 * flicker(f));
  L.papFill.intensity = CAL * 3 * w.papyrus;
  // hemisphere: cave sky/ground then press fill
  L.hemi.intensity = 0.08 * (w.cave) + 0.04 * w.papyrus + 0.28 * w.press + 0.05 * w.telegraph;
  L.hemi.color.set('#3A1F12').lerp(new THREE.Color('#9AA4B0'), smoothstep(200, 260, f) * (1 - smoothstep(1040, 1150, f)));
  // press spot + impact lift
  let impact = 0;
  if (f === 330) impact = 0.15;
  L.spot.intensity = CAL * 0.85 * 60 * w.press * (1 + impact);
  for (const [k, r] of Object.entries(RECTS)) {
    const ew = (w as any)[r.era] as number;
    L.rects[k].intensity = r.I * ew;
  }
  // the smartphone screen light follows the phone onto the camera socket -> fade as it leaves
  L.rects.smScreen.intensity *= 1 - smoothstep(828, 850, f);
  // telegraph pulse lights
  const pl = pulseLights(f);
  L.pulses.forEach((l, i) => {
    const p = pl[i];
    if (p) { l.position.copy(p.pos); l.intensity = CAL * 0.35 * 2 * p.k * Math.max(w.telegraph, w.phone); } else l.intensity = 0;
  });
  const sp = sparkFlash(f);
  L.spark.position.copy(sp.pos);
  L.spark.intensity = sp.k * CAL * 0.12;
  // environment intensity
  let env = 0;
  for (const k in w) env += (w as any)[k] * (ENV[k] ?? 0.5);
  (scene as any).environmentIntensity = env;
  return null;
};
