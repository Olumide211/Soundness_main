// Geometric QA: projects the paper into every frame for both formats.
// Reports the smallest distance (px) from the paper to the frame edge and the
// on-screen size of the BreezeOg wordmark.
import * as THREE from "three";
import { foldPoint, microBend } from "../src/paper/folding";
import { cameraAt, CAM_FAR, CAM_NEAR, DURATION, foldState, paperTransform, SHEET_H, vfovFor } from "../src/timeline";

const formats = [
  { name: "4x5", w: 1080, h: 1350 },
  { name: "9x16", w: 1080, h: 1920 },
];
const SAFE = Number(process.env.SAFE ?? 72);
const pts: [number, number][] = [];
const N = 24;
for (let i = 0; i <= N; i++) {
  const t = i / N;
  pts.push([t - 0.5, -SHEET_H / 2], [t - 0.5, SHEET_H / 2]);
  pts.push([-0.5, (t - 0.5) * SHEET_H], [0.5, (t - 0.5) * SHEET_H]);
}
for (let i = 1; i < 8; i++) for (let j = 1; j < 11; j++) pts.push([i / 8 - 0.5, (j / 11 - 0.5) * SHEET_H]);
// wordmark box on the back face (flat sheet coords)
const WM = [
  [-0.44, -0.632],
  [-0.261, -0.632],
  [-0.44, -0.603],
  [-0.261, -0.603],
];
const frames = process.argv.slice(2).map(Number);
const range = frames.length ? frames : Array.from({ length: DURATION }, (_, i) => i);
for (const fm of formats) {
  const cam = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(vfovFor(fm.w / fm.h)), fm.w / fm.h, CAM_NEAR, CAM_FAR);
  let worst = { m: Infinity, f: -1 };
  const bad: number[] = [];
  const rows: string[] = [];
  for (const f of range) {
    const c = cameraAt(f);
    cam.position.copy(c.position);
    cam.up.copy(c.up);
    cam.lookAt(c.target);
    cam.updateMatrixWorld(true);
    const st = foldState(f);
    const { pos, quat } = paperTransform(f);
    const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(quat.clone().invert());
    let m = Infinity;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const v = new THREE.Vector3();
    for (const [x, y] of pts) {
      foldPoint(x, y, 0, st, f, v);
      microBend(v, upLocal);
      v.applyQuaternion(quat).add(pos).project(cam);
      const sx = ((v.x + 1) / 2) * fm.w;
      const sy = ((1 - v.y) / 2) * fm.h;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      m = Math.min(m, sx, fm.w - sx, sy, fm.h - sy);
    }
    if (m < worst.m) worst = { m, f };
    if (m < SAFE) bad.push(f);
    let wm = "";
    if (frames.length) {
      const s = WM.map(([x, y]) => {
        foldPoint(x, y, 0, st, f, v);
        v.applyQuaternion(quat).add(pos).project(cam);
        return new THREE.Vector2(((v.x + 1) / 2) * fm.w, ((1 - v.y) / 2) * fm.h);
      });
      wm = ` wordmark len=${s[0].distanceTo(s[1]).toFixed(0)}px capH=${s[0].distanceTo(s[2]).toFixed(1)}px`;
      rows.push(`  f${f}: margin=${m.toFixed(0)} bbox=${(maxX - minX).toFixed(0)}x${(maxY - minY).toFixed(0)} dist=${c.position.distanceTo(pos).toFixed(2)}${wm}`);
    }
  }
  console.log(`${fm.name}: min margin ${worst.m.toFixed(1)}px at f${worst.f}; frames under ${SAFE}px: ${bad.length ? bad.join(",") : "none"}`);
  rows.forEach((r) => console.log(r));
}
