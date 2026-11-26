// Canvas renderer for ONE BALL. Pure function of (frame, layout, sim data). Never simulates:
// every position comes from src/data/sim.json; everything else is a closed-form function of the frame.
import simJson from './data/sim.json';
import { BURST_FRAME, FULL_FRAME, LAST_FRAME, Layout, cameraZoom, smoother } from './layout';

interface Note {
  frame: number; ballId: number; target: 'ring' | 'arm' | 'ball'; velocity: number; gain: number;
}
interface Sim {
  meta: {
    ring: { cx: number; cy: number; r: number; inner: number };
    gear: { hubR: number; armA: number; armHalfT: number };
    palette: string[];
    posScale: number;
    ball0: { x: number; y: number };
  };
  counts: number[];
  radius: number[];
  theta: number[];
  shake: [number, number][];
  pos: number[][];
  notes: Note[];
  burst: number[][];
}
export const sim = simJson as unknown as Sim;
const { ring, gear, palette, posScale } = sim.meta;
const CX = ring.cx, CY = ring.cy;

// ------------------------------------------------------------------ indices
const flashMap = new Map<number, Set<number>>();
const ringHits: Note[] = [];
for (const n of sim.notes) {
  for (let k = 0; k < 3; k++) {
    const f = n.frame + k;
    if (!flashMap.has(f)) flashMap.set(f, new Set());
    flashMap.get(f)!.add(n.ballId);
  }
  if (n.target === 'ring') ringHits.push(n);
}

export function ringPulse(f: number): number {
  let p = 0;
  for (const n of ringHits) {
    if (n.frame > f) break;
    const d = f - n.frame;
    if (d > 14) continue;
    p += Math.min(1, n.gain * 1.3) * Math.exp(-d / 4);
  }
  return Math.min(1, p);
}

const hash01 = (a: number, b: number) => {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

// ------------------------------------------------------------------ colour helpers + sprites
function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const SPR = 128;
interface Sprites { sphere: HTMLCanvasElement; halo: HTMLCanvasElement; spark: HTMLCanvasElement; }
let spriteCache: { colors: Sprites[]; white: Sprites; grain: HTMLCanvasElement[] } | null = null;

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function makeSprites(hex: string): Sprites {
  const c = hexRgb(hex);
  const W: [number, number, number] = [255, 255, 255];
  const K: [number, number, number] = [0, 0, 0];
  const sphere = makeCanvas(SPR, SPR);
  {
    const g = sphere.getContext('2d')!;
    const r = SPR / 2 - 1;
    const grd = g.createRadialGradient(SPR / 2 - r * 0.38, SPR / 2 - r * 0.42, 0, SPR / 2, SPR / 2, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.16, mix(c, W, 0.7));
    grd.addColorStop(0.5, mix(c, W, 0.12));
    grd.addColorStop(0.86, mix(c, K, 0.25));
    grd.addColorStop(1, mix(c, K, 0.5));
    g.fillStyle = grd;
    g.beginPath(); g.arc(SPR / 2, SPR / 2, r, 0, Math.PI * 2); g.fill();
    // rim light
    g.strokeStyle = rgba(hexRgb('#ffffff'), 0.25);
    g.lineWidth = 3;
    g.beginPath(); g.arc(SPR / 2, SPR / 2, r - 2, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  }
  const halo = makeCanvas(SPR, SPR);
  {
    const g = halo.getContext('2d')!;
    const grd = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    grd.addColorStop(0, rgba(c, 0.9));
    grd.addColorStop(0.3, rgba(c, 0.45));
    grd.addColorStop(0.6, rgba(c, 0.12));
    grd.addColorStop(1, rgba(c, 0));
    g.fillStyle = grd; g.fillRect(0, 0, SPR, SPR);
  }
  const spark = makeCanvas(SPR, SPR);
  {
    const g = spark.getContext('2d')!;
    const grd = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.15, rgba([Math.round((c[0] + 255) / 2), Math.round((c[1] + 255) / 2), Math.round((c[2] + 255) / 2)], 0.9));
    grd.addColorStop(0.4, rgba(c, 0.35));
    grd.addColorStop(1, rgba(c, 0));
    g.fillStyle = grd; g.fillRect(0, 0, SPR, SPR);
  }
  return { sphere, halo, spark };
}

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

function getSprites() {
  if (spriteCache) return spriteCache;
  const colors = palette.map(makeSprites);
  const white = makeSprites('#FFFFFF');
  // film grain tiles (seeded)
  const grain: HTMLCanvasElement[] = [];
  const rng = mulberry32(2026);
  for (let k = 0; k < 8; k++) {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = Math.floor(rng() * 8); // 0..7 additive
      img.data[4 * i] = v; img.data[4 * i + 1] = v; img.data[4 * i + 2] = v + 1; img.data[4 * i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grain.push(c);
  }
  spriteCache = { colors, white, grain };
  return spriteCache;
}

// ------------------------------------------------------------------ scene pieces
const BG = '#020206'; // + average additive grain (~3.5) => ~#05050A

function drawRing(ctx: CanvasRenderingContext2D, f: number) {
  const pulse = f <= BURST_FRAME + 2 ? ringPulse(Math.min(f, FULL_FRAME + 30)) : 0;
  const tb = (f - BURST_FRAME) / 60;
  const flare = f >= BURST_FRAME ? 2.6 * Math.exp(-tb / 0.45) * (1 - smoother((tb - 1.2) / 1.0)) : 0;
  const scale = 1 + 0.02 * pulse + (f >= BURST_FRAME ? 0.045 * Math.exp(-tb / 0.25) * (1 - smoother((tb - 0.8) / 0.6)) : 0);
  const R = ring.r * scale;
  const bright = 0.62 + 0.38 * pulse + flare;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // soft bloom layers
  const layers: [number, number][] = [[60, 0.035], [34, 0.06], [18, 0.1], [9, 0.18]];
  for (const [w, a] of layers) {
    ctx.strokeStyle = `rgba(120,160,255,${Math.min(1, a * bright)})`;
    ctx.lineWidth = w * (1 + flare * 0.5);
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.shadowColor = `rgba(150,185,255,${Math.min(1, 0.8 * bright)})`;
  ctx.shadowBlur = 26;
  const core = Math.min(1, 0.55 + 0.45 * bright);
  ctx.strokeStyle = `rgba(${Math.round(215 + 40 * core)},${Math.round(225 + 30 * core)},255,${core})`;
  ctx.lineWidth = 4 + flare * 2;
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function rot(theta: number) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return (x: number, y: number): [number, number] => [CX + x * c - y * s, CY + x * s + y * c];
}

function drawArms(ctx: CanvasRenderingContext2D, theta: number) {
  const A = gear.armA, T = gear.armHalfT;
  const P = rot(theta);
  const arms: { c: [number, number]; a0: number; a1: number; tip: [number, number] }[] = [
    { c: P(A, 0), a0: Math.PI + theta, a1: 2 * Math.PI + theta, tip: P(2 * A, 0) },
    { c: P(-A, 0), a0: theta, a1: Math.PI + theta, tip: P(-2 * A, 0) },
  ];
  for (const arm of arms) {
    // body: brushed graphite (concentric hairlines)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#8d939c';
    ctx.lineWidth = 2 * T;
    ctx.beginPath(); ctx.arc(arm.c[0], arm.c[1], A, arm.a0, arm.a1); ctx.stroke();
    ctx.lineCap = 'butt';
    for (let o = -T + 1.5, k = 0; o < T - 1; o += 1.6, k++) {
      const l = 140 + ((k * 37) % 13) + (k % 3) * 5;
      ctx.strokeStyle = `rgb(${l},${l + 3},${l + 8})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(arm.c[0], arm.c[1], A + o, arm.a0 + 0.02, arm.a1 - 0.005); ctx.stroke();
    }
    // world-fixed sheen
    const sheen = ctx.createLinearGradient(CX - 300, CY - 300, CX + 300, CY + 300);
    sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.02)');
    sheen.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.strokeStyle = sheen;
    ctx.lineWidth = 2 * T;
    ctx.beginPath(); ctx.arc(arm.c[0], arm.c[1], A, arm.a0 + 0.02, arm.a1); ctx.stroke();
    // bevel edges
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(200,210,230,0.45)';
    ctx.beginPath(); ctx.arc(arm.c[0], arm.c[1], A + T - 0.8, arm.a0 + 0.02, arm.a1); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.arc(arm.c[0], arm.c[1], A - T + 0.8, arm.a0 + 0.02, arm.a1); ctx.stroke();
    // rounded tip cap
    const tg = ctx.createRadialGradient(arm.tip[0] - 4, arm.tip[1] - 4, 1, arm.tip[0], arm.tip[1], T);
    tg.addColorStop(0, '#d4d8de'); tg.addColorStop(1, '#878d96');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(arm.tip[0], arm.tip[1], T, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,210,230,0.4)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(arm.tip[0], arm.tip[1], T - 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // embossed "BreezeOg" along arm 0
  const text = 'BreezeOg';
  ctx.save();
  ctx.font = '700 21px Inter';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const widths = [...text].map((ch) => ctx.measureText(ch).width + 1.2);
  const total = widths.reduce((a, b) => a + b, 0);
  const mid = 1.31 * Math.PI; // local arc angle where the word is centred (just past the gear, like an engraving)
  let s = -total / 2;
  const [acx, acy] = arms[0].c;
  for (let i = 0; i < text.length; i++) {
    const w = widths[i];
    const phi = mid + (s + w / 2) / A + theta;
    s += w;
    const x = acx + A * Math.cos(phi), y = acy + A * Math.sin(phi);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(phi + Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(text[i], 0.9, 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(text[i], -0.6, -0.6);
    ctx.fillStyle = '#3a3e45'; ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawGear(ctx: CanvasRenderingContext2D, theta: number) {
  const P = rot(theta);
  const R1 = gear.hubR, R0 = gear.hubR - 10, TEETH = 14;
  const chrome = ctx.createLinearGradient(CX - R1, CY - R1, CX + R1, CY + R1);
  chrome.addColorStop(0, '#ffffff');
  chrome.addColorStop(0.22, '#aab2c2');
  chrome.addColorStop(0.42, '#f4f6fa');
  chrome.addColorStop(0.6, '#5a6172');
  chrome.addColorStop(0.8, '#d9dee8');
  chrome.addColorStop(1, '#6d7486');
  ctx.save();
  ctx.beginPath();
  let firstPt = true;
  for (let i = 0; i < TEETH; i++) {
    const a = (i / TEETH) * Math.PI * 2;
    const w = (Math.PI * 2) / TEETH;
    const pts: [number, number][] = [
      [R0, a - w * 0.5], [R0, a - w * 0.28], [R1, a - w * 0.18], [R1, a + w * 0.18], [R0, a + w * 0.28],
    ];
    for (const [r, ang] of pts) {
      const [x, y] = P(r * Math.cos(ang), r * Math.sin(ang));
      if (firstPt) { ctx.moveTo(x, y); firstPt = false; } else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 18;
  ctx.fillStyle = chrome; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
  // inner recessed ring
  const inner = ctx.createLinearGradient(CX + 40, CY - 40, CX - 40, CY + 40);
  inner.addColorStop(0, '#f2f4f8'); inner.addColorStop(0.5, '#4d5466'); inner.addColorStop(1, '#c9cfdb');
  ctx.fillStyle = inner;
  ctx.beginPath(); ctx.arc(CX, CY, R0 - 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  // bolts
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const [x, y] = P(30 * Math.cos(a), 30 * Math.sin(a));
    const bg = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#5d6474');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  // centre cap with specular highlight
  const cap = ctx.createRadialGradient(CX - 6, CY - 7, 1, CX, CY, 17);
  cap.addColorStop(0, '#ffffff'); cap.addColorStop(0.35, '#d7dce6'); cap.addColorStop(1, '#3f4555');
  ctx.fillStyle = cap;
  ctx.beginPath(); ctx.arc(CX, CY, 16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function ballPos(f: number, i: number): [number, number] {
  const p = sim.pos[f];
  return [p[2 * i] / posScale, p[2 * i + 1] / posScale];
}

function drawBalls(ctx: CanvasRenderingContext2D, f: number, alphaAll = 1, onlyBall0 = false) {
  const S = getSprites();
  const pf = onlyBall0 ? 0 : f;
  const n = onlyBall0 ? 1 : sim.counts[f];
  const r = sim.radius[pf];
  const flashes = onlyBall0 ? undefined : flashMap.get(f);
  // tension vibration while the ring is full
  const vib = f > FULL_FRAME && f <= BURST_FRAME ? 0.6 + 2.2 * ((f - FULL_FRAME) / (BURST_FRAME - FULL_FRAME)) : 0;
  const haloA = Math.max(0.1, Math.min(0.5, 0.5 * Math.sqrt(12 / n))) * alphaAll;

  // trails (last 6 positions, fading)
  if (!onlyBall0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const [x, y] = ballPos(f, i);
      const spr = S.colors[i % palette.length].halo;
      for (let k = 1; k <= 6; k++) {
        const g = f - k;
        if (g < 0 || i >= sim.counts[g]) break;
        const [tx, ty] = ballPos(g, i);
        const d = Math.hypot(tx - x, ty - y);
        if (d < r * 0.35 * k) continue;
        const a = 0.34 * (1 - k / 7) * alphaAll;
        const rr = r * (1.25 - k * 0.11);
        ctx.globalAlpha = a;
        ctx.drawImage(spr, tx - rr, ty - rr, rr * 2, rr * 2);
      }
    }
    ctx.restore();
  }
  // halos
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    let [x, y] = onlyBall0 ? [sim.meta.ball0.x, sim.meta.ball0.y] : ballPos(f, i);
    if (vib) { x += (hash01(i, f) - 0.5) * 2 * vib; y += (hash01(i + 7777, f) - 0.5) * 2 * vib; }
    const fl = flashes?.has(i);
    const hr = r * (fl ? 3.6 : 2.7);
    ctx.globalAlpha = fl ? Math.min(1, haloA * 1.8 + 0.25) : haloA;
    ctx.drawImage(fl ? S.white.halo : S.colors[i % palette.length].halo, x - hr, y - hr, hr * 2, hr * 2);
  }
  ctx.restore();
  // cores
  ctx.save();
  ctx.globalAlpha = alphaAll;
  // note-triggering (white) balls are drawn last so they are never hidden by a ball spawned on the same hit
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (!flashes?.has(i)) order.push(i);
  if (flashes) for (const i of flashes) if (i < n) order.push(i);
  for (const i of order) {
    let [x, y] = onlyBall0 ? [sim.meta.ball0.x, sim.meta.ball0.y] : ballPos(f, i);
    if (vib) { x += (hash01(i, f) - 0.5) * 2 * vib; y += (hash01(i + 7777, f) - 0.5) * 2 * vib; }
    const fl = flashes?.has(i);
    const rr = fl ? r * 1.08 : r;
    ctx.drawImage(fl ? S.white.sphere : S.colors[i % palette.length].sphere, x - rr, y - rr, rr * 2, rr * 2);
  }
  ctx.restore();
}

function drawBurst(ctx: CanvasRenderingContext2D, f: number) {
  const t = (f - BURST_FRAME) / 60;
  if (t < 0 || t > 2) return;
  const S = getSprites();
  const K = 3.2;
  const travel = (1 - Math.exp(-K * t)) / K;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of sim.burst) {
    const [x, y, vx, vy, c, size, life] = p;
    const u = t / life;
    if (u >= 1) continue;
    const a = Math.pow(1 - u, 1.6);
    const px = x + vx * travel, py = y + vy * travel;
    const s = size * (2.6 + 2.5 * (1 - u));
    ctx.globalAlpha = a;
    ctx.drawImage(S.colors[c].spark, px - s, py - s, s * 2, s * 2);
    // short streak toward origin (light trail)
    const sp = Math.exp(-K * t);
    if (sp > 0.15) {
      ctx.globalAlpha = a * 0.5 * sp;
      const bx = px - vx * 0.02 * sp, by = py - vy * 0.02 * sp;
      ctx.drawImage(S.colors[c].spark, bx - s * 0.7, by - s * 0.7, s * 1.4, s * 1.4);
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ main entry
export function drawFrame(ctx: CanvasRenderingContext2D, f: number, L: Layout) {
  const S = getSprites();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, L.width, L.height);

  const z = cameraZoom(f) * L.sceneScale;
  const sh = sim.shake[f] ?? [0, 0];
  ctx.setTransform(z, 0, 0, z, L.cx + sh[0] - CX * z, L.cy + sh[1] - CY * z);

  const theta = sim.theta[f];
  drawRing(ctx, f);
  if (f < BURST_FRAME) {
    drawBalls(ctx, f);
  }
  drawArms(ctx, theta);
  drawGear(ctx, theta);
  if (f >= BURST_FRAME) {
    drawBurst(ctx, f);
    // the single first ball returns at its frame-0 position for a seamless loop
    const a0 = smoother((f - 1500) / 36);
    if (a0 > 0) drawBalls(ctx, f, a0, true);
  }

  // white flash burst
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (f >= BURST_FRAME - 1) {
    const t = (f - BURST_FRAME) / 60;
    const a = f < BURST_FRAME ? 0.35 : 0.96 * Math.exp(-t / 0.13);
    if (a > 0.002) {
      const p = { x: L.cx, y: L.cy };
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(L.width, L.height));
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.5, `rgba(235,240,255,${a * 0.85})`);
      g.addColorStop(1, `rgba(200,210,255,${a * 0.55})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, L.width, L.height);
    }
  }

  // vignette
  const vg = ctx.createRadialGradient(L.width / 2, L.height * 0.46, Math.min(L.width, L.height) * 0.35, L.width / 2, L.height / 2, Math.hypot(L.width, L.height) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, L.width, L.height);

  // fine film grain (seeded tiles; frame 1559 reuses frame 0's tile for a seamless loop)
  const gi = (f % LAST_FRAME) % 8;
  const tile = S.grain[gi];
  const ox = Math.floor(hash01(gi, 1) * 256), oy = Math.floor(hash01(gi, 2) * 256);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  for (let y = -oy; y < L.height; y += 256) for (let x = -ox; x < L.width; x += 256) ctx.drawImage(tile, x, y);
  ctx.restore();
}
