import React from 'react';
import * as THREE from 'three';
import {useBillboards, BillboardPrim} from './Billboards';
import {hash, SEEDS} from '../../lib/rng';
import {flickerVariant} from '../../lib/noise';
import {eraWeights} from '../../lib/eras';
import {toWorld} from '../../lib/stations';
import {smoothstep} from '../../lib/ease';

const E = SEEDS.embers;
const LIFE = 1200 / 13; // ~92 f, divides the loop exactly so embers are periodic
const base = toWorld('cave', 0, 0, 0);
const c1 = new THREE.Color('#FFC872'), c2 = new THREE.Color('#FF7A2A');

/** 60 ambient embers rising through the bottom third of the cave view */
export const Embers: React.FC<{frame: number; rawFrame: number}> = ({frame, rawFrame}) => {
  const bb = useBillboards(60, {normalShare: 0.15, gain: 9, soft: 0.0});
  const w = eraWeights(frame);
  const vis = w.cave;
  if (vis > 0.001) {
    for (let i = 0; i < 60; i++) {
      const phase = hash(i, E) * LIFE;
      const age = (rawFrame + phase) % LIFE;
      const cyc = Math.floor((rawFrame + phase) / LIFE);
      const seed = i * 131 + (((cyc % 13) + 13) % 13) * 7;
      const t = age / 30;
      const x0 = (hash(seed, E + 1) - 0.5) * 2.6;
      const z0 = 0.35 + hash(seed, E + 2) * 1.6;
      const y0 = -0.95 + hash(seed, E + 3) * 0.2;
      const sway = 0.04 * Math.sin(t * (2 + hash(seed, E + 4) * 2) + hash(seed, E + 5) * 6.28) + 0.015 * flickerVariant(rawFrame, i);
      const p = new THREE.Vector3(base.x + x0 + sway, base.y + y0 + 0.12 * t, base.z + z0);
      bb.pos.set([p.x, p.y, p.z], i * 3);
      bb.size[i] = 0.007 + 0.009 * hash(seed, E + 6);
      const k = age / LIFE;
      const a = smoothstep(0, 0.12, k) * (1 - smoothstep(0.55, 1, k)) * vis;
      const c = c1.clone().lerp(c2, k);
      bb.col.set([c.r, c.g, c.b], i * 3);
      bb.alpha[i] = a * (0.6 + 0.4 * hash(seed, E + 7));
    }
    bb.commit();
  }
  bb.mesh.visible = vis > 0.001;
  return <BillboardPrim bb={bb} />;
};
