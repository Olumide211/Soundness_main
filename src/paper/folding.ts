import * as THREE from "three";
import { FoldState, OP_COUNT, SHEET_H, SHEET_W } from "../timeline";

/**
 * Real-geometry paper folding.
 *
 * The sheet is a subdivided plane (front + back face offset by the paper
 * thickness + a thin edge strip). Every fold is a crease line in the sheet's
 * plane. A fold bends all vertices on the moving side of the crease around a
 * small cylinder (crease radius) and then continues along a curve (curl) so the
 * flap flexes while folding. Folds are composed in sequence, each crease being
 * defined in the configuration produced by the previous (fully applied) folds,
 * exactly like folding a physical sheet.
 */

export const NX = 96;
export const NY = 136;
export const THICKNESS = 0.6 / 210; // 0.6 mm on a 210 mm wide sheet

const HH = SHEET_H / 2;
const HW = SHEET_W / 2;

type Op = {
  ox: number;
  oy: number;
  ux: number;
  uy: number;
  r: number; // crease radius
  nz: number; // +1: flap goes to -Z (behind the print), -1: flap goes to +Z
  usePre?: boolean; // decide side from the configuration before the wing folds
};

const norm = (x: number, y: number) => {
  const l = Math.hypot(x, y);
  return [x / l, y / l];
};

const s225 = Math.sin(Math.PI / 8);
const c225 = Math.cos(Math.PI / 8);
const wingDir = norm(0.12, -SHEET_H); // wing crease direction (nose -> tail)
const wingTop = 0.05;

export const OPS: Op[] = [
  // 0: center crease (fold + open)
  { ox: 0, oy: 0, ux: 1, uy: 0, r: 0.006, nz: 1 },
  // 1/2: top corners to the center crease
  { ox: 0, oy: HH, ux: Math.SQRT1_2, uy: Math.SQRT1_2, r: 0.004, nz: 1 },
  { ox: 0, oy: HH, ux: -Math.SQRT1_2, uy: Math.SQRT1_2, r: 0.004, nz: 1 },
  // 3/4: new slanted edges to the center again (22.5° creases from the nose)
  { ox: 0, oy: HH, ux: c225, uy: s225, r: 0.012, nz: 1 },
  { ox: 0, oy: HH, ux: -c225, uy: s225, r: 0.012, nz: 1 },
  // 5/6: wings (fold outward, back side ends up on top of the wings)
  { ox: wingTop, oy: HH, ux: -wingDir[1], uy: wingDir[0], r: 0.006, nz: -1 },
  { ox: -wingTop, oy: HH, ux: wingDir[1], uy: wingDir[0], r: 0.006, nz: -1 },
  // 7/8: fold the whole thing in half along the center (keel)
  { ox: 0, oy: 0, ux: 1, uy: 0, r: 0.028, nz: 1, usePre: true },
  { ox: 0, oy: 0, ux: -1, uy: 0, r: 0.028, nz: 1, usePre: true },
];
if (OPS.length !== OP_COUNT) throw new Error("op count mismatch");
// make sure the wing "u" axes point outward
{
  const r = OPS[5];
  if (r.ux < 0) {
    r.ux = -r.ux;
    r.uy = -r.uy;
  }
  const l = OPS[6];
  if (l.ux > 0) {
    l.ux = -l.ux;
    l.uy = -l.uy;
  }
}

const tmp = { x: 0, y: 0, z: 0 };

/** Bend point (in-place in tmp) for one op. */
function bend(op: Op, angle: number, curl: number, preU: number | null) {
  if (angle === 0 && curl === 0) return;
  const rx = tmp.x - op.ox;
  const ry = tmp.y - op.oy;
  const rz = tmp.z;
  const u = rx * op.ux + ry * op.uy;
  const test = preU === null ? u : preU;
  if (test <= 0) return;
  const w = rz * op.nz;
  // along-crease component
  const ax = rx - op.ux * u;
  const ay = ry - op.uy * u;
  const r = op.r;
  const phi = angle;
  const s0 = r * phi;
  let pu: number;
  let pw: number;
  if (test < s0) {
    const a = u / r;
    const rho = r + w;
    pu = rho * Math.sin(a);
    pw = -r + rho * Math.cos(a);
  } else {
    const s = u - s0;
    const k = curl;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    let cu: number;
    let cw: number;
    let beta: number;
    if (Math.abs(k) < 1e-5) {
      beta = phi;
      cu = r * sp + s * cp;
      cw = -r + r * cp - s * sp;
    } else {
      beta = phi - k * s;
      cu = r * sp + (sp - Math.sin(beta)) / k;
      cw = -r + r * cp - (Math.cos(beta) - cp) / k;
    }
    pu = cu + w * Math.sin(beta);
    pw = cw + w * Math.cos(beta);
  }
  tmp.x = op.ox + ax + op.ux * pu;
  tmp.y = op.oy + ay + op.uy * pu;
  tmp.z = pw * op.nz;
}

const rippleAt = (x: number, y: number, f: number) =>
  0.011 * Math.sin(2.3 * x + 1.7 * y + f * 0.23) +
  0.007 * Math.sin(3.7 * y - 1.1 * x - f * 0.31 + 1.0) +
  0.004 * Math.sin(6.1 * x + 5.3 * y + f * 0.47);

/** Transform a flat sheet point (x, y, depth) through the fold chain. */
export function foldPoint(x: number, y: number, depth: number, st: FoldState, f: number, out: THREE.Vector3) {
  tmp.x = x;
  tmp.y = y;
  tmp.z = depth;
  if (st.ripple > 0) {
    // keep ripple zero along the edges a little less to look like held paper in wind
    tmp.z += st.ripple * rippleAt(x, y, f) * (0.35 + 0.65 * Math.min(1, Math.abs(y + HH) / 0.6));
  }
  let preX = 0;
  for (let k = 0; k < OP_COUNT; k++) {
    if (k === 5) preX = tmp.x; // configuration after the four flat folds
    const op = OPS[k];
    let pre: number | null = null;
    if (op.usePre) pre = (preX - op.ox) * op.ux;
    bend(op, st.angles[k], st.curls[k], pre);
  }
  out.set(tmp.x, tmp.y, tmp.z);
  return out;
}

export type PaperGeo = {
  geometry: THREE.BufferGeometry;
  update: (st: FoldState, f: number) => void;
};

export function buildPaperGeometry(): PaperGeo {
  const cols = NX + 1;
  const rows = NY + 1;
  const nFace = cols * rows;
  // boundary loop (counter-clockwise seen from front)
  const loop: number[] = [];
  for (let i = 0; i < NX; i++) loop.push(i); // bottom row left->right
  for (let j = 0; j < NY; j++) loop.push(j * cols + NX); // right col bottom->top
  for (let i = NX; i > 0; i--) loop.push(NY * cols + i); // top row right->left
  for (let j = NY; j > 0; j--) loop.push(j * cols); // left col top->bottom
  const nb = loop.length;
  const total = nFace * 2 + nb * 2;

  const flatX = new Float32Array(total);
  const flatY = new Float32Array(total);
  const depth = new Float32Array(total);
  const uv = new Float32Array(total * 2);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const id = j * cols + i;
      const u = i / NX;
      const v = j / NY;
      const x = (u - 0.5) * SHEET_W;
      const y = (v - 0.5) * SHEET_H;
      flatX[id] = x;
      flatY[id] = y;
      depth[id] = 0;
      uv[id * 2] = u;
      uv[id * 2 + 1] = v;
      const b = nFace + id;
      flatX[b] = x;
      flatY[b] = y;
      depth[b] = -THICKNESS;
      uv[b * 2] = 1 - u; // back is printed mirrored so it reads correctly from behind
      uv[b * 2 + 1] = v;
    }
  }
  for (let k = 0; k < nb; k++) {
    const src = loop[k];
    for (const [off, d] of [
      [0, 0],
      [nb, -THICKNESS],
    ] as const) {
      const id = nFace * 2 + k + off;
      flatX[id] = flatX[src];
      flatY[id] = flatY[src];
      depth[id] = d;
      uv[id * 2] = 1 - uv[src * 2];
      uv[id * 2 + 1] = uv[src * 2 + 1];
    }
  }

  const idxFront: number[] = [];
  const idxBack: number[] = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // alternate diagonals for a more isotropic bend
      if ((i + j) % 2 === 0) {
        idxFront.push(a, b, d, a, d, c);
        idxBack.push(nFace + a, nFace + d, nFace + b, nFace + a, nFace + c, nFace + d);
      } else {
        idxFront.push(a, b, c, b, d, c);
        idxBack.push(nFace + a, nFace + c, nFace + b, nFace + b, nFace + c, nFace + d);
      }
    }
  }
  const idxEdge: number[] = [];
  for (let k = 0; k < nb; k++) {
    const k2 = (k + 1) % nb;
    const f0 = nFace * 2 + k;
    const f1 = nFace * 2 + k2;
    const b0 = f0 + nb;
    const b1 = f1 + nb;
    // outward facing strip
    idxEdge.push(f0, b0, f1, f1, b0, b1);
  }
  const index = [...idxFront, ...idxBack, ...idxEdge];
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(total * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.addGroup(0, idxFront.length, 0);
  geometry.addGroup(idxFront.length, idxBack.length, 1);
  geometry.addGroup(idxFront.length + idxBack.length, idxEdge.length, 2);

  const v = new THREE.Vector3();
  const update = (st: FoldState, f: number) => {
    for (let i = 0; i < total; i++) {
      foldPoint(flatX[i], flatY[i], depth[i], st, f, v);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
    }
    (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  };
  return { geometry, update };
}

// ---------------------------------------------------------------------------
// Crease maps (in flat sheet space). One mask per fold, accumulated over time.
// ---------------------------------------------------------------------------
export function buildCreaseMasks(w: number, h: number, mirrored: boolean): HTMLCanvasElement[] {
  const masks: HTMLCanvasElement[] = [];
  const datas: ImageData[] = [];
  for (let k = 0; k < OP_COUNT; k++) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    masks.push(c);
    datas.push(c.getContext("2d")!.createImageData(w, h));
  }
  const sharp = 0.0017;
  const soft = 0.011;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let u0 = (px + 0.5) / w;
      if (mirrored) u0 = 1 - u0;
      let x = (u0 - 0.5) * SHEET_W;
      let y = (0.5 - (py + 0.5) / h) * SHEET_H;
      const o = (py * w + px) * 4;
      for (let k = 0; k < OP_COUNT; k++) {
        const op = OPS[k];
        const u = (x - op.ox) * op.ux + (y - op.oy) * op.uy;
        const d = Math.abs(u);
        // valley lines: dark core + soft shading
        const dark = 0.26 * Math.exp(-(d * d) / (sharp * sharp)) + 0.09 * Math.exp(-(d * d) / (soft * soft));
        const val = Math.round(255 * (1 - dark));
        const id = datas[k].data;
        id[o] = val;
        id[o + 1] = Math.round(255 * (1 - dark * 0.96));
        id[o + 2] = Math.round(255 * (1 - dark * 0.9));
        id[o + 3] = 255;
        // flat folds reflect the moving side for the following creases
        if (k >= 1 && k <= 4 && u > 0) {
          x -= 2 * u * op.ux;
          y -= 2 * u * op.uy;
        }
      }
    }
  }
  masks.forEach((c, k) => c.getContext("2d")!.putImageData(datas[k], 0, 0));
  return masks;
}
