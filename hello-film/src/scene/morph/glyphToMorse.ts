import * as THREE from 'three';
import {interpolate, separate} from 'flubber';
import {getAssets} from '../../lib/assets';
import morse from '../../../public/hello-film-pack/data/morse_hello.json';
import {PAGE} from '../layout';
import {resampleRing} from '../../lib/svgPaths';

// page canvas: 4000 px per metre
export const PAGE_C = {w: 1200, h: 840, ppm: 4000};
export const TEXT = 'Hello.';
export const FONT_PX = 250;
export type Capsule = {letter: number; dash: boolean; cx: number; cy: number; w: number; h: number; idx: number};
export type GlyphInfo = {ch: string; path: string; ring: [number, number][]; cx: number; cy: number};

let cache: {glyphs: GlyphInfo[]; capsules: Capsule[]; interps: ((t: number) => [number, number][][])[]} | null = null;

function capsuleRing(c: Capsule, n = 48): [number, number][] {
  const r = c.h / 2, hw = c.w / 2 - r;
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const side = Math.cos(a) >= 0 ? 1 : -1;
    out.push([c.cx + side * hw + r * Math.cos(a), c.cy + r * Math.sin(a)]);
  }
  return out;
}
export function morseLayout() {
  if (cache) return cache;
  const font = getAssets().fonts.fraktur;
  const adv = [...TEXT].reduce((s, ch) => s + (font.charToGlyph(ch).advanceWidth ?? 0) * FONT_PX / font.unitsPerEm, 0);
  const x0 = (PAGE_C.w - adv) / 2, base = PAGE_C.h * 0.6;
  const glyphs: GlyphInfo[] = [];
  let x = x0;
  const gl = [...TEXT].map((ch) => font.charToGlyph(ch));
  gl.forEach((g, i) => {
    const p = g.getPath(x, base, FONT_PX);
    const bb = p.getBoundingBox();
    // outer ring of the glyph (largest subpath)
    const svg = p.toPathData(2);
    const ring = largestRing(svg);
    glyphs.push({ch: TEXT[i], path: svg, ring, cx: (bb.x1 + bb.x2) / 2, cy: (bb.y1 + bb.y2) / 2});
    x += (g.advanceWidth ?? 0) * (FONT_PX / font.unitsPerEm);
  });
  // capsules (dot 3 mm circle, dash 9x3 mm) centred under each glyph of HELLO
  const mm = PAGE_C.ppm / 1000;
  const pattern = morse.pattern.split(' ');
  const capsules: Capsule[] = [];
  let idx = 0;
  pattern.forEach((sym, li) => {
    const g = glyphs[li];
    const ws = [...sym].map((s) => (s === '-' ? 9 : 3) * mm);
    const gap = 2.2 * mm;
    const total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
    let cx = g.cx - total / 2;
    [...sym].forEach((s, k) => {
      capsules.push({letter: li, dash: s === '-', cx: cx + ws[k] / 2, cy: g.cy, w: ws[k], h: 3 * mm, idx: idx++});
      cx += ws[k] + gap;
    });
  });
  const interps = pattern.map((_, li) => {
    const from = resampleRing(glyphs[li].ring, 160);
    const to = capsules.filter((c) => c.letter === li).map((c) => capsuleRing(c));
    if (to.length === 1) {
      const f = interpolate(from, to[0], {string: false, maxSegmentLength: 6} as any) as unknown as (t: number) => [number, number][];
      return (t: number) => [f(t)];
    }
    return separate(from, to, {string: false, single: false, maxSegmentLength: 6} as any) as unknown as ((t: number) => [number, number][])[] as any;
  }).map((fn: any) => (Array.isArray(fn) ? (t: number) => fn.map((g: any) => g(t)) : fn));
  cache = {glyphs, capsules, interps};
  return cache;
}
function largestRing(d: string): [number, number][] {
  const p = new Path2D(d);
  void p;
  // parse via SVGLoader-free approach: sample with an offscreen path through THREE
  const shapes = new (THREE as any).ShapePath();
  const re = /([MLQCZ])([^MLQCZ]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const n = m[2].trim().split(/[ ,]+/).filter(Boolean).map(Number);
    if (m[1] === 'M') shapes.moveTo(n[0], n[1]);
    else if (m[1] === 'L') shapes.lineTo(n[0], n[1]);
    else if (m[1] === 'Q') shapes.quadraticCurveTo(n[0], n[1], n[2], n[3]);
    else if (m[1] === 'C') shapes.bezierCurveTo(n[0], n[1], n[2], n[3], n[4], n[5]);
  }
  let best: THREE.Vector2[] = [], area = -1;
  for (const sp of shapes.subPaths as THREE.Path[]) {
    const pts = sp.getPoints(10);
    const a = Math.abs(THREE.ShapeUtils.area(pts));
    if (a > area) { area = a; best = pts; }
  }
  return best.map((p) => [p.x, p.y]);
}
/** page canvas px -> page-local metres (x right, d = distance from the hinge) */
export const pxToPage = (px: number, py: number) => ({x: px / PAGE_C.ppm - PAGE.w / 2, d: PAGE.h * (1 - py / PAGE_C.h)});
