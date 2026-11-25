import React, {useMemo} from 'react';
import * as THREE from 'three';
import {getAssets} from '../../lib/assets';
import {PigmentData, N_PIGMENT} from './pigmentData';
import {useBillboards, BillboardPrim} from './Billboards';
import {carrierAt, shotMatrix} from '../../lib/camera';
import {onTop} from '../Bridge';
import {curlDrift} from '../../lib/noise';
import {hash, SEEDS} from '../../lib/rng';
import {easeInOutCubic, easeOutCubic, remap, smoothstep, easeInQuad, clamp01} from '../../lib/ease';
import {wallZ} from '../eras/CaveWall';
import {sheetToWorld, SHEET} from '../layout';
import {orbWorld} from '../eras/returnTiming';
import {toWorld} from '../../lib/stations';

const S = SEEDS.pigment;
export type PigTargets = {wall: Float32Array; wallN: Float32Array; sheet: Float32Array; tLandP: Float32Array; strip: Uint8Array; stripIdx: Uint16Array; sx: Float32Array; sy: Float32Array};

/** papyrus landing: 18 horizontal + 14 vertical pith strips */
export function papyrusTarget(i: number) {
  const horiz = hash(i, S + 1) < 0.56;
  if (horiz) {
    const j = Math.floor(hash(i, S + 2) * 18);
    const y = -SHEET.h / 2 + (j + 0.5) * (SHEET.h / 18) + (hash(i, S + 3) - 0.5) * 0.006;
    const x = (hash(i, S + 4) - 0.5) * SHEET.w * 0.98;
    return {x, y, horiz, j};
  }
  const j = Math.floor(hash(i, S + 2) * 14);
  const x = -SHEET.w / 2 + (j + 0.5) * (SHEET.w / 14) + (hash(i, S + 3) - 0.5) * 0.01;
  const y = (hash(i, S + 4) - 0.5) * SHEET.h * 0.98;
  return {x, y, horiz, j};
}
export const papyrusLandTime = (i: number) => 135 + 19 * Math.pow(hash(i, S + 5), 0.85);

let targetsCache: PigTargets | null = null;
export function pigTargets(): PigTargets {
  if (targetsCache) return targetsCache;
  const pig = (getAssets() as any).pigment as PigmentData & {heightAt: (x: number, y: number) => number};
  const wall = new Float32Array(N_PIGMENT * 3), wallN = new Float32Array(N_PIGMENT * 3), sheet = new Float32Array(N_PIGMENT * 3), tLandP = new Float32Array(N_PIGMENT);
  const strip = new Uint8Array(N_PIGMENT), stripIdx = new Uint16Array(N_PIGMENT), sx = new Float32Array(N_PIGMENT), sy = new Float32Array(N_PIGMENT);
  for (let i = 0; i < N_PIGMENT; i++) {
    const x = pig.px[i], y = pig.py[i];
    const h = pig.heightAt(x, y);
    const z = wallZ(x);
    const nrm = new THREE.Vector3(-x / 6, 0, 1).normalize();
    const w = toWorld('cave', x, y, z).addScaledVector(nrm, h * 0.06 - 0.03 + 0.002);
    wall.set([w.x, w.y, w.z], i * 3);
    wallN.set([nrm.x, nrm.y, nrm.z], i * 3);
    const t = papyrusTarget(i);
    const s = sheetToWorld(t.x, t.y, 0.0012);
    sheet.set([s.x, s.y, s.z], i * 3);
    tLandP[i] = papyrusLandTime(i);
    strip[i] = t.horiz ? 1 : 0; stripIdx[i] = t.j; sx[i] = t.x; sy[i] = t.y;
  }
  targetsCache = {wall, wallN, sheet, tLandP, strip, stripIdx, sx, sy};
  return targetsCache;
}

const _d: [number, number, number] = [0, 0, 0];
const parch = new THREE.Color('#E9D8B4');

export const PigmentParticles: React.FC<{frame: number}> = ({frame: f}) => {
  const bb = useBillboards(N_PIGMENT, {normalShare: 0.65, gain: 1.6, soft: 0.15});
  const pig = useMemo(() => (getAssets() as any).pigment as PigmentData, []);
  const T = useMemo(() => pigTargets(), []);
  const active = (f >= 99 && f <= 162) || (f >= 1104 && f <= 1172);
  if (active) {
    const car = carrierAt(f);
    const CM = shotMatrix(f);
    const _c = new THREE.Vector3();
    const orb = f >= 1100 ? orbWorld(f) : null;
    for (let i = 0; i < N_PIGMENT; i++) {
      const o = i * 3;
      const size = 0.0012 + 0.0023 * hash(i, S + 9);
      bb.size[i] = size * 1.4;
      // cloud offset around the carrier (flattened ellipsoid)
      const cx = (hash(i, S + 11) - 0.5) * 0.32, cy = (hash(i, S + 12) - 0.5) * 0.16, cz = (hash(i, S + 13) - 0.5) * 0.24;
      let x = 0, y = 0, z = 0, a = 0;
      let r = pig.col[o], g = pig.col[o + 1], b = pig.col[o + 2];
      if (f < 600) {
        const te = pig.tEmit[i], tl = T.tLandP[i];
        if (f >= te && f < tl + 1) {
          const age = f - te;
          const pop = (0.002 + 0.004 * hash(i, S + 14)) * easeOutCubic(age / 4);
          curlDrift(i * 7 + S, age / 30 * 1.6, _d);
          const dAmp = 0.05 * smoothstep(0, 16, age);
          const lift = easeInQuad(clamp01(age / 30));
          x = T.wall[o] + T.wallN[o] * pop + _d[0] * dAmp + 0.10 * lift;
          y = T.wall[o + 1] + _d[1] * dAmp + 0.06 * lift;
          z = T.wall[o + 2] + T.wallN[o + 2] * pop + _d[2] * dAmp + 0.12 * lift;
          // ride a camera-space cloud (always framed while the bridge covers the transit)
          const s = easeInOutCubic(remap(f, te + 10, tl - 8));
          _c.set(cx * 0.55, cy * 0.7 - 0.01, -(0.42 + cz * 0.6)).applyMatrix4(CM);
          x += (_c.x - x) * s; y += (_c.y - y) * s; z += (_c.z - z) * s;
          // land on the sheet
          const l = easeInOutCubic(remap(f, tl - 12, tl));
          x += (T.sheet[o] - x) * l; y += (T.sheet[o + 1] - y) * l; z += (T.sheet[o + 2] - z) * l;
          a = (f < tl ? 1 : 0) * (0.55 + 0.45 * hash(i, S + 15));
          const c = smoothstep(tl - 14, tl, f);
          r += (parch.r - r) * c; g += (parch.g - g) * c; b += (parch.b - b) * c;
          bb.size[i] *= 1 + 0.6 * (1 - Math.abs(2 * s - 1)) - 0.3 * l;
        }
      } else if (orb) {
        const tl = pig.tLand[i];
        const ts = 1108 + 8 * hash(i, S + 16);
        if (f >= ts && f < tl + 1) {
          const age = f - ts;
          curlDrift(i * 5 + S + 3, age / 30 * 1.4, _d);
          const ox = (hash(i, S + 17) - 0.5) * 0.18, oy = (hash(i, S + 18) - 0.5) * 0.18, oz = (hash(i, S + 19) - 0.5) * 0.18;
          x = orb.x + ox * easeOutCubic(age / 10) + _d[0] * 0.04;
          y = orb.y + oy * easeOutCubic(age / 10) + _d[1] * 0.04;
          z = orb.z + oz * easeOutCubic(age / 10) + _d[2] * 0.04;
          const s = easeInOutCubic(remap(f, ts + 4, tl - 14));
          x += (car.x + cx - x) * s; y += (car.y + cy - y) * s; z += (car.z + cz - z) * s;
          const l = easeInOutCubic(remap(f, tl - 16, tl));
          x += (T.wall[o] - x) * l; y += (T.wall[o + 1] - y) * l; z += (T.wall[o + 2] - z) * l;
          a = (f < tl + 2 ? 1 - smoothstep(tl, tl + 3, f) : 0) * (0.55 + 0.45 * hash(i, S + 15));
          const warm = 1 - smoothstep(ts, ts + 20, f);
          r += (1.0 - r) * warm * 0.6; g += (0.78 - g) * warm * 0.6; b += (0.45 - b) * warm * 0.6;
        }
      }
      bb.pos[o] = x; bb.pos[o + 1] = y; bb.pos[o + 2] = z;
      bb.col[o] = r; bb.col[o + 1] = g; bb.col[o + 2] = b;
      bb.alpha[i] = a;
    }
    bb.commit();
  }
  bb.mesh.visible = active;
  onTop(bb.mesh, active && f < 200);
  return <BillboardPrim bb={bb} renderOrder={active && f < 200 ? 1000 : 5} />;
};
