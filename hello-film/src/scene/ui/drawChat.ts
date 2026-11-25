import chat from '../../../public/hello-film-pack/data/chat_ui.json';
import {UI, rr, font} from './common';
import {drawPost, P as post, screenBg, LP, CARD_BODY_Y} from './drawPost';
import {easeInOutCubic, remap, smoothstep, clamp01, lerp} from '../../lib/ease';
import {hash, SEEDS} from '../../lib/rng';
import {flicker} from '../../lib/noise';

export const C = chat;
/** safe area (FIX 6): the socket camera shows UI x ~7..384 pt; 72 px at 1080 = 25 pt -> keep text in 34..356 pt */
export const SAFE = {x0: 34, x1: 356};
const REPLY = {...chat.reply, x: SAFE.x0, maxW: SAFE.x1 - SAFE.x0, font: '400 25px Inter', lineHeight: 34};
const TS = SEEDS.tokens;
type Tok = {text: string; x: number; y: number; w: number; frame: number};
let layout: Tok[] | null = null;
function tokenLayout(ctx: CanvasRenderingContext2D): Tok[] {
  if (layout) return layout;
  const r = REPLY;
  ctx.font = r.font;
  const base1 = 228;
  let x = r.x, line = 0;
  layout = r.tokens.map((t, i) => {
    let w = ctx.measureText(t).width;
    let text = t;
    if (x + w > r.x + r.maxW && t.startsWith(' ')) { line++; x = r.x; text = t.trimStart(); w = ctx.measureText(text).width; }
    const tok = {text, x, y: base1 + line * r.lineHeight, w, frame: r.tokenFrames[i]};
    x += w;
    return tok;
  });
  return layout;
}
export const orbRadius = (f: number) => 6 + 114 * smoothstep(880, 1020, f);
export const ORB = {x: chat.orb.centre[0], y: chat.orb.centre[1]};
/** orb colours: white/violet -> warm fire (1020-1060) */
export function orbColours(f: number) {
  const w = smoothstep(1020, 1060, f);
  const core = [lerp(255, 255, w), lerp(255, 200, w), lerp(255, 114, w)];
  const halo = [lerp(124, 224, w), lerp(92, 164, w), lerp(255, 88, w)];
  const fl = lerp(1, flicker(f), w);
  const pulse = 1 + 0.08 * Math.sin((2 * Math.PI * 0.5 * (f - 966)) / 30) * smoothstep(966, 980, f);
  return {core, halo, k: fl * pulse};
}
let handPts: [number, number][] | null = null;
export function setHandOutline(svg: string) {
  const d = svg.match(/ d="([^"]+)"/)![1];
  const nums = d.replace(/[MLZ]/g, ' ').trim().split(/[\s,]+/).map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  // resample to 192 by arc length
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const out: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < 192; k++) {
    const s = (k / 192) * L;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([(pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t - 256) / 256, (pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t - 300) / 256]);
  }
  handPts = out;
}
/** token particle i (0..191): position in pt space and alpha */
export function tokenParticle(i: number, f: number, toks: Tok[]) {
  const ti = Math.floor(i / 24);
  const tok = toks[ti];
  const t0 = tok.frame + (i % 24) * 0.4;
  if (f < t0) return null;
  const sx = tok.x + tok.w * hash(i, TS), sy = tok.y - 8 + 6 * hash(i, TS + 1);
  const R = orbRadius(f);
  const ang = hash(i, TS + 2) * Math.PI * 2 + (f / 30) * (0.6 + 0.5 * hash(i, TS + 3));
  const rad = R * (1.1 + 0.55 * hash(i, TS + 4));
  let ox = ORB.x + Math.cos(ang) * rad, oy = ORB.y + Math.sin(ang) * rad * 0.9;
  // hand stencil outline 990-1015
  const hs = smoothstep(988, 998, f) * (1 - smoothstep(1008, 1016, f));
  if (hs > 0 && handPts) {
    const hp = handPts[i % 192];
    const S = R * 1.55;
    ox = lerp(ox, ORB.x + hp[0] * S, hs); oy = lerp(oy, ORB.y + hp[1] * S, hs);
  }
  const u = easeInOutCubic(clamp01((f - t0) / 22));
  if (u < 1) {
    const cx = (sx + ORB.x) / 2 + 90 + 40 * hash(i, TS + 5), cy = Math.min(sy, ORB.y) - 60;
    const x = (1 - u) * (1 - u) * sx + 2 * u * (1 - u) * cx + u * u * ox;
    const y = (1 - u) * (1 - u) * sy + 2 * u * (1 - u) * cy + u * u * oy;
    return {x, y, a: 1, s: lerp(1.5, 4, hash(i, TS + 6)), c: u};
  }
  return {x: ox, y: oy, a: 0.9, s: lerp(1.5, 4, hash(i, TS + 6)), c: 1};
}

export function drawChat(ctx: CanvasRenderingContext2D, f: number, avatar: CanvasImageSource) {
  const m = easeInOutCubic(remap(f, 840, 862));
  screenBg(ctx);
  // the other post UI fades
  if (m < 1) { ctx.save(); ctx.globalAlpha = 1 - m; drawPost(ctx, f, avatar, 0, true); ctx.restore(); }
  // header
  ctx.globalAlpha = m;
  ctx.font = '600 19px Inter'; ctx.fillStyle = chat.header.color; ctx.textAlign = 'center';
  ctx.fillText(chat.header.title, UI.w / 2, 112);
  ctx.globalAlpha = 1;
  // CARD -> BUBBLE (x, y, w, h, radius interpolation)
  const ub = {...chat.userBubble, x2: SAFE.x1, padX: 16, padY: 11, y: 152};
  ctx.font = '400 20px Inter';
  const tw = ctx.measureText(ub.text).width;
  const bw = tw + ub.padX * 2, bh = 20 + ub.padY * 2 + 3;
  const card = {x: 12, y: post.publishedPost.y - 14, w: UI.w - 24, h: 178, r: 22};
  const bub = {x: ub.x2 - bw, y: ub.y - 10, w: bw, h: bh, r: ub.r};
  const R = {x: lerp(card.x, bub.x, m), y: lerp(card.y, bub.y, m), w: lerp(card.w, bub.w, m), h: lerp(card.h, bub.h, m), r: lerp(card.r, bub.r, m)};
  rr(ctx, R.x, R.y, R.w, R.h, R.r);
  ctx.fillStyle = `rgb(${Math.round(lerp(29, 40, m))},${Math.round(lerp(29, 40, m))},${Math.round(lerp(37, 52, m))})`; ctx.fill();
  const dim = 1 - 0.7 * smoothstep(966, 1020, f);
  const fs = lerp(34, 20, m);
  ctx.font = `400 ${fs}px Inter`; ctx.fillStyle = '#F4F4F6'; ctx.textAlign = 'left';
  ctx.globalAlpha = dim;
  ctx.fillText(ub.text, lerp(LP.nx, bub.x + ub.padX, m), lerp(CARD_BODY_Y, bub.y + bh / 2 + 7, m));
  // reply tokens
  const toks = tokenLayout(ctx);
  const r = REPLY;
  ctx.font = r.font;
  let lastX = r.x, lastY = 228;
  for (const t of toks) {
    if (f < t.frame) break;
    const a = clamp01((f - t.frame) / r.tokenFadeFrames);
    const blur = lerp(r.tokenBlurPx[0], r.tokenBlurPx[1], a);
    ctx.save();
    ctx.globalAlpha = a * dim;
    ctx.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
    ctx.fillStyle = r.color; ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
    lastX = t.x + t.w; lastY = t.y;
  }
  // cursor
  if (f >= 874 && f < r.cursor.hideFrame) {
    const cu = r.cursor;
    ctx.save();
    ctx.shadowColor = `rgba(124,92,255,${cu.glowOpacity})`; ctx.shadowBlur = cu.glowPx;
    ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(f / 6));
    rr(ctx, lastX + 4, lastY - 21, cu.w + 1, cu.h + 4, cu.r); ctx.fillStyle = cu.color; ctx.fill();
    ctx.restore();
  }
  // orb + particles
  if (f >= 878) {
    const oc = orbColours(f);
    const rad = orbRadius(f) * oc.k;
    const g = ctx.createRadialGradient(ORB.x, ORB.y, 0, ORB.x, ORB.y, rad * chat.orb.haloRadiusMul);
    g.addColorStop(0, `rgba(${oc.core.join(',')},1)`);
    g.addColorStop(0.3 / chat.orb.haloRadiusMul * 1.0, `rgba(${oc.core.join(',')},0.95)`);
    g.addColorStop(1 / chat.orb.haloRadiusMul, `rgba(${oc.halo.join(',')},0.55)`);
    g.addColorStop(1, `rgba(${oc.halo.join(',')},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ORB.x, ORB.y, rad * chat.orb.haloRadiusMul, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 192; i++) {
      const p = tokenParticle(i, f, toks);
      if (!p) continue;
      const col = p.c < 1 ? `rgba(${Math.round(lerp(255, 124, p.c))},${Math.round(lerp(255, 92, p.c))},255,${p.a})` : `rgba(${oc.halo.map((v) => Math.round(lerp(v, 255, 0.4))).join(',')},${p.a})`;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
