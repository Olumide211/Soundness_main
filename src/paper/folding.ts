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
export const THICKNESS = 0.25 / 210; // 0.25 mm on a 210 mm wide sheet
export const MICRO = 1.5 / 210; // ±1.5 mm micro-bend

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
  // 0: center crease (fold + open). Photo side up on the table: lifts toward +Z
  { ox: 0, oy: 0, ux: 1, uy: 0, r: 0.003, nz: -1 },
  // (the sheet is then turned over; all following folds lift toward -Z = up)
  // 1/2: top corners to the center crease
  { ox: 0, oy: HH, ux: Math.SQRT1_2, uy: Math.SQRT1_2, r: 0.0025, nz: 1 },
  { ox: 0, oy: HH, ux: -Math.SQRT1_2, uy: Math.SQRT1_2, r: 0.0025, nz: 1 },
  // 3/4: new slanted edges to the center again (22.5° creases from the nose)
  { ox: 0, oy: HH, ux: c225, uy: s225, r: 0.0065, nz: 1 },
  { ox: 0, oy: HH, ux: -c225, uy: s225, r: 0.0065, nz: 1 },
  // 5/6: wings (fold outward, back side ends up on top of the wings)
  { ox: wingTop, oy: HH, ux: -wingDir[1], uy: wingDir[0], r: 0.004, nz: -1 },
  { ox: -wingTop, oy: HH, ux: wingDir[1], uy: wingDir[0], r: 0.004, nz: -1 },
  // 7/8: fold the whole thing in half along the center (keel)
  { ox: 0, oy: 0, ux: 1, uy: 0, r: 0.018, nz: 1, usePre: true },
  { ox: 0, oy: 0, ux: -1, uy: 0, r: 0.018, nz: 1, usePre: true },
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

/** smooth pseudo-noise in [-1, 1] */
const sn = (x: number, y: number, z: number, p: number) =>
  0.5 * Math.sin(6.3 * x + 2.1 * y + 4.7 * z + 1.3 + p) +
  0.32 * Math.sin(3.1 * x - 5.4 * y + 1.9 * z + 0.4 + p * 1.7) +
  0.18 * Math.sin(9.7 * x + 7.9 * y - 3.3 * z + 2.2 + p * 2.3);

/**
 * Micro-bend: a smooth displacement field evaluated on the *folded* position, so
 * stacked layers move together and never intersect. Biased "up" (away from the
 * surface the sheet rests on).
 */
export function microBend(v: THREE.Vector3, up: THREE.Vector3) {
  const a = 0.5 + 0.5 * sn(v.x, v.y, v.z, 0);
  const bx = sn(v.x, v.y, v.z, 3.1);
  const by = sn(v.x, v.y, v.z, 5.7);
  const bz = sn(v.x, v.y, v.z, 8.3);
  v.x += MICRO * (up.x * a + 0.22 * bx);
  v.y += MICRO * (up.y * a + 0.22 * by);
  v.z += MICRO * (up.z * a + 0.22 * bz);
  return v;
}

/** Transform a flat sheet point (x, y, depth) through the fold chain. */
export function foldPoint(x: number, y: number, depth: number, st: FoldState, _f: number, out: THREE.Vector3) {
  tmp.x = x;
  tmp.y = y;
  tmp.z = depth;
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
  update: (st: FoldState, f: number, upLocal: THREE.Vector3) => void;
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
  const update = (st: FoldState, f: number, upLocal: THREE.Vector3) => {
    for (let i = 0; i < total; i++) {
      foldPoint(flatX[i], flatY[i], depth[i], st, f, v);
      microBend(v, upLocal);
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
export type CreaseMasks = { dark: HTMLCanvasElement[]; light: HTMLCanvasElement[] };
export function buildCreaseMasks(w: number, h: number, mirrored: boolean): CreaseMasks {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  const dark: HTMLCanvasElement[] = [];
  const light: HTMLCanvasElement[] = [];
  const dd: ImageData[] = [];
  const ld: ImageData[] = [];
  for (let k = 0; k < OP_COUNT; k++) {
    dark.push(mk());
    light.push(mk());
    dd.push(dark[k].getContext("2d")!.createImageData(w, h));
    ld.push(light[k].getContext("2d")!.createImageData(w, h));
  }
  const core = 0.0017; // thin AO line
  const soft = 0.007;
  const ridgeOff = 0.0034; // highlight ridge just beside the crease
  const ridgeW = 0.0013;
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
        const ao = 0.2 * Math.exp(-(d * d) / (core * core)) + 0.06 * Math.exp(-(d * d) / (soft * soft));
        const a = dd[k].data;
        a[o] = Math.round(255 * (1 - ao));
        a[o + 1] = Math.round(255 * (1 - ao * 0.97));
        a[o + 2] = Math.round(255 * (1 - ao * 0.92));
        a[o + 3] = 255;
        const r = u - ridgeOff;
        const hl = 0.26 * Math.exp(-(r * r) / (ridgeW * ridgeW));
        const b = ld[k].data;
        b[o] = b[o + 1] = Math.round(255 * hl);
        b[o + 2] = Math.round(240 * hl);
        b[o + 3] = 255;
        // flat folds reflect the moving side for the following creases
        if (k >= 1 && k <= 4 && u > 0) {
          x -= 2 * u * op.ux;
          y -= 2 * u * op.uy;
        }
      }
    }
  }
  for (let k = 0; k < OP_COUNT; k++) {
    dark[k].getContext("2d")!.putImageData(dd[k], 0, 0);
    light[k].getContext("2d")!.putImageData(ld[k], 0, 0);
  }
  return { dark, light };
}
