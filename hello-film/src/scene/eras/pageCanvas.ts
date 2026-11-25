import {morseLayout, PAGE_C, FONT_PX} from '../morph/glyphToMorse';
import {easeInOutCubic, remap, smoothstep, clamp01} from '../../lib/ease';
export {PAGE_C};

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
/** printed side of the page: "Hello." in UnifrakturMaguntia, bleed 0 -> 0.35 mm over 20 f, glyph -> Morse morph 375-401 */
export function drawPage(c: HTMLCanvasElement, bump: HTMLCanvasElement, f: number) {
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#F1E7D2';
  ctx.fillRect(0, 0, c.width, c.height);
  // subtle paper tone variation
  const g = ctx.createRadialGradient(c.width * 0.5, c.height * 0.45, 50, c.width * 0.5, c.height * 0.5, c.width * 0.7);
  g.addColorStop(0, 'rgba(255,250,240,0.0)'); g.addColorStop(1, 'rgba(120,90,50,0.16)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  const L = morseLayout();
  const bleedPx = 0.35 * (PAGE_C.ppm / 1000) * smoothstep(330, 350, f);
  const mt = easeInOutCubic(remap(f, 375, 397));
  const fadeOut = 1 - smoothstep(397, 403, f); // 3D capsules take over (<= 6 f blend)
  const ink = [18, 16, 16], elec = [120, 170, 230];
  const bctx = bump.getContext('2d')!;
  bctx.fillStyle = '#000'; bctx.fillRect(0, 0, bump.width, bump.height);
  if (f < 330) return;
  ctx.save();
  if (mt <= 0) {
    ctx.fillStyle = '#121010';
    ctx.shadowColor = 'rgba(18,16,16,0.85)'; ctx.shadowBlur = bleedPx * 2.2;
    for (const gl of L.glyphs) ctx.fill(new Path2D(gl.path));
    bctx.save(); bctx.scale(0.5, 0.5); bctx.filter = 'blur(2px)'; bctx.fillStyle = '#fff';
    for (const gl of L.glyphs) bctx.fill(new Path2D(gl.path));
    bctx.restore();
  } else {
    const col = mix(ink, elec, smoothstep(0.3, 1, mt));
    ctx.globalAlpha = fadeOut;
    ctx.fillStyle = `rgb(${col.join(',')})`;
    ctx.shadowColor = `rgba(${col.join(',')},0.8)`; ctx.shadowBlur = bleedPx * 2.2 + 10 * mt;
    L.interps.forEach((fn) => {
      for (const ring of fn(mt)) {
        ctx.beginPath(); ring.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
      }
    });
    // the period fades
    ctx.globalAlpha = (1 - clamp01(mt * 2)) * fadeOut;
    ctx.fillStyle = '#121010';
    ctx.fill(new Path2D(L.glyphs[5].path));
  }
  ctx.restore();
  void FONT_PX;
}
