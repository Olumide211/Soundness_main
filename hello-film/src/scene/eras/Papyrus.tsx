import React, {useMemo} from 'react';
import * as THREE from 'three';
import {getAssets, texSet, TILE} from '../../lib/assets';
import {SHEET, SHEET_MATRIX} from '../layout';
import {StationRoot} from '../World';
import {pigTargets} from '../particles/PigmentParticles';
import {N_PIGMENT} from '../particles/pigmentData';
import {brushData, brushU, pressure, INK_W, GLYPH} from './brushData';
import {Hand, POSES} from '../hands/Hand';
import {easeInCubic, easeOutCubic, remap, smoothstep, clamp01} from '../../lib/ease';
import {hash, SEEDS} from '../../lib/rng';
import {valueNoise2} from '../../lib/noise';
import {toWorld} from '../../lib/stations';

const INK_C = 1024, INK_R = Math.round(1024 * (SHEET.h / SHEET.w));
const toPx = (x: number, y: number): [number, number] => [((x + SHEET.w / 2) / SHEET.w) * INK_C, (1 - (y + SHEET.h / 2) / SHEET.h) * INK_R];
export const invBrush = (u: number) => 165 + 50 * (Math.acos(1 - 2 * Math.min(1, Math.max(0, u))) / Math.PI);
/** visibility of a letter's ink on the sheet (fades as the letter lifts into a sort, 225-255) */
export const letterOnSheet = (i: number, f: number) => 1 - smoothstep(226 + 3 * i, 232 + 3 * i, f);

function buildReveal() {
  const W = 256, H = Math.round(256 * SHEET.h / SHEET.w);
  const t = new Float32Array(W * H).fill(158);
  const T = pigTargets();
  const R = 0.018;
  const rp = Math.ceil((R / SHEET.w) * W);
  for (let i = 0; i < N_PIGMENT; i++) {
    const cx = ((T.sx[i] + SHEET.w / 2) / SHEET.w) * W, cy = ((T.sy[i] + SHEET.h / 2) / SHEET.h) * H;
    const tl = T.tLandP[i];
    for (let y = Math.max(0, Math.floor(cy - rp)); y <= Math.min(H - 1, cy + rp); y++)
      for (let x = Math.max(0, Math.floor(cx - rp)); x <= Math.min(W - 1, cx + rp); x++) {
        const d = Math.hypot((x + 0.5 - cx) / W * SHEET.w, (y + 0.5 - cy) / H * SHEET.h);
        if (d > R) continue;
        const rt = tl + 6 * (d / R);
        const k = y * W + x;
        if (rt < t[k]) t[k] = rt;
      }
  }
  const d = new Uint8Array(W * H * 4);
  for (let k = 0; k < W * H; k++) { const v = Math.round(((Math.min(t[k], 160) - 130) / 32) * 255); d[k * 4] = v; d[k * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

function sheetMaterial(reveal: THREE.Texture, inkSharp: THREE.Texture, inkBlur: THREE.Texture) {
  const p = texSet('papyrus_paper', SHEET.w / TILE.paper, SHEET.h / TILE.paper);
  const fb = texSet('papyrus_fibre', SHEET.w / TILE.paper * 1.5, SHEET.h / TILE.paper * 1.5);
  const m = new THREE.MeshPhysicalMaterial({
    map: p.albedo, color: new THREE.Color('#E9D8B4'), normalMap: fb.normal_gl, roughnessMap: fb.roughness, aoMap: fb.ao,
    roughness: 1.0, sheen: 0.4, sheenColor: new THREE.Color('#FFE9C4'), sheenRoughness: 0.5, metalness: 0, side: THREE.DoubleSide,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
  const u = {
    uFrame: {value: 0}, uReveal: {value: reveal}, uInk: {value: inkSharp}, uInkBlur: {value: inkBlur}, uBleed: {value: 0},
    uKeyDir: {value: new THREE.Vector3(-0.5, 0.6, 0.6).normalize()}, uKeyCol: {value: new THREE.Color('#FFE9C4')}, uInkCol: {value: new THREE.Color('#1B120C')},
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSUv = uv;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vSUv; uniform float uFrame; uniform sampler2D uReveal; uniform sampler2D uInk; uniform sampler2D uInkBlur; uniform float uBleed;
uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform vec3 uInkCol; float inkAmt; float thickN;
float ph(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
float pn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(ph(i),ph(i+vec2(1,0)),f.x), mix(ph(i+vec2(0,1)),ph(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{ float rt = 130.0 + 32.0 * texture2D(uReveal, vSUv).r;
  float a = smoothstep(rt, rt + 2.0, uFrame);
  if (a < 0.999 && ph(gl_FragCoord.xy + uFrame) > a) discard; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ // crossed pith strips: 18 horizontal (top layer) x 14 vertical
  float row = floor(vSUv.y * 18.0 + 0.35 * sin(vSUv.x * 9.0 + 1.3)), col = floor(vSUv.x * 14.0);
  float bH = (ph(vec2(row, 3.1)) - 0.5) * 0.10 + (pn(vec2(vSUv.x * 90.0, row * 7.0)) - 0.5) * 0.07;
  float bV = (ph(vec2(col, 7.7)) - 0.5) * 0.06;
  float seam = smoothstep(0.0, 0.06, fract(vSUv.y * 18.0)) * smoothstep(0.0, 0.06, 1.0 - fract(vSUv.y * 18.0));
  diffuseColor.rgb *= (1.0 + bH + bV) * mix(0.95, 1.0, seam);
  thickN = 0.6 + 0.4 * pn(vSUv * vec2(30.0, 60.0));
  float fibre = 0.6 + 0.4 * pn(vec2(vSUv.x * 40.0, vSUv.y * 400.0));
  float sharp = texture2D(uInk, vSUv).r;
  float blur = texture2D(uInkBlur, vSUv).r;
  inkAmt = max(sharp, smoothstep(0.05, 0.7, blur) * uBleed * fibre * 0.55);
  diffuseColor.rgb = mix(diffuseColor.rgb, uInkCol, clamp(inkAmt, 0.0, 1.0));
  // soft edge darkening (old sheet)
  vec2 e = min(vSUv, 1.0 - vSUv);
  diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.05, min(e.x, e.y * 1.4)) );
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.7, clamp(inkAmt,0.0,1.0));')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float ndl = clamp(dot(normalize(vNormal), normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz)), 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * uKeyCol * 0.25 * pow(1.0 - ndl, 2.0) * thickN * 0.35; }`);
  };
  (m as any).userData.u = u;
  m.customProgramCacheKey = () => 'papyrusSheet';
  return m;
}

function inkRibbonGeometry(maxN: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxN * 2 * 3), 3));
  const nrm = new Float32Array(maxN * 2 * 3); for (let i = 0; i < maxN * 2; i++) nrm[i * 3 + 2] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aWet', new THREE.BufferAttribute(new Float32Array(maxN * 2), 1));
  g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(maxN * 2), 1));
  const idx: number[] = [];
  for (let i = 0; i < maxN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  return g;
}
function inkMaterial() {
  const m = new THREE.MeshPhysicalMaterial({color: '#1B120C', roughness: 0.7, metalness: 0, transparent: true, clearcoat: 0.0, polygonOffset: true, polygonOffsetFactor: -2});
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWet; attribute float aA; varying float vWet; varying float vA;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvWet = aWet; vA = aA;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWet; varying float vA;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.7, 0.25, vWet);')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vA; diffuseColor.rgb *= mix(1.0, 0.7, vWet);');
  };
  m.customProgramCacheKey = () => 'inkRibbon';
  return m;
}

export const Papyrus: React.FC<{frame: number}> = ({frame: f}) => {
  const R = useMemo(() => {
    const reveal = buildReveal();
    const sharpC = document.createElement('canvas'); sharpC.width = INK_C; sharpC.height = INK_R;
    const blurC = document.createElement('canvas'); blurC.width = INK_C; blurC.height = INK_R;
    const tmpC = document.createElement('canvas'); tmpC.width = INK_C / 2; tmpC.height = INK_R;
    const sharpT = new THREE.CanvasTexture(sharpC), blurT = new THREE.CanvasTexture(blurC);
    const sheetGeo = new THREE.PlaneGeometry(SHEET.w, SHEET.h, 48, 36);
    // slight curl at the edges
    const pa = sheetGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, 0.004 * Math.pow(Math.abs(x) / (SHEET.w / 2), 4) + 0.0015 * Math.sin(x * 23 + y * 9)); }
    sheetGeo.computeVertexNormals();
    const sheetMat = sheetMaterial(reveal, sharpT, blurT);
    const wood = texSet('press_wood', 0.6 / TILE.wood, 0.45 / TILE.wood);
    const woodMat = new THREE.MeshPhysicalMaterial({map: wood.albedo, normalMap: wood.normal_gl, roughnessMap: wood.roughness, aoMap: wood.ao, color: new THREE.Color('#5a4232'), roughness: 1.05, clearcoat: 0.05, metalness: 0});
    const bd = brushData();
    const N = bd.pl.pts.length;
    const ribbon = inkRibbonGeometry(N);
    const inkMat = inkMaterial();
    const reedMat = new THREE.MeshPhysicalMaterial({color: '#B79B6A', roughness: 0.55, metalness: 0});
    const reedInk = new THREE.MeshPhysicalMaterial({color: '#2a1d14', roughness: 0.35, metalness: 0});
    const hiero = getAssets().fonts.hiero;
    const glyphPath = hiero.getPath(String.fromCodePoint(0x130a7), 0, 0, 1000);
    const gb = glyphPath.getBoundingBox();
    return {reveal, sharpC, blurC, tmpC, sharpT, blurT, sheetGeo, sheetMat, woodMat, bd, ribbon, inkMat, reedMat, reedInk, glyphPath, gb};
  }, []);

  const u = brushU(f);
  const bd = R.bd;
  // ---- ink ribbon (3D) ----
  const pos = R.ribbon.attributes.position as THREE.BufferAttribute;
  const wet = R.ribbon.attributes.aWet as THREE.BufferAttribute;
  const aa = R.ribbon.attributes.aA as THREE.BufferAttribute;
  const N = bd.pl.pts.length;
  let last = 0;
  for (let i = 0; i < N; i++) {
    const su = bd.pl.cum[i] / bd.pl.length;
    if (su > u + 1e-6 || f < 165) break;
    const p = bd.pl.pts[i];
    const q = bd.pl.pts[Math.min(N - 1, i + 1)], o = bd.pl.pts[Math.max(0, i - 1)];
    const t = q.clone().sub(o); if (t.lengthSq() < 1e-14) t.set(1, 0); t.normalize();
    const nx = -t.y, ny = t.x;
    let w = INK_W * pressure(su) * 0.5;
    const tipTaper = smoothstep(0, 0.012, (u - su) * bd.pl.length);
    w *= 0.4 + 0.6 * tipTaper;
    const L = bd.letters.findIndex(([a, b]) => su >= a && su <= b);
    const vis = letterOnSheet(Math.max(0, L), f);
    // dry-brush breakup near stroke ends
    const endD = Math.min(su, 1 - su) * bd.pl.length;
    const breakup = endD < 0.02 ? 0.35 + 0.65 * valueNoise2(su * 900, 0.5, SEEDS.ribbon) : 1;
    pos.setXYZ(i * 2, p.x + nx * w, p.y + ny * w, 0.0012);
    pos.setXYZ(i * 2 + 1, p.x - nx * w, p.y - ny * w, 0.0012);
    const age = f - invBrush(su);
    const wv = 1 - smoothstep(6, 10, age);
    wet.setX(i * 2, wv); wet.setX(i * 2 + 1, wv);
    aa.setX(i * 2, vis * breakup); aa.setX(i * 2 + 1, vis * breakup);
    last = i;
  }
  R.ribbon.setDrawRange(0, last > 0 ? last * 6 : 0);
  pos.needsUpdate = wet.needsUpdate = aa.needsUpdate = true;

  // ---- ink coverage canvases (sharp + anisotropic blur for the bleed) ----
  if (f >= 160 && f <= 300) {
    const c = R.sharpC.getContext('2d')!;
    c.clearRect(0, 0, INK_C, INK_R);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#ff0000';
    const pxPerM = INK_C / SHEET.w;
    for (let i = 1; i < N; i++) {
      const su = bd.pl.cum[i] / bd.pl.length;
      if (su > u) break;
      const L = bd.letters.findIndex(([a, b]) => su >= a && su <= b);
      c.globalAlpha = letterOnSheet(Math.max(0, L), f);
      c.lineWidth = INK_W * pressure(su) * pxPerM;
      const a = toPx(bd.pl.pts[i - 1].x, bd.pl.pts[i - 1].y), b = toPx(bd.pl.pts[i].x, bd.pl.pts[i].y);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    c.globalAlpha = 1;
    // hieroglyph hand U+130A7, 14 mm tall, 10 f wipe from 205
    const wipe = clamp01((f - 205) / 10);
    if (wipe > 0) {
      const s = (GLYPH.h * pxPerM) / (R.gb.y2 - R.gb.y1);
      const [gx, gy] = toPx(GLYPH.x, GLYPH.y);
      c.save();
      c.beginPath(); c.rect(0, gy - GLYPH.h * pxPerM * 1.2, INK_C, GLYPH.h * pxPerM * 1.4 * wipe); c.clip();
      c.translate(gx - ((R.gb.x1 + R.gb.x2) / 2) * s, gy - R.gb.y2 * s);
      c.scale(s, s);
      c.fillStyle = '#ff0000';
      c.fill(new Path2D(R.glyphPath.toPathData(2)));
      c.restore();
    }
    const t = R.tmpC.getContext('2d')!;
    t.clearRect(0, 0, INK_C / 2, INK_R);
    t.filter = 'blur(1px)';
    t.drawImage(R.sharpC, 0, 0, INK_C / 2, INK_R);
    const bc = R.blurC.getContext('2d')!;
    bc.clearRect(0, 0, INK_C, INK_R);
    bc.filter = 'blur(1px)';
    bc.drawImage(R.tmpC, 0, 0, INK_C, INK_R);
    R.sharpT.needsUpdate = true; R.blurT.needsUpdate = true;
  }
  const mu = (R.sheetMat as any).userData.u;
  mu.uFrame.value = f;
  mu.uBleed.value = smoothstep(172, 215, f) * 0.9;

  // ---- reed brush + right hand ----
  const handIn = easeOutCubic(remap(f, 150, 165));
  const handOut = easeInCubic(remap(f, 220, 238));
  const showHand = f >= 148 && f <= 240;
  const tipU = f < 165 ? 0 : u;
  const tp = bd.pl.at(tipU).p;
  const lift = f < 165 ? 0.02 * (1 - smoothstep(158, 165, f)) : f > 215 ? 0.03 * smoothstep(215, 222, f) : 0;
  const sheetM = SHEET_MATRIX;
  const Rx = new THREE.Vector3(1, 0, 0).transformDirection(sheetM), Uy = new THREE.Vector3(0, 1, 0).transformDirection(sheetM), Nz = new THREE.Vector3(0, 0, 1).transformDirection(sheetM);
  const offIn = (1 - handIn) * 0.45 + handOut * 0.5;
  const tipW = new THREE.Vector3(tp.x, tp.y, 0.0015).applyMatrix4(sheetM).addScaledVector(Nz, lift).addScaledVector(Rx, offIn).addScaledVector(Uy, -offIn * 0.2);
  const axis = Nz.clone().multiplyScalar(1.0).addScaledVector(Rx, 0.5).addScaledVector(Uy, 0.05).normalize();
  const brushQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const brushCentre = tipW.clone().addScaledVector(axis, 0.09);
  const grip = tipW.clone().addScaledVector(axis, 0.055);

  const fingerDir = axis.clone().negate().addScaledVector(Rx, -0.35).normalize();
  const palmDir = Rx.clone().negate().addScaledVector(Nz, -0.5).addScaledVector(Uy, -0.3).normalize();
  return (
    <>
      <StationRoot name="papyrus">
        {/* lectern: slanted board, post, foot */}
        <group rotation={[SHEET.tiltX, 0, 0]}>
          <mesh position={[0, 0, -0.016]} material={R.woodMat}><boxGeometry args={[0.52, 0.38, 0.026]} /></mesh>
          <mesh position={[0, -0.188, -0.0]} material={R.woodMat}><boxGeometry args={[0.52, 0.02, 0.03]} /></mesh>
        </group>
        <mesh position={[0, -0.46, -0.12]} material={R.woodMat}><boxGeometry args={[0.07, 0.86, 0.07]} /></mesh>
        <mesh position={[0, -0.885, -0.12]} material={R.woodMat}><boxGeometry args={[0.42, 0.03, 0.34]} /></mesh>
      </StationRoot>
      <group matrixAutoUpdate={false} matrix={sheetM}>
        <mesh geometry={R.sheetGeo} material={R.sheetMat} receiveShadow />
        <mesh geometry={R.ribbon} material={R.inkMat} />
      </group>
      {showHand && (
        <>
          <group position={brushCentre} quaternion={brushQ}>
            <mesh material={R.reedMat} position={[0, 0.006, 0]}><cylinderGeometry args={[0.0035, 0.0035, 0.168, 20]} /></mesh>
            <mesh material={R.reedInk} position={[0, -0.084, 0]}><cylinderGeometry args={[0.0035, 0.0008, 0.012, 20]} /></mesh>
          </group>
          <Hand side="right" pose={POSES.penGrip} effector="index-finger-phalanx-distal" target={grip} fingerDir={fingerDir} palmDir={palmDir} frame={f} />
        </>
      )}
    </>
  );
};
