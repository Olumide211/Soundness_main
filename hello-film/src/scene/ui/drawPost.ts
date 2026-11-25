import post from '../../../public/hello-film-pack/data/social_post_ui.json';
import {UI, rr, font, fmtCount, statusBar, icon} from './common';
import {easeOutCubic, remap, smoothstep, spring, easeInOutCubic, clamp01} from '../../lib/ease';

export const P = post;
export type KeyPos = {x: number; y: number; w: number; h: number};
/** keyboard key rects (pt) */
export function keyRects(): Record<string, KeyPos> {
  const kb = post.keyboard;
  const out: Record<string, KeyPos> = {};
  kb.rows.forEach((row, r) => {
    const rowW = row.length * kb.keyW + (row.length - 1) * kb.gapX;
    const x0 = (UI.w - rowW) / 2;
    [...row].forEach((ch, i) => (out[ch] = {x: x0 + i * (kb.keyW + kb.gapX), y: kb.y + 12 + r * (kb.keyH + kb.gapY), w: kb.keyW, h: kb.keyH}));
  });
  const ry = kb.y + 12 + 3 * (kb.keyH + kb.gapY);
  out[' '] = {x: 98, y: ry, w: 194, h: kb.keyH};
  return out;
}
export const KEYS = keyRects();
export const POST_PILL = {x: post.topBar.right.x, y: post.topBar.y + 5, w: post.topBar.right.w, h: post.topBar.right.h};
/** the published card rect (pt) */
export const CARD = {x: 0, y: 112, w: 390, h: 128, r: 0};

export function typedAt(f: number) {
  return post.typingSchedule.keystrokes.filter((k) => f >= k.frame).map((k) => k.char).join('');
}
export function pressedKey(f: number): string | null {
  for (const k of post.typingSchedule.keystrokes) if (f >= k.frame && f < k.frame + post.typingSchedule.thumbTapDownFrames + 1) return k.char;
  return null;
}

export function drawPost(ctx: CanvasRenderingContext2D, f: number, avatar: CanvasImageSource, fadeOthers = 0, skipCard = false) {
  const kb = post.keyboard;
  screenBg(ctx);
  const keep = 1 - fadeOthers;
  ctx.globalAlpha = keep;
  ctx.globalAlpha = keep * (1 - smoothstep(828, 844, f)); // leaves before the push-in would clip it
  statusBar(ctx);
  ctx.globalAlpha = keep;
  const published = f >= post.publishedPost.appearFrame;
  // top bar
  const tb = post.topBar;
  ctx.font = font(tb.left.font); ctx.fillStyle = tb.left.color; ctx.textAlign = 'left';
  ctx.globalAlpha = keep * (1 - smoothstep(796, 806, f));
  ctx.fillText(tb.left.text, tb.left.x, tb.y + 28);
  const typed = typedAt(f);
  const pill = tb.right;
  const pressed = f >= pill.pressFrame && f < pill.pressFrame + 4;
  ctx.globalAlpha = keep * (typed.length ? 1 : pill.disabledOpacity) * (1 - smoothstep(796, 806, f));
  const ps = pressed ? 0.94 : 1;
  ctx.save(); ctx.translate(pill.x + pill.w / 2, tb.y + 5 + pill.h / 2); ctx.scale(ps, ps);
  rr(ctx, -pill.w / 2, -pill.h / 2, pill.w, pill.h, pill.r); ctx.fillStyle = pressed ? '#D8D8DE' : pill.bg; ctx.fill();
  ctx.fillStyle = pill.fg; ctx.font = font(pill.font); ctx.textAlign = 'center'; ctx.fillText(pill.text, 0, 5.5);
  ctx.restore();
  ctx.globalAlpha = keep;

  if (!published || f < 806) {
    // composer
    const cA = published ? 1 - smoothstep(798, 806, f) : 1;
    ctx.globalAlpha = keep * cA;
    const c = post.composer;
    // composer card: a lit panel so the screen never reads as an empty black area while typing
    rr(ctx, 12, 108, UI.w - 24, 222, 22); ctx.fillStyle = '#1D1D25'; ctx.fill();
    rr(ctx, 12, 108, UI.w - 24, 222, 22); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.drawImage(avatar, LP.ax, LP.ay, LP.as, LP.as);
    ctx.textAlign = 'left';
    ctx.font = 'bold 23px Inter'; ctx.fillStyle = c.name.color; ctx.fillText(c.name.text, LP.nx, LP.ny);
    const nw0 = ctx.measureText(c.name.text).width;
    ctx.font = '400 20px Inter'; ctx.fillStyle = '#9AA0AA'; ctx.fillText(c.handle.text, LP.nx + nw0 + 8, LP.ny);
    ctx.font = '400 34px Inter';
    if (typed.length === 0) { ctx.fillStyle = '#6A707A'; ctx.fillText(c.input.placeholder, LP.ix, LP.iy); }
    ctx.fillStyle = c.input.color; ctx.fillText(typed, LP.ix, LP.iy);
    // toolbar row (media / poll / emoji / location) + audience chip, fills the composer
    ctx.globalAlpha = keep * cA * 0.9;
    rr(ctx, LP.ix, 272, 118, 34, 17); ctx.strokeStyle = '#7C5CFF'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '600 15px Inter'; ctx.fillStyle = '#A795FF'; ctx.fillText('Everyone', LP.ix + 18, 294);
    for (let k = 0; k < 4; k++) { rr(ctx, 236 + k * 34, 278, 22, 22, 6); ctx.strokeStyle = '#7C5CFF'; ctx.lineWidth = 1.6; ctx.stroke(); }
    ctx.globalAlpha = keep * cA;
    // caret: blinks every 16 f while idle, solid while typing
    const lastK = post.typingSchedule.keystrokes.filter((k) => f >= k.frame).pop();
    const idle = !lastK || f - lastK.frame > 6;
    const blinkOn = !idle || Math.floor((f - (lastK?.frame ?? 720)) / 8) % 2 === 0;
    if (blinkOn && f < 792) {
      ctx.font = '400 34px Inter';
      const tw = ctx.measureText(typed).width;
      ctx.fillStyle = c.input.caret.color; ctx.fillRect(LP.ix + tw + 2, LP.iy - 30, 3, 40);
    }
  }
  // keyboard (slides down 796-806)
  const kbOff = easeInOutCubic(remap(f, kb.hideAfterFrame, kb.hideAfterFrame + kb.hideDurationFrames)) * (kb.h + 40);
  if (kbOff < kb.h + 39) {
    ctx.globalAlpha = keep;
    ctx.save(); ctx.translate(0, kbOff);
    ctx.fillStyle = kb.bg; ctx.fillRect(0, kb.y, UI.w, kb.h);
    const pk = pressedKey(f);
    ctx.font = font(kb.font); ctx.textAlign = 'center';
    for (const [ch, r] of Object.entries(KEYS)) {
      rr(ctx, r.x, r.y, r.w, r.h, kb.keyR); ctx.fillStyle = pk === ch ? kb.pressedKeyHighlight : kb.keyBg; ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      if (ch !== ' ') ctx.fillText(ch, r.x + r.w / 2, r.y + 29); else { ctx.font = font('Inter 400 15'); ctx.fillStyle = '#C8C8D0'; ctx.fillText('space', r.x + r.w / 2, r.y + 27); ctx.font = font(kb.font); }
    }
    // shift / delete / return generic keys
    ctx.fillStyle = kb.keyBg; rr(ctx, 3, KEYS['z'].y, 42, kb.keyH, kb.keyR); ctx.fill(); rr(ctx, 345, KEYS['z'].y, 42, kb.keyH, kb.keyR); ctx.fill();
    rr(ctx, 3, KEYS[' '].y, 88, kb.keyH, kb.keyR); ctx.fill(); rr(ctx, 299, KEYS[' '].y, 88, kb.keyH, kb.keyR); ctx.fill();
    // popup above the pressed key
    if (pk && pk !== ' ') {
      const r = KEYS[pk];
      rr(ctx, r.x - 8, r.y - 56, r.w + 16, 60, 10); ctx.fillStyle = '#4A4A55'; ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = font('Inter 400 32'); ctx.fillText(pk, r.x + r.w / 2, r.y - 16); ctx.font = font(kb.font);
    }
    ctx.restore();
  }
  // published card
  if (published && !skipCard) {
    const pp = post.publishedPost;
    const s = 0.96 + 0.04 * spring((f - pp.appearFrame) / 30, 170, 16);
    const a = clamp01((f - pp.appearFrame) / 4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(UI.w / 2, pp.y + 60); ctx.scale(s, s); ctx.translate(-UI.w / 2, -(pp.y + 60));
    drawCardContents(ctx, f, avatar, keep);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** card body: avatar, name, handle, body text, actions with counts (body text always fully opaque for the morph) */
export function drawCardContents(ctx: CanvasRenderingContext2D, f: number, avatar: CanvasImageSource, keep: number, bodyOnly = false) {
  const pp = post.publishedPost;
  const base = ctx.globalAlpha;
  const y = pp.y;
  if (!bodyOnly) {
    ctx.globalAlpha = base * keep;
    rr(ctx, 12, y - 14, UI.w - 24, 178, 22); ctx.fillStyle = '#1D1D25'; ctx.fill();
    ctx.drawImage(avatar, LP.ax, y, LP.as, LP.as);
    ctx.textAlign = 'left';
    ctx.font = 'bold 23px Inter'; ctx.fillStyle = '#FFFFFF'; ctx.fillText(pp.name, LP.nx, y + 20);
    const nw = ctx.measureText(pp.name).width;
    ctx.font = '400 20px Inter'; ctx.fillStyle = '#9AA0AA'; ctx.fillText(pp.handle, LP.nx + nw + 8, y + 20);
    // counts
    const sp = spring((f - post.publishedPost.countUp.startFrame) / 30, pp.countUp.spring.stiffness, pp.countUp.spring.damping, pp.countUp.spring.mass);
    const done = f >= pp.countUp.endFrame;
    for (const act of pp.actions) {
      const liked = act.icon === 'like' && f >= 808;
      const pop = act.icon === 'like' ? 1 + 0.25 * Math.sin(Math.PI * clamp01((f - 808) / 8)) : 1;
      const col = liked ? '#FF4D6D' : '#8A8F98';
      icon(ctx, act.icon, act.x - 50 + 30, CARD_ACT_Y + 2, col, liked, pop * 1.2);
      const v = done ? act.to : act.to * Math.max(0, sp);
      const label = done && (act as any).display ? (act as any).display : fmtCount(v, act.to);
      ctx.font = '500 16px GeistMono'; ctx.fillStyle = col; ctx.textAlign = 'left';
      (ctx as any).fontVariantNumeric = 'tabular-nums';
      ctx.fillText(f >= pp.countUp.startFrame ? label : '0', act.x - 50 + 46, CARD_ACT_Y + 8);
    }
  }
  ctx.globalAlpha = base;
  ctx.font = '400 34px Inter'; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left';
  ctx.fillText(pp.body, LP.nx, CARD_BODY_Y);
  // "..." reply-typing indicators live inside the UI (810-832): small pills rise from under the card and fade
  if (!bodyOnly) drawReplyDots(ctx, f, base);
}

function drawReplyDots(ctx: CanvasRenderingContext2D, f: number, base: number) {
  const sp = post.publishedPost.replyBubbles.spawnFrames;
  sp.forEach((s0, i) => {
    if (f < s0 || f > s0 + 22) return;
    const t = (f - s0) / 22;
    const x = 52 + 56 * i, y = 300 - 46 * easeOutCubic(t);
    ctx.globalAlpha = base * clamp01(t * 6) * (1 - smoothstep(0.55, 1, t));
    rr(ctx, x - 22, y - 13, 44, 26, 13); ctx.fillStyle = '#2A2A34'; ctx.fill();
    ctx.fillStyle = '#B4B8C2';
    for (let k = 0; k < 3; k++) { const b = 0.6 + 0.4 * Math.sin((f - s0) * 0.7 - k * 0.9); ctx.globalAlpha = base * clamp01(t * 6) * (1 - smoothstep(0.55, 1, t)) * b; ctx.beginPath(); ctx.arc(x - 10 + k * 10, y, 3, 0, Math.PI * 2); ctx.fill(); }
  });
  ctx.globalAlpha = base;
}

/** composer / card layout (pt): larger, phone-readable (FIX 5) */
export const LP = {ax: 24, ay: 124, as: 54, nx: 90, ny: 148, ix: 90, iy: 204};
export const CARD_BODY_Y = post.publishedPost.y + 80;
export const CARD_ACT_Y = post.publishedPost.y + 134;
/** lifted dark background with a soft violet glow (never near-black) */
export function screenBg(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#17161E'; ctx.fillRect(0, 0, UI.w, UI.h);
  const g = ctx.createRadialGradient(UI.w * 0.5, UI.h * 0.42, 10, UI.w * 0.5, UI.h * 0.42, UI.h * 0.7);
  g.addColorStop(0, 'rgba(60,52,96,0.55)'); g.addColorStop(1, 'rgba(23,22,30,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, UI.w, UI.h);
}
