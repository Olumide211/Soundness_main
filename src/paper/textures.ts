import * as THREE from "three";

export const TEX_W = 1024;
export const TEX_H = 1448;
export const PAPER_COLOR = "#f3eee4";

// deterministic PRNG
export const mulberry32 = (a: number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** Fine paper grain (grayscale, around 1.0) used to multiply ink + paper. */
export function grainCanvas(w: number, h: number, seed = 7) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const rnd = mulberry32(seed);
  for (let i = 0; i < w * h; i++) {
    const v = 236 + rnd() * 19;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v - 2;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // fibers
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * Math.PI * 2;
    const l = 6 + rnd() * 26;
    ctx.strokeStyle = rnd() > 0.5 ? "#7a7268" : "#ffffff";
    ctx.lineWidth = 0.6 + rnd() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

/** Procedural fiber normal map (tileable-ish value noise + fibers). */
export function fiberNormalMap(size = 512) {
  const rnd = mulberry32(42);
  const hgt = new Float32Array(size * size);
  // value noise octaves
  const octave = (cells: number, amp: number) => {
    const g = new Float32Array((cells + 1) * (cells + 1));
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y <= cells; y++) g[y * (cells + 1) + cells] = g[y * (cells + 1)];
    for (let x = 0; x <= cells; x++) g[cells * (cells + 1) + x] = g[x];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = g[iy * (cells + 1) + ix];
        const b = g[iy * (cells + 1) + ix + 1];
        const c = g[(iy + 1) * (cells + 1) + ix];
        const d = g[(iy + 1) * (cells + 1) + ix + 1];
        hgt[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
  };
  octave(8, 0.5);
  octave(32, 0.35);
  octave(128, 0.25);
  // fibers (wrapped)
  for (let i = 0; i < 900; i++) {
    let x = rnd() * size;
    let y = rnd() * size;
    const a = rnd() * Math.PI * 2;
    const l = 10 + rnd() * 40;
    const s = (rnd() - 0.3) * 0.5;
    for (let t = 0; t < l; t++) {
      x += Math.cos(a + t * 0.02);
      y += Math.sin(a + t * 0.02);
      const xi = ((Math.floor(x) % size) + size) % size;
      const yi = ((Math.floor(y) % size) + size) % size;
      hgt[yi * size + xi] += s;
    }
  }
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const k = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = hgt[y * size + ((x - 1 + size) % size)];
      const hR = hgt[y * size + ((x + 1) % size)];
      const hD = hgt[((y + 1) % size) * size + x];
      const hU = hgt[((y - 1 + size) % size) * size + x];
      let nx = (hL - hR) * k;
      let ny = (hD - hU) * k;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const o = (y * size + x) * 4;
      img.data[o] = (nx * 0.5 + 0.5) * 255;
      img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 4.2);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Wordmark placement on the back face (sheet-width units from the back's bottom-right corner). */
export const WORDMARK = { size: 0.04, right: 0.06, baseline: 0.075 };

/**
 * Front: photo printed INTO the paper. Paper albedo + fiber grain first, then the
 * photo multiplied over it at 92 % so the grain shows through the ink. Edges are a
 * touch desaturated like real ink bleeding into fibers.
 */
export function frontBase(img: HTMLImageElement, grain: HTMLCanvasElement) {
  const c = makeCanvas(TEX_W, TEX_H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.6;
  ctx.drawImage(grain, 0, 0, TEX_W, TEX_H);
  ctx.globalAlpha = 1;

  const ia = img.naturalWidth / img.naturalHeight;
  const ca = TEX_W / TEX_H;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  let sx = 0;
  let sy = 0;
  if (ia > ca) {
    sw = sh * ca;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = sw / ca;
    sy = (img.naturalHeight - sh) / 2;
  }
  // print layer: slightly desaturated overall, more so towards the edges
  const print = makeCanvas(TEX_W, TEX_H);
  const pctx = print.getContext("2d")!;
  pctx.filter = "saturate(0.93) contrast(0.97)";
  pctx.drawImage(img, sx, sy, sw, sh, 0, 0, TEX_W, TEX_H);
  const edge = makeCanvas(TEX_W, TEX_H);
  const ectx = edge.getContext("2d")!;
  ectx.filter = "saturate(0.55) contrast(0.95)";
  ectx.drawImage(img, sx, sy, sw, sh, 0, 0, TEX_W, TEX_H);
  ectx.filter = "none";
  ectx.globalCompositeOperation = "destination-in";
  const g = ectx.createRadialGradient(TEX_W / 2, TEX_H / 2, TEX_W * 0.38, TEX_W / 2, TEX_H / 2, TEX_H * 0.62);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.85)");
  ectx.fillStyle = g;
  ectx.fillRect(0, 0, TEX_W, TEX_H);
  pctx.filter = "none";
  pctx.drawImage(edge, 0, 0);

  ctx.globalAlpha = 0.92;
  ctx.drawImage(print, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return c;
}

/** Back: plain warm paper with a small BreezeOg wordmark bottom-right (lands on the right wing). */
export function backBase(grain: HTMLCanvasElement) {
  const c = makeCanvas(TEX_W, TEX_H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.6;
  ctx.drawImage(grain, 0, 0, TEX_W, TEX_H);
  ctx.globalAlpha = 1;
  // wordmark: Inter SemiBold, #1A1A1A @ 85 %, +4 % tracking, 4 % of sheet width
  const size = Math.round(TEX_W * WORDMARK.size);
  ctx.font = `600 ${size}px "InterPaper", Inter, sans-serif`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(size * 0.04).toFixed(2)}px`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(26,26,26,0.85)";
  const right = TEX_W - Math.round(TEX_W * WORDMARK.right);
  const base = TEX_H - Math.round(TEX_W * WORDMARK.baseline);
  ctx.fillText("BreezeOg", right, base);
  ctx.globalCompositeOperation = "source-over";
  return c;
}
