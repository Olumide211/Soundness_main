import React, {useMemo} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {getAssets, texSet, TILE} from '../../lib/assets';
import {StationRoot} from '../World';
import {stationMatrix, toWorld} from '../../lib/stations';
import {PAGE} from '../layout';
import {PAGE_C} from '../morph/glyphToMorse';
import {letterMorphs, letterWorld, SHEET_Q, SORT, sortFaceGeometry} from '../morph/strokeToSort';
import {carrierAt} from '../../lib/camera';
import {easeInOutCubic, easeInQuad, easeOutCubic, remap, smoothstep, clamp01, lerp} from '../../lib/ease';
import {Hand, POSES} from '../hands/Hand';
import {useBillboards, BillboardPrim} from '../particles/Billboards';
import {hash, SEEDS} from '../../lib/rng';
import {drawPage} from './pageCanvas';

const PRESS_M = stationMatrix('press');
const PRESS_Q = new THREE.Quaternion().setFromRotationMatrix(PRESS_M);
const Q_BED = PRESS_Q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
export const TYPE_TOP = SORT.height + SORT.relief; // 0.0252
const REST = 0.206, CONTACT = TYPE_TOP + 0.0006, LIFTED = 0.42;
export const slotLocal = (i: number) => new THREE.Vector3((2 - i) * SORT.pitch, 0, 0);
export const landFrame = (i: number) => 266 + 4 * i;

export function platenBottom(f: number) {
  if (f < 300) return REST;
  if (f < 330) return lerp(REST, CONTACT, easeInQuad(remap(f, 300, 330)));
  return lerp(CONTACT, LIFTED, easeOutCubic(remap(f, 331, 352)));
}
/** lever angle (deg) about the screw axis */
export const leverDeg = (f: number) => (f < 330 ? 35 * easeInQuad(remap(f, 300, 330)) : 35 * (1 - easeOutCubic(remap(f, 334, 360))));
/** page peel 0..1 */
export const peelP = (f: number) => easeInOutCubic(remap(f, 336, 362));
export const PEEL_MAX = THREE.MathUtils.degToRad(116);

function boxB(w: number, h: number, d: number) { return new RoundedBoxGeometry(w, h, d, 3, 0.002); }

function metal(set: string, rep: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  const t = texSet(set, rep, rep);
  return new THREE.MeshPhysicalMaterial({map: t.albedo, normalMap: t.normal_gl, roughnessMap: t.roughness, metalnessMap: t.metalness, metalness: 1, roughness: 0.9, ...extra});
}

export const Press: React.FC<{frame: number}> = ({frame: f}) => {
  const R = useMemo(() => {
    const wt = texSet('press_wood', 1 / TILE.wood, 1 / TILE.wood);
    const wood = new THREE.MeshPhysicalMaterial({map: wt.albedo, normalMap: wt.normal_gl, roughnessMap: wt.roughness, aoMap: wt.ao, roughness: 1.05, clearcoat: 0.05, color: new THREE.Color('#8a6a52')});
    const woodDark = wood.clone(); woodDark.color = new THREE.Color('#4a3527');
    const steel = metal('brushed_steel', 0.1 / TILE.metal, {roughness: 0.9, anisotropy: 0.6});
    const brass = metal('brass', 0.4 / TILE.metal, {color: new THREE.Color('#C9A15A'), roughness: 0.35});
    const sortFace = steel.clone();
    const plastic = new THREE.MeshPhysicalMaterial({color: '#141416', roughness: 0.5, metalness: 0, clearcoat: 0.3});
    const ms = letterMorphs();
    const faces = [0, 1, 2, 3, 4].map((i) => sortFaceGeometry(i));
    const body = boxB(SORT.face, SORT.height, SORT.face);
    const morphMat = new THREE.MeshPhysicalMaterial({color: '#1B120C', roughness: 0.5, metalness: 0});
    const morphMats = [0, 1, 2, 3, 4].map(() => morphMat.clone());
    const morphMeshes = ms.map((_, i) => new THREE.Mesh(new THREE.BufferGeometry(), morphMats[i]));
    morphMeshes.forEach((m) => { m.frustumCulled = false; m.castShadow = true; });
    const faceMats = [0, 1, 2, 3, 4].map(() => sortFace.clone());
    // page
    const pageGeo = new THREE.PlaneGeometry(PAGE.w, PAGE.h, 64, 64);
    const pageBase = (pageGeo.attributes.position.array as Float32Array).slice();
    const pc = document.createElement('canvas'); pc.width = PAGE_C.w; pc.height = PAGE_C.h;
    const pageTex = new THREE.CanvasTexture(pc); pageTex.anisotropy = 8; pageTex.colorSpace = THREE.SRGBColorSpace; pageTex.flipY = false;
    const bc = document.createElement('canvas'); bc.width = PAGE_C.w / 2; bc.height = PAGE_C.h / 2;
    const bumpTex = new THREE.CanvasTexture(bc); bumpTex.flipY = false;
    const paperT = texSet('papyrus_paper', PAGE.w / TILE.paper, PAGE.h / TILE.paper);
    const pageFront = new THREE.MeshPhysicalMaterial({color: '#cfc4b0', roughness: 0.9, normalMap: paperT.normal_gl, normalScale: new THREE.Vector2(0.3, 0.3), side: THREE.FrontSide, sheen: 0.2});
    const pageBack = new THREE.MeshPhysicalMaterial({map: pageTex, roughness: 0.85, bumpMap: bumpTex, bumpScale: 1.5, side: THREE.BackSide, sheen: 0.2});
    return {wood, woodDark, steel, brass, sortFace, plastic, ms, faces, body, morphMeshes, morphMats, faceMats, pageGeo, pageBase, pc, pageTex, bc, bumpTex, pageFront, pageBack};
  }, []);

  // impact specular flash (+40% for 2 f)
  const flash = f === 330 || f === 331 ? 1.4 : 1;
  R.steel.envMapIntensity = flash; R.brass.envMapIntensity = flash;
  R.faceMats.forEach((m) => (m.envMapIntensity = flash));

  // ---------- stroke -> sort morph + flight ----------
  const car = carrierAt(f, 14);
  const sorts: React.ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const land = landFrame(i);
    const slotW = slotLocal(i).applyMatrix4(PRESS_M);
    const m = R.morphMeshes[i];
    const mt = easeInOutCubic(remap(f, 225 + 2 * i, 252));
    let pos: THREE.Vector3, q: THREE.Quaternion;
    const p0 = letterWorld(R.ms[i]);
    const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(SHEET_Q);
    const off = new THREE.Vector3((i - 2) * 0.045, 0, 0).applyQuaternion(PRESS_Q);
    if (f < 248) {
      const lift = easeOutCubic(remap(f, 225 + 2 * i, 238 + 2 * i));
      const a = p0.clone().addScaledVector(nrm, 0.07 * lift);
      const s = easeInOutCubic(remap(f, 232 + 2 * i, 248));
      pos = a.lerp(car.clone().add(off), s);
    } else {
      const t = easeInOutCubic(remap(f, 248, land));
      const a = car.clone().add(off), b = slotW.clone().add(new THREE.Vector3(0, 0.22, 0)), c = slotW;
      pos = a.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(b, 2 * t * (1 - t)).addScaledVector(c, t * t);
      // landing overshoot 1.5 mm then settle in 2 f
      if (f >= land) pos.y -= 0.0015 * (f < land + 1 ? 1 : Math.max(0, 1 - (f - land - 1) / 2));
    }
    q = SHEET_Q.clone().slerp(Q_BED, easeInOutCubic(remap(f, 228, land - 4)));
    const showMorph = f >= 225 && f < 258;
    const sortA = smoothstep(252, 258, f);
    if (showMorph && f >= 225) {
      const ring = R.ms[i].interp(mt);
      const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
      const depth = Math.max(0.0004, SORT.height * mt);
      m.geometry.dispose();
      const g = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: false, curveSegments: 1});
      g.translate(0, 0, -depth);
      m.geometry = g;
      m.position.copy(pos); m.quaternion.copy(q);
      R.morphMats[i].color.set('#1B120C').lerp(new THREE.Color('#8d9298'), mt);
      R.morphMats[i].metalness = mt; R.morphMats[i].roughness = lerp(0.5, 0.3, mt);
      R.morphMats[i].transparent = sortA > 0; R.morphMats[i].opacity = 1 - sortA;
      sorts.push(<primitive key={'m' + i} object={m} />);
    }
    if (f >= 252) {
      // ink sheen once the brayer has passed this sort
      const bx = brayerX(f);
      const inked = f >= 290 && bx < slotLocal(i).x + 0.01 ? smoothstep(0, 0.03, slotLocal(i).x + 0.01 - bx) : f > 318 ? 1 : 0;
      const fm = R.faceMats[i];
      fm.color.set('#ffffff').lerp(new THREE.Color('#141212'), inked * 0.92);
      fm.roughness = lerp(0.9, 0.18, inked); fm.metalness = lerp(1, 0.2, inked);
      fm.transparent = sortA < 1; fm.opacity = sortA;
      R.steel.transparent = false;
      sorts.push(
        <group key={'s' + i} position={pos} quaternion={q}>
          {/* local: face plane z=0, body extends to -z */}
          <mesh geometry={R.faces[i]} material={fm} castShadow position={[0, 0, -0.0002]} />
          <mesh geometry={R.body} material={fm === R.faceMats[i] ? bodyMat(R, sortA) : R.steel} position={[0, 0, -SORT.relief - SORT.height / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow />
        </group>,
      );
    }
  }

  // ---------- press structure ----------
  const pb = platenBottom(f);
  const lev = THREE.MathUtils.degToRad(50 + leverDeg(f));
  const levDir = new THREE.Vector3(-Math.cos(lev), 0, Math.sin(lev));
  const pivot = new THREE.Vector3(0, 0.335, 0);
  const handleLocal = pivot.clone().addScaledVector(levDir, 0.4);
  const handleW = handleLocal.clone().applyMatrix4(PRESS_M);

  // ---------- page (on the platen until impact, then peels) ----------
  drawPage(R.pc, R.bc, f);
  R.pageTex.needsUpdate = true; R.bumpTex.needsUpdate = true;
  const pageY = f < 330 ? pb - 0.0008 : CONTACT - 0.0002;
  const float = easeInOutCubic(remap(f, 358, 380));
  const showPage = f >= 292 && f < 430;
  if (showPage) peelGeometry(R.pageGeo, R.pageBase, f >= 330 ? peelP(f) : 0, f);
  const pageScale = f < 300 ? easeOutCubic(remap(f, 292, 300)) : 1;

  // ---------- brayer ----------
  const bx = brayerX(f);
  const showBrayer = f >= 284 && f <= 324;
  const bIn = smoothstep(284, 292, f) * (1 - smoothstep(316, 324, f));

  // ---------- hand on the lever ----------
  const showHand = f >= 292 && f <= 366;
  const hIn = easeOutCubic(remap(f, 292, 302)) * (1 - easeInOutCubic(remap(f, 352, 366)));
  const perp = new THREE.Vector3(levDir.z, 0, -levDir.x); // horizontal, perpendicular to the bar
  const toW = (v: THREE.Vector3) => v.clone().transformDirection(PRESS_M);
  const gripT = handleW.clone().add(toW(new THREE.Vector3(-0.25, -0.15, 0.25)).multiplyScalar(1 - hIn));

  return (
    <>
      <StationRoot name="press">
        {/* table + bed */}
        <mesh geometry={useMemo(() => boxB(0.66, 0.9, 0.48), [])} material={R.woodDark} position={[0, -0.49, -0.02]} receiveShadow />
        <mesh geometry={useMemo(() => boxB(0.5, 0.04, 0.36), [])} material={R.wood} position={[0, -0.02, 0]} receiveShadow castShadow />
        {/* chase: steel frame of 6 mm bars */}
        {[[0, 0.062, 0.24, 0.006], [0, -0.062, 0.24, 0.006], [0.123, 0, 0.006, 0.13], [-0.123, 0, 0.006, 0.13]].map(([x, z, w, d], k) => (
          <mesh key={k} material={R.steel} position={[x, 0.009, z]} castShadow receiveShadow><boxGeometry args={[w, 0.018, d]} /></mesh>
        ))}
        {/* posts + cross-head */}
        <mesh geometry={useMemo(() => boxB(0.06, 0.64, 0.06), [])} material={R.wood} position={[-0.29, 0.28, -0.05]} castShadow receiveShadow />
        <mesh geometry={useMemo(() => boxB(0.06, 0.64, 0.06), [])} material={R.wood} position={[0.29, 0.28, -0.05]} castShadow receiveShadow />
        <mesh geometry={useMemo(() => boxB(0.72, 0.09, 0.09), [])} material={R.wood} position={[0, 0.62, -0.05]} castShadow />
        {/* screw */}
        <mesh material={R.steel} position={[0, (0.62 + pb + 0.05) / 2, 0]} castShadow><cylinderGeometry args={[0.016, 0.016, Math.max(0.01, 0.62 - pb - 0.05), 24]} /></mesh>
        <mesh material={R.steel} position={pivot.toArray()} castShadow><cylinderGeometry args={[0.03, 0.03, 0.04, 32]} /></mesh>
        {/* platen with brass face */}
        <group position={[0, pb, 0]}>
          <mesh geometry={useMemo(() => boxB(0.4, 0.05, 0.3), [])} material={R.wood} position={[0, 0.03, 0]} castShadow />
          <mesh material={R.brass} position={[0, 0.0025, 0]} castShadow><boxGeometry args={[0.39, 0.005, 0.29]} /></mesh>
        </group>
        {/* lever bar + turned handle */}
        <group position={pivot.toArray()} rotation={[0, Math.PI + lev, 0]}>
          <mesh material={R.steel} position={[0.17, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.01, 0.01, 0.35, 16]} /></mesh>
          <mesh material={R.wood} position={[0.39, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.016, 0.013, 0.1, 20]} /></mesh>
        </group>
        {/* page */}
        {showPage && (
          <group position={[0, pageY + 0.03 * float, 0.13 * float]} scale={[pageScale, 1, pageScale]}>
            <mesh geometry={R.pageGeo} material={R.pageFront} castShadow receiveShadow />
            <mesh geometry={R.pageGeo} material={R.pageBack} receiveShadow />
          </group>
        )}
        {/* brayer */}
        {showBrayer && (
          <group position={[bx, TYPE_TOP + 0.022 + (1 - bIn) * 0.15, 0.0]}>
            <mesh material={R.plastic} rotation={[Math.PI / 2, 0, -bx / 0.022]} castShadow><cylinderGeometry args={[0.022, 0.022, 0.16, 32]} /></mesh>
            <mesh material={R.steel} position={[0, 0.06, 0.09]} rotation={[0.6, 0, 0]}><cylinderGeometry args={[0.004, 0.004, 0.14, 8]} /></mesh>
            <mesh material={R.woodDark} position={[0, 0.13, 0.16]} rotation={[0.6, 0, 0]}><cylinderGeometry args={[0.012, 0.012, 0.1, 16]} /></mesh>
          </group>
        )}
      </StationRoot>
      {sorts}
      <ImpactDust frame={f} />
      {showHand && (
        <Hand side="left" pose={POSES.grip} effector="middle-finger-phalanx-intermediate" target={gripT} fingerDir={toW(new THREE.Vector3(0, -1, 0).addScaledVector(perp, 0.5))} palmDir={toW(perp.clone().negate().add(new THREE.Vector3(0, -0.3, 0)))} frame={f} seed={3} />
      )}
    </>
  );
};

let _bodyMats: THREE.MeshPhysicalMaterial[] = [];
function bodyMat(R: any, a: number) {
  // shared fade material for the sort bodies while they cross-fade in
  const k = Math.round(a * 10);
  if (!_bodyMats[k]) { const m = (R.steel as THREE.MeshPhysicalMaterial).clone(); m.transparent = k < 10; m.opacity = k / 10; _bodyMats[k] = m; }
  _bodyMats[k].envMapIntensity = R.steel.envMapIntensity;
  return _bodyMats[k];
}

export const brayerX = (f: number) => lerp(0.2, -0.2, easeInOutCubic(remap(f, 292, 316)));

/** bend deformer: the page peels from the near-right corner, hinge on the far edge, curling up to stand */
function peelGeometry(g: THREE.BufferGeometry, base: Float32Array, p: number, f: number) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const N = 65;
  // base plane is XY; we lay it in XZ: local x -> x, local y -> -z (y=+h/2 is the far edge)
  for (let ix = 0; ix < N; ix++) {
    const x = base[ix * 3];
    const corner = (x / PAGE.w + 0.5); // 0 left .. 1 right
    let py = 0, pz = -PAGE.h / 2; // hinge at far edge
    let ang = 0;
    for (let iy = 0; iy < N; iy++) {
      const k = iy * N + ix;
      const by = base[k * 3 + 1];
      const d = PAGE.h / 2 - by; // distance from far edge
      if (iy > 0) {
        const dd = (PAGE.h / (N - 1));
        // target angle grows with distance from the hinge (curl) and leads at the right corner early on
        const lead = clamp01(p * 1.5 - (1 - d / PAGE.h) * 0.5 - (1 - corner) * 0.35 * (1 - p));
        ang = PEEL_MAX * Math.min(1, lead * (0.55 + 0.45 * (d / PAGE.h)) + p * p * 0.5);
        if (p >= 0.999) ang = PEEL_MAX;
        py += Math.sin(ang) * dd; pz += Math.cos(ang) * dd;
      }
      pos.setXYZ(k, x, py, pz);
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
}

const DS = SEEDS.dust;
/** 300 dust particles burst radially from the bed edge at the impact (life 24 f) */
const ImpactDust: React.FC<{frame: number}> = ({frame: f}) => {
  const bb = useBillboards(300, {normalShare: 0.85, gain: 0.7, soft: 0.6});
  const age = f - 330;
  const on = age >= 0 && age < 26;
  if (on) {
    for (let i = 0; i < 300; i++) {
      const side = Math.floor(hash(i, DS) * 4), t = hash(i, DS + 1) - 0.5;
      const ex = side < 2 ? t * 0.5 : (side === 2 ? 0.25 : -0.25), ez = side < 2 ? (side === 0 ? 0.18 : -0.18) : t * 0.36;
      const dir = new THREE.Vector3(side < 2 ? t * 0.6 : Math.sign(ex), 0, side < 2 ? Math.sign(ez) : t * 0.6).normalize();
      const sp = 0.25 + 0.5 * hash(i, DS + 2);
      const tt = age / 30;
      const drag = (1 - Math.exp(-4 * tt)) / 4;
      const local = new THREE.Vector3(ex + dir.x * sp * drag, 0.004 + (0.12 + 0.2 * hash(i, DS + 3)) * drag - 0.15 * tt * tt, ez + dir.z * sp * drag);
      const w = toWorld('press', local.x, local.y, local.z);
      bb.pos.set([w.x, w.y, w.z], i * 3);
      bb.size[i] = (0.004 + 0.008 * hash(i, DS + 4)) * (1 + age / 12);
      const c = 0.55 + 0.25 * hash(i, DS + 5);
      bb.col.set([c * 0.8, c * 0.7, c * 0.58], i * 3);
      bb.alpha[i] = (1 - age / 24) * (age < 24 ? 1 : 0) * 0.45;
    }
    bb.commit();
  }
  bb.mesh.visible = on;
  return <BillboardPrim bb={bb} />;
};
