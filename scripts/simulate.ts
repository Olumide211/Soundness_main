/*
 * ONE BALL — deterministic pre-simulation.
 * Fixed-timestep custom 2D physics (60 fps x SUBSTEPS), seeded RNG (mulberry32, seed 2026).
 * Writes src/data/sim.json which the Remotion composition only reads.
 *
 * The spawn threshold schedule is auto-tuned (re-simulating) until the ball-count curve
 * follows the target: 1 @0s, ~10 @6s, ~50 @12s, ~200 @18s, ring ~full @22.5s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CollisionEvent, selectNotes, hash01, Target } from './music.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'sim.json');

// ---------------------------------------------------------------- constants
export const FPS = 60;
export const FRAMES = 1560; // 26 s
export const FULL_FRAME = 1350; // 22.5 s ring full, spawning stops
export const BURST_FRAME = 1380; // 23.0 s white flash
const SUB = 10;
const DT = 1 / FPS / SUB;

export const CX = 540;
export const CY = 880;
export const RING_R = 430; // ring centre-line radius
const RING_IN = RING_R - 5; // balls collide with inner edge of the stroke
export const HUB_R = 66; // gear outer (teeth) radius
export const ARM_A = 150; // radius of each half-circle arm
export const ARM_HALF_T = 14; // half thickness of arm
export const OMEGA = 0.35 * 2 * Math.PI; // rad/s, positive = clockwise on screen (y down)
export const THETA0 = -0.35;

const GRAVITY = 1500; // px/s^2
const DRAG = 0.06; // 1/s (slight air drag)
const E_WALL = 0.92;
const E_BALL = 0.9;
const REST_V = 45; // below this normal speed contacts are treated as resting (no bounce)
const VMAX = 2600;
const EVENT_MIN_V = 70;
const SPAWN_COOLDOWN = 6;
const R_MAX = 22;
const R_MIN = 11;
export const N_FULL = Number(process.env.N_FULL ?? 1150);
const RADIUS_ALPHA = Math.log(R_MAX / R_MIN) / Math.log(N_FULL);
export const radiusFor = (n: number) => Math.max(R_MIN, R_MAX * Math.pow(Math.max(1, n), -RADIUS_ALPHA));

export const PALETTE = ['#4C8DFF', '#7C5CFF', '#FF4FD8', '#FF6B3D', '#FFD23F', '#3DFFB0', '#3DD6FF'];
const BALL0 = { x: CX + 22, y: CY - 318 };

// target curve (seconds -> count), log-linear interpolation
const KEYS: [number, number][] = [
  [0, 1],
  [6, 10],
  [12, 50],
  [18, 200],
  [22.5, N_FULL],
];
export function targetCount(t: number): number {
  if (t <= 0) return 1;
  for (let i = 1; i < KEYS.length; i++) {
    const [t0, c0] = KEYS[i - 1];
    const [t1, c1] = KEYS[i];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return Math.exp(Math.log(c0) + u * (Math.log(c1) - Math.log(c0)));
    }
  }
  return N_FULL;
}

// ---------------------------------------------------------------- rng
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- sim
const SEG_SEC = 1.5;
const NSEG = Math.ceil(22.5 / SEG_SEC);

interface SimResult {
  counts: number[];
  radius: number[];
  pos: number[][]; // per frame flat [x*4, y*4, ...] (quantised quarter pixels)
  events: CollisionEvent[];
  fill: { packing: number; visual: number };
}

function simulate(thr: number[], record: boolean): SimResult {
  const rng = mulberry32(2026);
  const cap = 2048;
  const px = new Float64Array(cap), py = new Float64Array(cap);
  const vx = new Float64Array(cap), vy = new Float64Array(cap);
  const lastSpawn = new Int32Array(cap).fill(-1000);
  let n = 1;
  px[0] = BALL0.x; py[0] = BALL0.y;

  const counts: number[] = [1];
  const radius: number[] = [radiusFor(1)];
  const pos: number[][] = [];
  const events: CollisionEvent[] = [];
  const q = (v: number) => Math.round(v * 4);
  if (record) pos.push([q(px[0]), q(py[0])]);

  // per-frame impact accumulators
  const best = new Float64Array(cap * 3);
  const bestX = new Float64Array(cap * 3), bestY = new Float64Array(cap * 3);
  const touched: number[] = [];

  // spatial hash
  const CELL = 24;
  const GW = Math.ceil(1080 / CELL) + 2, GH = Math.ceil(1920 / CELL) + 2;
  const head = new Int32Array(GW * GH);
  const next = new Int32Array(cap);

  const T_IDX: Target[] = ['ring', 'arm', 'ball'];
  const note = (i: number, t: number, v: number, x: number, y: number) => {
    const k = i * 3 + t;
    if (v > best[k]) {
      if (best[k] === 0) touched.push(k);
      best[k] = v; bestX[k] = x; bestY[k] = y;
    }
  };

  let frame = 0;
  let spawnedThisFrame = 0;
  const trySpawn = (i: number, vImpact: number, cxp: number, cyp: number, nx: number, ny: number) => {
    const t = frame / FPS;
    if (frame > FULL_FRAME) return;
    if (n >= cap) return;
    const seg = Math.min(NSEG - 1, Math.floor(t / SEG_SEC));
    if (vImpact < thr[seg]) return;
    if (frame - lastSpawn[i] < SPAWN_COOLDOWN) return;
    if (n >= targetCount(t) * 1.1 + 0.5) return;
    if (spawnedThisFrame >= 8) return;
    const r = radiusFor(n + 1);
    // new ball born at the impact point, nudged inward along the contact normal
    const j = n++;
    const tang = rng() < 0.5 ? -1 : 1;
    px[j] = cxp + nx * (r + 1) + -ny * tang * r * 0.6;
    py[j] = cyp + ny * (r + 1) + nx * tang * r * 0.6;
    const ang = (rng() - 0.5) * 1.2;
    const c = Math.cos(ang), s = Math.sin(ang);
    vx[j] = (vx[i] * c - vy[i] * s) * 0.85;
    vy[j] = (vx[i] * s + vy[i] * c) * 0.85;
    lastSpawn[i] = frame;
    lastSpawn[j] = frame;
    spawnedThisFrame++;
  };

  const lastPhysFrame = BURST_FRAME;
  for (frame = 1; frame <= lastPhysFrame; frame++) {
    spawnedThisFrame = 0;
    for (let s = 0; s < SUB; s++) {
      const time = (frame - 1) / FPS + (s + 1) * DT;
      const theta = THETA0 + OMEGA * time;
      const ct = Math.cos(theta), st = Math.sin(theta);
      const r = radiusFor(n);
      const nb = n;
      // integrate
      const damp = 1 - DRAG * DT;
      for (let i = 0; i < nb; i++) {
        vy[i] += GRAVITY * DT;
        vx[i] *= damp; vy[i] *= damp;
        const sp = Math.hypot(vx[i], vy[i]);
        if (sp > VMAX) { vx[i] *= VMAX / sp; vy[i] *= VMAX / sp; }
        px[i] += vx[i] * DT; py[i] += vy[i] * DT;
      }
      for (let it = 0; it < 3; it++) {
        const first = it === 0;
        // ---- ball-ball
        if (nb > 1) {
          head.fill(-1);
          for (let i = 0; i < nb; i++) {
            const gx = Math.min(GW - 1, Math.max(0, Math.floor(px[i] / CELL) + 1));
            const gy = Math.min(GH - 1, Math.max(0, Math.floor(py[i] / CELL) + 1));
            const h = gy * GW + gx;
            next[i] = head[h]; head[h] = i;
          }
          const d2min = (2 * r) * (2 * r);
          for (let i = 0; i < nb; i++) {
            const gx = Math.min(GW - 1, Math.max(0, Math.floor(px[i] / CELL) + 1));
            const gy = Math.min(GH - 1, Math.max(0, Math.floor(py[i] / CELL) + 1));
            for (let oy = -1; oy <= 1; oy++) {
              const yy = gy + oy; if (yy < 0 || yy >= GH) continue;
              for (let ox = -1; ox <= 1; ox++) {
                const xx = gx + ox; if (xx < 0 || xx >= GW) continue;
                for (let j = head[yy * GW + xx]; j !== -1; j = next[j]) {
                  if (j <= i) continue;
                  let dx = px[j] - px[i], dy = py[j] - py[i];
                  let d2 = dx * dx + dy * dy;
                  if (d2 >= d2min) continue;
                  if (d2 < 1e-6) { dx = (rng() - 0.5) * 0.01; dy = 0.01; d2 = dx * dx + dy * dy; }
                  const d = Math.sqrt(d2);
                  const nx = dx / d, ny = dy / d;
                  const pen = 2 * r - d;
                  const corr = Math.min(pen, r * 0.5) * 0.5 * 0.85;
                  px[i] -= nx * corr; py[i] -= ny * corr;
                  px[j] += nx * corr; py[j] += ny * corr;
                  const vr = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
                  if (vr < 0) {
                    const e = -vr > REST_V ? E_BALL : 0;
                    const imp = (-(1 + e) * vr) / 2;
                    vx[i] -= imp * nx; vy[i] -= imp * ny;
                    vx[j] += imp * nx; vy[j] += imp * ny;
                    if (first && -vr > EVENT_MIN_V) {
                      const mx = (px[i] + px[j]) / 2, my = (py[i] + py[j]) / 2;
                      const fast = vx[i] * vx[i] + vy[i] * vy[i] > vx[j] * vx[j] + vy[j] * vy[j] ? i : j;
                      note(fast, 2, -vr, mx, my);
                    }
                  }
                }
              }
            }
          }
        }
        // ---- gear: hub + two half-circle arms (kinematic)
        const reach2 = (2 * ARM_A + ARM_HALF_T + r) ** 2;
        for (let i = 0; i < nb; i++) {
          const rx = px[i] - CX, ry = py[i] - CY;
          const dd = rx * rx + ry * ry;
          if (dd > reach2) continue;
          // local frame
          const lx = rx * ct + ry * st, ly = -rx * st + ry * ct;
          let qx = 0, qy = 0, dist = 1e9, lim = 0;
          // hub
          {
            const d = Math.sqrt(dd);
            const dh = d - HUB_R;
            if (dh < r) {
              dist = dh; lim = r;
              qx = d > 1e-6 ? (lx / d) * HUB_R : HUB_R; qy = d > 1e-6 ? (ly / d) * HUB_R : 0;
            }
          }
          // arms: arm0 centre (A,0), arc angles [pi,2pi] (upper half); arm1 point-symmetric
          for (let k = 0; k < 2; k++) {
            const sx = k === 0 ? 1 : -1;
            const ax = lx * sx, ay = ly * sx; // map arm1 onto arm0
            const ux = ax - ARM_A, uy = ay;
            let ang = Math.atan2(uy, ux); if (ang < 0) ang += 2 * Math.PI;
            let cx2: number, cy2: number;
            if (ang >= Math.PI) {
              const ul = Math.hypot(ux, uy) || 1e-6;
              cx2 = ARM_A + (ux / ul) * ARM_A; cy2 = (uy / ul) * ARM_A;
            } else {
              // nearest endpoint: hub end (0,0) or tip (2A,0)
              const dTip = (ax - 2 * ARM_A) ** 2 + ay * ay, dHub = ax * ax + ay * ay;
              if (dTip < dHub) { cx2 = 2 * ARM_A; cy2 = 0; } else { cx2 = 0; cy2 = 0; }
            }
            const d = Math.hypot(ax - cx2, ay - cy2) - ARM_HALF_T;
            if (d < r && d - r < dist - lim) {
              dist = d; lim = r; qx = cx2 * sx; qy = cy2 * sx;
              // store surface point offset (towards ball) in local frame
              const dl = Math.hypot(ax - cx2, ay - cy2) || 1e-6;
              qx += ((ax - cx2) / dl) * ARM_HALF_T * sx; qy += ((ay - cy2) / dl) * ARM_HALF_T * sx;
            }
          }
          if (lim === 0) continue;
          // world contact point and normal
          const wqx = CX + qx * ct - qy * st, wqy = CY + qx * st + qy * ct;
          let nx = px[i] - wqx, ny = py[i] - wqy;
          const nl = Math.hypot(nx, ny);
          if (nl < 1e-6) { nx = rx; ny = ry; }
          const nn = Math.hypot(nx, ny) || 1; nx /= nn; ny /= nn;
          const pen = r - dist;
          px[i] += nx * pen; py[i] += ny * pen;
          // surface velocity (rigid rotation)
          const svx = -OMEGA * (wqy - CY), svy = OMEGA * (wqx - CX);
          const rvx = vx[i] - svx, rvy = vy[i] - svy;
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            const e = -vn > REST_V ? E_WALL : 0.05;
            vx[i] -= (1 + e) * vn * nx; vy[i] -= (1 + e) * vn * ny;
            // light tangential friction so the arms can carry balls
            const tvx = rvx - vn * nx, tvy = rvy - vn * ny;
            vx[i] -= tvx * 0.04; vy[i] -= tvy * 0.04;
            if (first && -vn > EVENT_MIN_V) {
              note(i, 1, -vn, wqx, wqy);
              trySpawn(i, -vn, wqx, wqy, nx, ny);
            }
          }
        }
        // ---- ring (last: hard constraint, nothing escapes)
        const lim = RING_IN - r;
        for (let i = 0; i < nb; i++) {
          const rx = px[i] - CX, ry = py[i] - CY;
          const d2 = rx * rx + ry * ry;
          if (d2 <= lim * lim) continue;
          const d = Math.sqrt(d2);
          const nx = rx / d, ny = ry / d;
          px[i] = CX + nx * lim; py[i] = CY + ny * lim;
          const vn = vx[i] * nx + vy[i] * ny;
          if (vn > 0) {
            const e = vn > REST_V ? E_WALL : 0.1;
            vx[i] -= (1 + e) * vn * nx; vy[i] -= (1 + e) * vn * ny;
            if (first && vn > EVENT_MIN_V) {
              const hx = CX + nx * RING_IN, hy = CY + ny * RING_IN;
              note(i, 0, vn, hx, hy);
              trySpawn(i, vn, hx, hy, -nx, -ny);
            }
          }
        }
      }
    }
    // final hard clamp after spawning (new balls)
    {
      const r = radiusFor(n);
      const lim = RING_IN - r;
      for (let i = 0; i < n; i++) {
        const rx = px[i] - CX, ry = py[i] - CY;
        const d = Math.hypot(rx, ry);
        if (d > lim) { px[i] = CX + (rx / d) * lim; py[i] = CY + (ry / d) * lim; }
      }
    }
    // flush events
    touched.sort((a, b) => a - b);
    for (const k of touched) {
      if (record) {
        events.push({
          frame,
          ballId: Math.floor(k / 3),
          target: T_IDX[k % 3],
          velocity: Math.round(best[k]),
          x: Math.round(bestX[k] * 10) / 10,
          y: Math.round(bestY[k] * 10) / 10,
        });
      }
      best[k] = 0;
    }
    touched.length = 0;
    counts.push(n);
    radius.push(radiusFor(n));
    if (record) {
      const arr = new Array(n * 2);
      for (let i = 0; i < n; i++) { arr[2 * i] = q(px[i]); arr[2 * i + 1] = q(py[i]); }
      pos.push(arr);
    }
    if (frame === FULL_FRAME) fillMetric = measureFill(px, py, n, radiusFor(n), THETA0 + OMEGA * (frame / FPS));
  }
  return { counts, radius, pos, events, fill: fillMetric };
}

let fillMetric = { packing: 0, visual: 0 };

function measureFill(px: Float64Array, py: Float64Array, n: number, r: number, theta: number) {
  const STEP = 3;
  const lim = RING_IN;
  const W = Math.ceil((2 * lim) / STEP);
  const covered = new Uint8Array(W * W); // 1 = ball, 2 = gear
  const glow = new Uint8Array(W * W);
  const ct = Math.cos(theta), st = Math.sin(theta);
  const stamp = (cx: number, cy: number, rad: number, arr: Uint8Array) => {
    const x0 = Math.floor((cx - rad - (CX - lim)) / STEP), x1 = Math.ceil((cx + rad - (CX - lim)) / STEP);
    const y0 = Math.floor((cy - rad - (CY - lim)) / STEP), y1 = Math.ceil((cy + rad - (CY - lim)) / STEP);
    for (let gy = Math.max(0, y0); gy <= Math.min(W - 1, y1); gy++)
      for (let gx = Math.max(0, x0); gx <= Math.min(W - 1, x1); gx++) {
        const x = CX - lim + (gx + 0.5) * STEP, y = CY - lim + (gy + 0.5) * STEP;
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) arr[gy * W + gx] = 1;
      }
  };
  for (let i = 0; i < n; i++) { stamp(px[i], py[i], r, covered); stamp(px[i], py[i], r + 4, glow); }
  let inside = 0, cov = 0, vis = 0;
  for (let gy = 0; gy < W; gy++)
    for (let gx = 0; gx < W; gx++) {
      const x = CX - lim + (gx + 0.5) * STEP, y = CY - lim + (gy + 0.5) * STEP;
      const rx = x - CX, ry = y - CY;
      if (rx * rx + ry * ry > lim * lim) continue;
      inside++;
      // gear occupancy
      const lx = rx * ct + ry * st, ly = -rx * st + ry * ct;
      let gear = Math.hypot(lx, ly) <= HUB_R;
      for (let k = 0; k < 2 && !gear; k++) {
        const sx = k === 0 ? 1 : -1;
        const ax = lx * sx, ay = ly * sx;
        const ux = ax - ARM_A;
        if (ay <= 0 && Math.abs(Math.hypot(ux, ay) - ARM_A) <= ARM_HALF_T) gear = true;
      }
      const c = covered[gy * W + gx] || gear;
      if (c) cov++;
      if (c || glow[gy * W + gx]) vis++;
    }
  return { packing: cov / inside, visual: vis / inside };
}

// ---------------------------------------------------------------- tuning loop
function curveReport(counts: number[]) {
  const rows: string[] = [];
  let worst = 0;
  for (const t of [0, 3, 6, 9, 12, 15, 18, 20, 21, 22, 22.5]) {
    const f = Math.round(t * FPS);
    const c = counts[f];
    const tgt = targetCount(t);
    const err = (c - tgt) / tgt;
    if ([6, 12, 18, 22.5].includes(t)) worst = Math.max(worst, Math.abs(err));
    rows.push(`  t=${t.toFixed(1).padStart(4)}s  count=${String(c).padStart(5)}  target=${tgt.toFixed(0).padStart(5)}  err=${(err * 100).toFixed(1).padStart(6)}%`);
  }
  return { text: rows.join('\n'), worst };
}

function main() {
  let thr = new Array(NSEG).fill(0).map((_, i) => 520 - i * 28);
  let best: { thr: number[]; score: number } | null = null;
  const MAX_IT = Number(process.env.TUNE_ITERS ?? 14);
  for (let it = 0; it < MAX_IT; it++) {
    const t0 = Date.now();
    const res = simulate(thr, false);
    // score: mean abs log error at the segment boundaries + keys
    let score = 0;
    const segErr: number[] = [];
    for (let s = 0; s < NSEG; s++) {
      const t = Math.min(22.5, (s + 1) * SEG_SEC);
      const c = res.counts[Math.round(t * FPS)];
      const e = Math.log(c / targetCount(t));
      segErr.push(e);
      score += Math.abs(e);
    }
    score /= NSEG;
    const rep = curveReport(res.counts);
    console.log(`[tune ${it}] score=${score.toFixed(3)} worstKeyErr=${(rep.worst * 100).toFixed(1)}% fill(packing=${res.fill.packing.toFixed(3)}, visual=${res.fill.visual.toFixed(3)}) ${Date.now() - t0}ms`);
    if (!best || score < best.score) best = { thr: thr.slice(), score };
    if (rep.worst < 0.06 && score < 0.06) break;
    // behind target -> lower threshold in that segment, ahead -> raise it
    thr = thr.map((v, s) => {
      const e = segErr[s];
      const k = Math.exp(Math.max(-0.45, Math.min(0.45, e * 0.9)));
      return Math.max(40, Math.min(1500, v * k));
    });
  }
  thr = best!.thr;
  console.log('spawn threshold schedule (px/s per 1.5s segment):', thr.map((v) => Math.round(v)).join(', '));

  // ---------------------------------------------------------------- final run with recording
  const res = simulate(thr, true);
  const rep = curveReport(res.counts);
  console.log('Ball count curve:\n' + rep.text);
  console.log(`fill @22.5s: packing=${(res.fill.packing * 100).toFixed(1)}%  visual(with glow)=${(res.fill.visual * 100).toFixed(1)}%`);

  // extend per-frame arrays through the finale
  const counts = res.counts.slice();
  const radius = res.radius.slice();
  const nFinal = counts[BURST_FRAME];
  for (let f = BURST_FRAME + 1; f < FRAMES; f++) {
    // displayed counter collapses back to 1 during the burst
    const u = Math.min(1, (f - BURST_FRAME) / 66);
    const e = 1 - Math.pow(1 - u, 3);
    counts.push(Math.max(1, Math.round(nFinal + (1 - nFinal) * e)));
    radius.push(radiusFor(1));
  }

  // gear angle: physics rotation, then an eased correction so frame 1559 == frame 0 exactly (mod 2pi)
  const theta: number[] = [];
  const raw = (f: number) => THETA0 + (OMEGA * f) / FPS;
  // full turns (2*pi) so the embossed arm is back in place too
  const turns = Math.round(((OMEGA * (FRAMES - 1)) / FPS) / (2 * Math.PI));
  const delta = turns * 2 * Math.PI - (OMEGA * (FRAMES - 1)) / FPS;
  for (let f = 0; f < FRAMES; f++) {
    let th = raw(f);
    if (f > BURST_FRAME) {
      const u = (f - BURST_FRAME) / (FRAMES - 1 - BURST_FRAME);
      const sm = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep: zero velocity change at both ends
      th += delta * sm;
    }
    theta.push(th);
  }

  // notes (audible subset)
  const notes = selectNotes(res.events, (f) => counts[f], FULL_FRAME + 20);

  // screen shakes on the strongest audible impacts
  const vs = notes.filter((n) => n.target !== 'ball').map((n) => n.velocity).sort((a, b) => a - b);
  const p96 = vs[Math.floor(vs.length * 0.96)] ?? 1e9;
  const shake: [number, number][] = new Array(FRAMES).fill(0).map(() => [0, 0]);
  let lastShake = -100;
  const addShake = (f0: number, amp: number, seed: number) => {
    for (let k = 0; k < 4 && f0 + k < FRAMES; k++) {
      const a = amp * (1 - k / 4);
      const ang = hash01(seed, k) * Math.PI * 2;
      shake[f0 + k] = [Math.round(Math.cos(ang) * a * 10) / 10, Math.round(Math.sin(ang) * a * 10) / 10];
    }
  };
  for (const nt of notes) {
    if (nt.target === 'ball' || nt.velocity < p96 || nt.frame - lastShake < 24) continue;
    const amp = 2 + 2 * Math.min(1, (nt.velocity - p96) / 900);
    addShake(nt.frame, amp, nt.frame);
    lastShake = nt.frame;
  }
  addShake(BURST_FRAME, 4, 99);

  // burst particles: each ball at the burst frame becomes light particles (closed-form motion in render)
  const prng = mulberry32(2026 ^ 0xb0a5);
  const lastPos = res.pos[BURST_FRAME];
  const burst: number[][] = [];
  for (let i = 0; i < nFinal; i++) {
    const x = lastPos[2 * i] / 4, y = lastPos[2 * i + 1] / 4;
    const base = Math.atan2(y - CY, x - CX);
    const per = 2;
    for (let k = 0; k < per; k++) {
      const a = base + (prng() - 0.5) * 1.3;
      let sp = 500 + prng() * 1700;
      // keep the light particles inside ring + 35px so they never cross the text / counter
      const BURST_K = 3.2, RL = RING_R + 35;
      const ux = Math.cos(a), uy = Math.sin(a), qx = x - CX, qy = y - CY;
      const pu = qx * ux + qy * uy;
      const sMax = -pu + Math.sqrt(Math.max(0, pu * pu - (qx * qx + qy * qy - RL * RL)));
      sp = Math.min(sp, sMax * BURST_K);
      burst.push([
        Math.round(x), Math.round(y),
        Math.round(Math.cos(a) * sp), Math.round(Math.sin(a) * sp),
        i % PALETTE.length,
        Math.round((1.5 + prng() * 3.5) * 10) / 10,
        Math.round((0.6 + prng() * 1.1) * 100) / 100,
      ]);
    }
  }

  // sanity: nobody ever escapes the ring
  let maxR = 0;
  for (let f = 0; f <= BURST_FRAME; f++) {
    const p = res.pos[f];
    const r = radius[f];
    for (let i = 0; i < p.length; i += 2) {
      const d = Math.hypot(p[i] / 4 - CX, p[i + 1] / 4 - CY) + r;
      if (d > maxR) maxR = d;
    }
  }
  console.log(`max ball extent from ring centre: ${maxR.toFixed(2)}px (ring inner edge ${RING_IN}px)`);

  const out = {
    meta: {
      fps: FPS, frames: FRAMES, width: 1080, height: 1920, seed: 2026, substeps: SUB,
      fullFrame: FULL_FRAME, burstFrame: BURST_FRAME,
      ring: { cx: CX, cy: CY, r: RING_R, inner: RING_IN },
      gear: { hubR: HUB_R, armA: ARM_A, armHalfT: ARM_HALF_T, omega: OMEGA, theta0: THETA0 },
      palette: PALETTE,
      posScale: 4,
      ball0: BALL0,
      gravity: GRAVITY, restitution: E_WALL, drag: DRAG, spawnCooldown: SPAWN_COOLDOWN,
      spawnThreshold: thr.map((v) => Math.round(v)),
      nFull: N_FULL,
      fill: res.fill,
      maxExtent: maxR,
    },
    counts,
    radius: radius.map((r) => Math.round(r * 100) / 100),
    theta: theta.map((t) => Math.round(t * 1e6) / 1e6),
    shake,
    pos: res.pos,
    events: res.events,
    notes,
    burst,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const mb = fs.statSync(OUT).size / 1e6;
  console.log(`wrote ${OUT} (${mb.toFixed(1)} MB): ${res.events.length} collision events, ${notes.length} audible notes, ${burst.length} burst particles`);
}

main();
