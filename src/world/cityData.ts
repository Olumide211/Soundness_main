import * as THREE from "three";
import { mulberry32 } from "../paper/textures";
import { LANDED, LAUNCH, pathPos, ROOF_A, ROOF_B } from "../timeline";
import { RIVER, riverZ } from "./shaders";

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

export const BLOCK = 200;
const STREET = 50;

// cheap 2D value noise for district variation
const vnoise = (() => {
  const r = mulberry32(5);
  const g = new Float32Array(64 * 64).map(() => r());
  const at = (i: number, j: number) => g[(((j % 64) + 64) % 64) * 64 + (((i % 64) + 64) % 64)];
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j);
    const b = at(i + 1, j);
    const c = at(i, j + 1);
    const d = at(i + 1, j + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
})();

export function buildCity() {
  const rnd = mulberry32(2024);
  const blds: Bld[] = [];
  const lights: Light[] = [];
  const add = (b: Bld) => blds.push(b);

  const samples: THREE.Vector3[] = [];
  for (let f = LAUNCH; f <= LANDED; f += 1) samples.push(pathPos(f));

  const reserved = [
    { x0: ROOF_A.x0 - 45, x1: ROOF_A.x1 + 45, z0: ROOF_A.z0 - 45, z1: ROOF_A.z1 + 45 },
    { x0: ROOF_B.x0 - 45, x1: ROOF_B.x1 + 45, z0: ROOF_B.z0 - 45, z1: ROOF_B.z1 + 60 },
  ];
  const overlaps = (x: number, z: number, w: number, d: number) =>
    reserved.some((r) => x + w / 2 > r.x0 && x - w / 2 < r.x1 && z + d / 2 > r.z0 && z - d / 2 < r.z1);

  const downtown = [
    { x: -700, z: 4300, r: 1150, h: 1050 },
    { x: 2800, z: 2700, r: 850, h: 560 },
    { x: -3300, z: -1700, r: 900, h: 480 },
  ];

  const N = 50;
  for (let gx = -N; gx <= N; gx++) {
    for (let gz = -N; gz <= N; gz++) {
      const cx = gx * BLOCK;
      const cz = gz * BLOCK + 1500 - ((1500 / BLOCK) % 1) * BLOCK;
      if (Math.hypot(cx, cz - 1500) > 9800) continue;
      // river corridor + embankments
      if (Math.abs(cz - riverZ(cx)) < RIVER.width / 2 + 90) continue;
      const lot = BLOCK - STREET;
      const dt = downtown.map((d) => Math.exp(-Math.pow(Math.hypot(cx - d.x, cz - d.z) / d.r, 2)));
      const dense = Math.max(...dt);
      const pattern = rnd();
      const parts: [number, number, number, number][] = [];
      if (pattern < 0.25 + dense * 0.5) parts.push([cx, cz, lot, lot]);
      else if (pattern < 0.6) {
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
        const inset = 3 + rnd() * 10;
        const w = pw - inset * 2;
        const d = pd - inset * 2;
        if (overlaps(px, pz, w, d)) continue;
        const r = rnd();
        // districts: mid-rise noise field + downtown clusters
        const district = vnoise(px / 1400 + 7, pz / 1400 + 3);
        let h = (45 + 210 * Math.pow(district, 1.6)) * (0.45 + 1.05 * Math.pow(r, 1.7));
        let kind = rnd() < 0.15 + 0.55 * dense ? 2 : 0;
        downtown.forEach((dd, i) => {
          h += dd.h * dt[i] * (0.25 + 0.95 * Math.pow(rnd(), 1.3));
        });
        if (rnd() < 0.05 * dense) {
          h *= 1.35;
          kind = 2;
        }
        // stay well below the flight
        let minD = Infinity;
        let minY = Infinity;
        for (const s of samples) {
          const dist = Math.hypot(s.x - px, s.z - pz);
          if (dist < minD) {
            minD = dist;
            minY = s.y;
          }
        }
        const half = Math.max(w, d) / 2;
        if (minD < 900 + half) h = Math.min(h, 230 + rnd() * 90);
        if (minD < 220 + half) h = Math.min(h, minY - 170 - rnd() * 60);
        h = Math.max(h, 24);
        const b: Bld = { x: px, z: pz, w, d, h, kind, lit: 0.2 + rnd() * 0.22, tint: rnd(), seed: rnd() * 100 };
        add(b);
        if (h > 260 && rnd() < 0.6) {
          const ch = 20 + rnd() * 70;
          add({ ...b, w: w * 0.7, d: d * 0.7, y0: h, h: ch, seed: b.seed + 1 });
          if (rnd() < 0.6) lights.push({ x: px, y: h + ch + 3, z: pz, phase: rnd() });
        } else if (h > 320 && rnd() < 0.5) {
          lights.push({ x: px + w * 0.4, y: h + 2, z: pz + d * 0.4, phase: rnd() });
        }
        if (rnd() < 0.3) {
          add({ x: px + (rnd() - 0.5) * w * 0.4, z: pz + (rnd() - 0.5) * d * 0.4, w: 8 + rnd() * 14, d: 8 + rnd() * 14, y0: h, h: 4 + rnd() * 8, kind: 1, lit: 0, tint: 0.2, seed: rnd() * 100 });
        }
      }
    }
  }

  // landmark spires in the downtown skyline
  const landmarks = [
    [-520, 4050, 70, 1500],
    [-980, 4500, 64, 1320],
    [-260, 4600, 58, 1180],
    [2700, 2550, 60, 900],
    [-1300, 3900, 52, 1050],
  ];
  landmarks.forEach(([x, z, s, h], i) => {
    const seed = 500 + i * 7;
    add({ x, z, w: s, d: s, h: h * 0.72, kind: 2, lit: 0.34, tint: 0.7, seed });
    add({ x, z, w: s * 0.76, d: s * 0.76, y0: h * 0.72, h: h * 0.17, kind: 2, lit: 0.34, tint: 0.7, seed: seed + 1 });
    add({ x, z, w: s * 0.42, d: s * 0.42, y0: h * 0.89, h: h * 0.05, kind: 1, lit: 0, tint: 0.2, seed: seed + 2 });
    add({ x, z, w: 3, d: 3, y0: h * 0.94, h: h * 0.08, kind: 1, lit: 0, tint: 0.2, seed: seed + 3 });
    lights.push({ x, y: h * 1.02 + 2, z, phase: rnd() });
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ])
      lights.push({ x: x + sx * s * 0.37, y: h * 0.89 + 2, z: z + sz * s * 0.37, phase: rnd() });
  });

  // building A (rooftop with the table) and building B (landing ledge)
  add({ x: (ROOF_A.x0 + ROOF_A.x1) / 2, z: (ROOF_A.z0 + ROOF_A.z1) / 2, w: ROOF_A.x1 - ROOF_A.x0, d: ROOF_A.z1 - ROOF_A.z0, h: ROOF_A.h, kind: 2, lit: 0.3, tint: 0.6, seed: 11 });
  add({ x: (ROOF_B.x0 + ROOF_B.x1) / 2, z: (ROOF_B.z0 + ROOF_B.z1) / 2, w: ROOF_B.x1 - ROOF_B.x0, d: ROOF_B.z1 - ROOF_B.z0, h: ROOF_B.h, kind: 0, lit: 0.32, tint: 0.4, seed: 21 });
  return { blds, lights };
}

export function buildCars(count: number) {
  const rnd = mulberry32(99);
  const TRAIL = 6;
  const lanes: number[] = [];
  const cars: number[] = [];
  for (let i = 0; i < count; i++) {
    const axis = rnd() < 0.5 ? 0 : 1;
    const k = Math.floor((rnd() - 0.5) * 90);
    const dir = rnd() < 0.5 ? 1 : -1;
    const streetPos = k * BLOCK + BLOCK / 2 + dir * 8 + (axis === 0 ? 1500 - ((1500 / BLOCK) % 1) * BLOCK : 0);
    const phase = rnd() * 22000;
    const speed = 30 + rnd() * 25;
    const kind = rnd() < 0.5 ? 1 : 0;
    for (let t = 0; t < TRAIL; t++) {
      if (axis === 0) lanes.push(0, streetPos, 0, dir);
      else lanes.push(streetPos, 0, 1, dir);
      cars.push(phase, speed, kind, t);
    }
  }
  return { lanes: new Float32Array(lanes), cars: new Float32Array(cars), n: count * TRAIL };
}
