import * as THREE from "three";
import { mulberry32 } from "../paper/textures";
import { FLIGHT_START, LAND_FRAME, pathPos, pathVel, ROOF_A, ROOF_B } from "../timeline";

export type Bld = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  y0?: number;
  kind: number; // 0 windows, 1 plain, 2 glass
  lit: number;
  tint: number;
  seed: number;
};
export type Light = { x: number; y: number; z: number; phase: number };

const BLOCK = 42;
const STREET = 12;

export function buildCity() {
  const rnd = mulberry32(1234);
  const blds: Bld[] = [];
  const lights: Light[] = [];

  // flight path samples for clearance
  const samples: THREE.Vector3[] = [];
  for (let f = FLIGHT_START; f <= LAND_FRAME; f += 1.5) samples.push(pathPos(f));

  // gap towers: two skyscrapers either side of the path at f266
  const pGap = pathPos(266);
  const tGap = pathVel(266).setY(0).normalize();
  const perp = new THREE.Vector3(tGap.z, 0, -tGap.x);
  const gapTowers = [
    { c: pGap.clone().addScaledVector(perp, 27), h: 560, s: 24 },
    { c: pGap.clone().addScaledVector(perp, -27), h: 640, s: 25 },
  ];

  const reserved: { x0: number; x1: number; z0: number; z1: number }[] = [
    { x0: ROOF_A.x0 - 8, x1: ROOF_A.x1 + 8, z0: ROOF_A.z0 - 8, z1: ROOF_A.z1 + 8 },
    { x0: ROOF_B.x0 - 6, x1: ROOF_B.x1 + 6, z0: ROOF_B.z0 - 6, z1: ROOF_B.z1 + 6 },
    ...gapTowers.map((g) => ({ x0: g.c.x - g.s, x1: g.c.x + g.s, z0: g.c.z - g.s, z1: g.c.z + g.s })),
  ];
  // landmark towers with spires + aviation lights (skyline toward the sun)
  const landmarks = [
    [-60, 1100, 34, 720],
    [-290, 1260, 30, 640],
    [70, 960, 28, 560],
    [-520, 1150, 26, 520],
    [620, 1380, 36, 780],
    [-760, 1420, 30, 600],
    [-210, 1600, 32, 690],
    [880, 1650, 30, 620],
    [-420, -260, 26, 400],
    [380, -180, 24, 360],
    [-220, 420, 24, 380],
  ];
  landmarks.forEach(([x, z, sz]) => reserved.push({ x0: x - sz, x1: x + sz, z0: z - sz, z1: z + sz }));
  const overlapsReserved = (x: number, z: number, w: number, d: number) =>
    reserved.some((r) => x + w / 2 > r.x0 && x - w / 2 < r.x1 && z + d / 2 > r.z0 && z - d / 2 < r.z1);

  const downtown = new THREE.Vector2(-200, 1120);
  const add = (b: Bld) => blds.push(b);

  const N = 58;
  for (let gx = -N; gx <= N; gx++) {
    for (let gz = -N; gz <= N; gz++) {
      const cx = gx * BLOCK;
      const cz = gz * BLOCK;
      const r0 = Math.hypot(cx - 80, cz - 250);
      if (r0 > 2400) continue;
      const far = r0 > 1600;
      const lot = BLOCK - STREET;
      const pattern = rnd();
      const parts: [number, number, number, number][] = [];
      if (pattern < 0.3 || far) parts.push([cx, cz, lot, lot]);
      else if (pattern < 0.65) {
        if (rnd() < 0.5) {
          parts.push([cx - lot / 4, cz, lot / 2, lot]);
          parts.push([cx + lot / 4, cz, lot / 2, lot]);
        } else {
          parts.push([cx, cz - lot / 4, lot, lot / 2]);
          parts.push([cx, cz + lot / 4, lot, lot / 2]);
        }
      } else {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([cx + (sx * lot) / 4, cz + (sz * lot) / 4, lot / 2, lot / 2]);
      }
      for (const [px, pz, pw, pd] of parts) {
        const inset = 0.8 + rnd() * 2.2;
        const w = pw - inset * 2;
        const d = pd - inset * 2;
        if (overlapsReserved(px, pz, w, d)) continue;
        const dd = Math.hypot(px - downtown.x, pz - downtown.y);
        const dFlight = Math.hypot(px - 90, pz - 90);
        const base = 16 + 45 * Math.exp(-Math.pow(dFlight / 900, 2)) + 230 * Math.exp(-Math.pow(dd / 430, 2)) + 40 * Math.exp(-Math.pow(dd / 1100, 2));
        const r = rnd();
        let h = base * (0.45 + 1.1 * Math.pow(r, 1.8)) + 5;
        let kind = rnd() < 0.18 + 0.45 * Math.exp(-Math.pow(dd / 600, 2)) ? 2 : 0;
        const tall = rnd() < 0.05 * Math.exp(-Math.pow(dd / 500, 2)) + 0.003;
        if (tall) {
          h = 240 + rnd() * 240;
          kind = 2;
        }
        // mid-rise district under the flight: stays below the plane
        if (dFlight < 520) h = Math.min(h, 120 + rnd() * 70);
        // keep the flight corridor clear
        let minY = Infinity;
        let minD = Infinity;
        for (const s of samples) {
          const dist = Math.hypot(s.x - px, s.z - pz);
          if (dist < minD) {
            minD = dist;
            minY = s.y;
          }
        }
        const half = Math.max(w, d) / 2;
        if (minD < 60 + half) h = Math.min(h, minY - 80 - rnd() * 50);
        else if (minD < 140 + half) h = Math.min(h, minY - 45 - rnd() * 50);
        // keep the view from rooftop B toward the sun open-ish
        h = Math.max(h, 8);
        const b: Bld = { x: px, z: pz, w, d, h, kind, lit: 0.1 + rnd() * 0.26, tint: rnd(), seed: rnd() * 100 };
        add(b);
        // setback crown on taller buildings
        if (h > 140 && rnd() < 0.55) {
          const ch = 12 + rnd() * 40;
          add({ ...b, w: w * 0.68, d: d * 0.68, y0: h, h: ch, seed: b.seed + 1 });
          if (rnd() < 0.6) lights.push({ x: px, y: h + ch + 1.5, z: pz, phase: rnd() });
        } else if (h > 180 && rnd() < 0.5) {
          lights.push({ x: px + w * 0.4, y: h + 0.8, z: pz + d * 0.4, phase: rnd() });
        }
        // rooftop units
        if (rnd() < 0.35) add({ x: px + (rnd() - 0.5) * w * 0.4, z: pz + (rnd() - 0.5) * d * 0.4, w: 3 + rnd() * 5, d: 3 + rnd() * 5, y0: h, h: 1.5 + rnd() * 3, kind: 1, lit: 0, tint: 0.1, seed: rnd() * 100 });
      }
    }
  }

  const addTower = (x: number, z: number, s: number, h: number, seed: number) => {
    add({ x, z, w: s, d: s, h: h * 0.7, kind: 2, lit: 0.35, tint: 0.8, seed });
    add({ x, z, w: s * 0.78, d: s * 0.78, y0: h * 0.7, h: h * 0.18, kind: 2, lit: 0.35, tint: 0.8, seed: seed + 1 });
    add({ x, z, w: s * 0.5, d: s * 0.5, y0: h * 0.88, h: h * 0.07, kind: 1, lit: 0, tint: 0.2, seed: seed + 2 });
    add({ x, z, w: 1.4, d: 1.4, y0: h * 0.95, h: h * 0.08, kind: 1, lit: 0, tint: 0.2, seed: seed + 3 });
    const top = h * 0.95 + h * 0.08;
    lights.push({ x, y: top + 0.8, z, phase: rnd() });
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ])
      lights.push({ x: x + (sx * s * 0.39), y: h * 0.88 + 0.6, z: z + (sz * s * 0.39), phase: rnd() });
    lights.push({ x: x + s * 0.5, y: h * 0.5, z: z + s * 0.5, phase: rnd() });
  };
  landmarks.forEach(([x, z, s, h], i) => {
    // avoid overlap with corridor removal (simple)
    addTower(x, z, s, h, 500 + i * 7);
  });
  gapTowers.forEach((g, i) => addTower(g.c.x, g.c.z, g.s, g.h, 700 + i * 11));

  // rooftop A (launch)
  {
    const { x0, x1, z0, z1, h } = ROOF_A;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    add({ x: cx, z: cz, w: x1 - x0, d: z1 - z0, h, kind: 2, lit: 0.3, tint: 0.85, seed: 11 });
    const pt = 0.5;
    const ph = 0.7;
    add({ x: cx, z: z0 + pt / 2, w: x1 - x0, d: pt, y0: h, h: ph, kind: 1, lit: 0, tint: 0.9, seed: 1 });
    add({ x: cx, z: z1 - pt / 2, w: x1 - x0, d: pt, y0: h, h: ph, kind: 1, lit: 0, tint: 0.9, seed: 2 });
    add({ x: x0 + pt / 2, z: cz, w: pt, d: z1 - z0, y0: h, h: ph, kind: 1, lit: 0, tint: 0.9, seed: 3 });
    add({ x: x1 - pt / 2, z: cz, w: pt, d: z1 - z0, y0: h, h: ph, kind: 1, lit: 0, tint: 0.9, seed: 4 });
    add({ x: -8, z: -7.5, w: 3, d: 2, y0: h, h: 1.3, kind: 1, lit: 0, tint: 0.1, seed: 5 });
    add({ x: 8.5, z: -7.5, w: 2.2, d: 2.2, y0: h, h: 1.8, kind: 1, lit: 0, tint: 0.5, seed: 6 });
  }
  // rooftop B (landing)
  {
    const { x0, x1, z0, z1, h, parapetTop } = ROOF_B;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    add({ x: cx, z: cz, w: x1 - x0, d: z1 - z0, h, kind: 0, lit: 0.4, tint: 0.5, seed: 21 });
    const pt = 0.8;
    const ph = parapetTop - h;
    add({ x: cx, z: z1 - pt / 2, w: x1 - x0, d: pt, y0: h, h: ph, kind: 1, lit: 0, tint: 0.9, seed: 22 });
    add({ x: cx, z: z0 + pt / 2, w: x1 - x0, d: pt, y0: h, h: ph, kind: 1, lit: 0, tint: 0.9, seed: 23 });
    add({ x: x0 + pt / 2, z: cz, w: pt, d: z1 - z0, y0: h, h: ph, kind: 1, lit: 0, tint: 0.9, seed: 24 });
    add({ x: x1 - pt / 2, z: cz, w: pt, d: z1 - z0, y0: h, h: ph, kind: 1, lit: 0, tint: 0.9, seed: 25 });
    add({ x: 152, z: 0, w: 6, d: 4, y0: h, h: 2.6, kind: 1, lit: 0, tint: 0.1, seed: 26 });
    add({ x: 176, z: 6, w: 4, d: 6, y0: h, h: 3.2, kind: 1, lit: 0, tint: 0.4, seed: 27 });
  }
  return { blds, lights, gapTowers };
}

export function buildCars(count: number) {
  const rnd = mulberry32(99);
  const lanes: number[] = [];
  const cars: number[] = [];
  for (let i = 0; i < count; i++) {
    const axis = rnd() < 0.5 ? 0 : 1;
    const k = Math.floor((rnd() - 0.5) * 70);
    const dir = rnd() < 0.5 ? 1 : -1;
    const streetPos = k * BLOCK + BLOCK / 2 + dir * 2.2;
    // x0/z0: fixed coordinate of the street
    if (axis === 0) lanes.push(0, streetPos, 0, dir);
    else lanes.push(streetPos, 0, 1, dir);
    const kind = dir > 0 ? 1 : 0;
    cars.push(rnd() * 3400, 18 + rnd() * 16, kind);
  }
  return { lanes: new Float32Array(lanes), cars: new Float32Array(cars) };
}
