import * as THREE from 'three';
/** closed superellipse |x/a|^n + |y/b|^n = 1 as points (n = 2 is an ellipse) */
export function superellipse(a: number, b: number, n: number, seg = 128): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const e = 2 / n;
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    out.push(new THREE.Vector3(a * Math.sign(c) * Math.pow(Math.abs(c), e), b * Math.sign(s) * Math.pow(Math.abs(s), e), 0));
  }
  return out;
}
