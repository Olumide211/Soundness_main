import * as THREE from 'three';
import { rr } from './rng';

/** Unit puddle (radius ~1, height 1) with meniscus edge and irregular outline. Scale x/z for radius, y for height. */
export function makePuddleGeometry(seed: number, segs = 96, rings = 16, wobble = 0.12) {
  const harm: { a: number; p: number; k: number }[] = [];
  for (let k = 2; k <= 7; k++) harm.push({ k, a: rr(seed * 50 + k, 0.3, 1) * wobble / (k * 0.5), p: rr(seed * 50 + k + 20, 0, Math.PI * 2) });
  const outline = (th: number) => 1 + harm.reduce((s, h) => s + h.a * Math.sin(h.k * th + h.p), 0);
  const pos: number[] = [];
  const idx: number[] = [];
  pos.push(0, 1, 0);
  for (let r = 1; r <= rings; r++) {
    const s = r / rings;
    const sp = 1 - Math.pow(1 - s, 1.8); // denser near the edge
    const h = Math.pow(Math.max(0, 1 - Math.pow(sp, 6)), 0.38);
    for (let i = 0; i < segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      const R = outline(th) * sp;
      pos.push(Math.cos(th) * R, h, Math.sin(th) * R);
    }
  }
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs, a1 = 1 + r * segs;
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % segs;
      idx.push(a0 + i, a0 + i1, a1 + i);
      idx.push(a0 + i1, a1 + i1, a1 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A drip: vertical, top at y=0 extending to y=-1, narrow neck and a bulb tip. Scale y for length. */
export function makeDripGeometry(neck = 0.16, bulb = 0.3) {
  const pts: THREE.Vector2[] = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const s = i / N; // 0 top .. 1 tip
    let r = neck * (1.4 - 0.4 * s) + (bulb - neck) * Math.pow(Math.sin(Math.min(1, Math.max(0, (s - 0.62) / 0.38)) * Math.PI * 0.62), 1.3);
    if (s > 0.9) r *= Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.9) / 0.1, 2)));
    pts.push(new THREE.Vector2(Math.max(0.0001, r), -s));
  }
  const g = new THREE.LatheGeometry(pts, 20);
  return g;
}
