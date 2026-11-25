// shared Canvas2D helpers for the phone UI (drawn in 390x844 pt space, scale 3 -> 1170x2532)
export const UI = {w: 390, h: 844, scale: 3};
export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** "Inter 600 16" -> css font */
export const font = (spec: string) => {
  const [fam, w, s] = spec.split(' ');
  return `${w} ${s}px ${fam}`;
};
export function fmtCount(n: number, target: number) {
  if (target >= 10000) return n >= 9500 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`;
  if (target >= 1000) return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`;
  return `${Math.round(n)}`;
}
export function statusBar(ctx: CanvasRenderingContext2D, color = '#FFFFFF') {
  ctx.fillStyle = color;
  ctx.font = font('Inter 600 15');
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('9:41', 40, 34);
  // generic signal / battery glyphs (no real logos)
  ctx.globalAlpha *= 0.95;
  for (let i = 0; i < 4; i++) rr(ctx, 292 + i * 6, 30 - (i + 1) * 3, 4, (i + 1) * 3, 1), ctx.fill();
  rr(ctx, 330, 22, 26, 12, 3.5); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
  rr(ctx, 332, 24, 19, 8, 2); ctx.fill();
  rr(ctx, 357, 26, 2, 4, 1); ctx.fill();
}
export function icon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, color: string, fill = false, scale = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'reply') { rr(ctx, -8, -7, 16, 12, 5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-3, 5); ctx.lineTo(-5, 9); ctx.lineTo(1, 5); ctx.stroke(); }
  else if (kind === 'repost') { ctx.moveTo(-8, 2); ctx.lineTo(-8, -4); ctx.lineTo(5, -4); ctx.moveTo(2, -7); ctx.lineTo(5, -4); ctx.lineTo(2, -1); ctx.moveTo(8, -2); ctx.lineTo(8, 4); ctx.lineTo(-5, 4); ctx.moveTo(-2, 1); ctx.lineTo(-5, 4); ctx.lineTo(-2, 7); ctx.stroke(); }
  else if (kind === 'like') { ctx.moveTo(0, 7); ctx.bezierCurveTo(-11, -1, -7, -10, 0, -4); ctx.bezierCurveTo(7, -10, 11, -1, 0, 7); ctx.closePath(); if (fill) ctx.fill(); else ctx.stroke(); }
  else if (kind === 'views') { ctx.moveTo(-6, 7); ctx.lineTo(-6, 1); ctx.moveTo(-1, 7); ctx.lineTo(-1, -6); ctx.moveTo(4, 7); ctx.lineTo(4, -2); ctx.stroke(); }
  ctx.restore();
}
