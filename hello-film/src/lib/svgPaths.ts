import * as THREE from 'three';
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js';
import {interpolate} from 'flubber';

/** parse an svg string -> THREE.ShapePath[] (with ids) */
export function parseSvg(text: string) {
  const data = new SVGLoader().parse(text);
  return data.paths.map((p) => ({id: (p.userData?.node as Element | undefined)?.getAttribute?.('id') ?? '', path: p}));
}
/** arc-length resampled polyline of one svg path (in svg units) */
export function samplePath(sp: THREE.ShapePath, n: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (const sub of sp.subPaths) pts.push(...sub.getSpacedPoints(n));
  return pts;
}
export class ArcPolyline {
  pts: THREE.Vector2[];
  cum: number[];
  length: number;
  constructor(pts: THREE.Vector2[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }
  /** point + tangent at normalised arc length u */
  at(u: number) {
    const s = Math.min(1, Math.max(0, u)) * this.length;
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    const p = this.pts[lo].clone().lerp(this.pts[hi], t);
    const tan = this.pts[hi].clone().sub(this.pts[lo]).normalize();
    return {p, tan, i: lo};
  }
  nearestU(q: THREE.Vector2) {
    let best = 0, bd = Infinity;
    this.pts.forEach((p, i) => { const d = p.distanceToSquared(q); if (d < bd) { bd = d; best = i; } });
    return this.cum[best] / this.length;
  }
}
/** flubber interpolator between two closed rings, resampled to `n` points */
export function ringInterpolator(a: [number, number][], b: [number, number][], n = 256) {
  return interpolate(a, b, {maxSegmentLength: Infinity, string: false} as any) as unknown as (t: number) => [number, number][];
}
/** resample a closed ring to exactly n points by arc length */
export function resampleRing(ring: [number, number][], n: number): [number, number][] {
  const pts = ring.map(([x, y]) => new THREE.Vector2(x, y));
  pts.push(pts[0].clone());
  const pl = new ArcPolyline(pts);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) { const {p} = pl.at(i / n); out.push([p.x, p.y]); }
  return out;
}

import type opentype from 'opentype.js';
/** opentype glyph -> THREE.ShapePath in metres (y up), centred on its advance box */
export function glyphShapePath(font: opentype.Font, ch: string, size: number, mirror = false, x0 = 0, y0 = 0) {
  const path = font.getPath(ch, 0, 0, size);
  const sp = new THREE.ShapePath();
  const sx = mirror ? -1 : 1;
  const X = (x: number) => sx * x + x0, Y = (y: number) => -y + y0;
  for (const c of path.commands as any[]) {
    if (c.type === 'M') sp.moveTo(X(c.x), Y(c.y));
    else if (c.type === 'L') sp.lineTo(X(c.x), Y(c.y));
    else if (c.type === 'Q') sp.quadraticCurveTo(X(c.x1), Y(c.y1), X(c.x), Y(c.y));
    else if (c.type === 'C') sp.bezierCurveTo(X(c.x1), Y(c.y1), X(c.x2), Y(c.y2), X(c.x), Y(c.y));
  }
  return sp;
}
/** glyph -> shapes (with holes), centred at origin */
export function glyphShapes(font: opentype.Font, ch: string, size: number, mirror = false) {
  const bb = font.getPath(ch, 0, 0, size).getBoundingBox();
  const cx = (bb.x1 + bb.x2) / 2, cy = (bb.y1 + bb.y2) / 2;
  const sp = glyphShapePath(font, ch, size, false, -cx, cy);
  let shapes = sp.toShapes(false);
  if (shapes.length === 0 || shapes.every((s) => s.getPoints().length < 3)) shapes = sp.toShapes(true);
  if (mirror) shapes = shapes.map((s) => mirrorShape(s));
  return shapes;
}
function mirrorShape(s: THREE.Shape) {
  const flip = (pts: THREE.Vector2[]) => pts.map((p) => new THREE.Vector2(-p.x, p.y)).reverse();
  const o = new THREE.Shape(flip(s.getPoints(12)));
  o.holes = s.holes.map((h) => new THREE.Path(flip(h.getPoints(12))));
  return o;
}
/** largest outer contour of a glyph as a ring (for morphs) */
export function glyphOuterRing(font: opentype.Font, ch: string, size: number, mirror = false): [number, number][] {
  const shapes = glyphShapes(font, ch, size, mirror);
  let best: THREE.Vector2[] = [], area = -1;
  for (const s of shapes) {
    const pts = s.getPoints(16);
    const a = Math.abs(THREE.ShapeUtils.area(pts));
    if (a > area) { area = a; best = pts; }
  }
  return best.map((p) => [p.x, p.y]);
}
