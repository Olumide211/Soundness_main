import React, {useMemo} from 'react';
import * as THREE from 'three';
import {getAssets, texSet, TILE} from '../../lib/assets';
import {StationRoot} from '../World';
import {stationMatrix} from '../../lib/stations';
import {Hand, POSES, mixPose} from '../hands/Hand';
import {easeInOutCubic, easeInOutQuad, easeOutCubic, easeOutQuad, remap, smoothstep, lerp, clamp01} from '../../lib/ease';
import {superellipse} from '../morph/ringToSuperellipse';
import {phoneStationMatrix} from './returnTiming';
import {cameraMatrix, shotCamera} from '../../lib/camera';
import {SHOT} from '../../lib/shot';
import {PHONE} from '../layout';

const PM = stationMatrix('phone');
const PQ = new THREE.Quaternion().setFromRotationMatrix(PM);
const D2R = Math.PI / 180;
// dial: on the sloped front face
export const DIAL = {centre: new THREE.Vector3(0, 0.035, 0.066), tilt: -38 * D2R, holeR: 0.031};
const holeAngle = (d: number) => (60 + 30 * ((d === 0 ? 10 : d) - 1)) * D2R; // CCW from +x; 0 sits at -30 deg
const STOP = -60 * D2R; // finger stop at 4 o'clock
/** dial rotation (rad, clockwise negative) and which digit is active */
export function dialState(f: number) {
  const seq = [4, 2];
  for (let k = 0; k < 2; k++) {
    const t0 = 585 + k * 18;
    const full = holeAngle(seq[k]) - STOP;
    if (f >= t0 && f < t0 + 9) return {rot: -full * easeInOutQuad((f - t0) / 9), digit: seq[k], phase: 'in' as const, k};
    if (f >= t0 + 9 && f < t0 + 18) return {rot: -full * (1 - easeOutQuad((f - t0 - 9) / 9)), digit: seq[k], phase: 'out' as const, k};
  }
  return {rot: 0, digit: f < 603 ? 4 : 2, phase: 'idle' as const, k: f < 603 ? 0 : 1};
}
/** handset pose: rests on the cradle, lifts 50 mm and tilts 25 deg (620-640) */
export function handsetLocal(f: number) {
  const t = easeInOutCubic(remap(f, 620, 640));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.104 + 0.05 * t, -0.03 + 0.02 * t), new THREE.Quaternion().setFromEuler(new THREE.Euler(25 * D2R * t, 0, 6 * D2R * t)), new THREE.Vector3(1, 1, 1));
  return m;
}
export const EAR_LOCAL = new THREE.Vector3(-0.075, -0.03, 0); // in handset space (cup face)

function bodyGeometry() {
  const w = 0.22 - 0.016, d = 0.2 - 0.016, r = 0.03;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const g = new THREE.ExtrudeGeometry(s, {depth: 0.12 - 0.016, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 8, curveSegments: 12});
  g.rotateX(-Math.PI / 2); // extrude up (+y); shape y -> -z
  g.translate(0, 0.008, 0);
  // taper the top + slope the front so the dial face leans back
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = clamp01(y / 0.12);
    let x = p.getX(i) * (1 - 0.22 * k * k), z = p.getZ(i) * (1 - 0.18 * k * k);
    if (z > 0) z -= 0.05 * k * k * (z / 0.1);
    p.setXYZ(i, x, y - 0.06, z);
  }
  g.computeVertexNormals();
  return g;
}

function dialCardTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#EDE8DF'; x.beginPath(); x.arc(256, 256, 250, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#111'; x.font = '600 44px Inter'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let d = 0; d <= 9; d++) {
    const a = holeAngle(d);
    x.fillText(String(d), 256 + Math.cos(a) * 178, 256 - Math.sin(a) * 178);
  }
  x.fillStyle = '#C9CDD2'; x.beginPath(); x.arc(256, 256, 70, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function grilleAlpha() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#000';
  for (let r = 0; r < 5; r++) {
    const n = r === 0 ? 1 : r * 6;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; x.beginPath(); x.arc(128 + Math.cos(a) * r * 22, 128 + Math.sin(a) * r * 22, 5, 0, Math.PI * 2); x.fill(); }
  }
  return new THREE.CanvasTexture(c);
}

let helloLine: {pl: THREE.Vector3[][]; total: number} | null = null;
/** Geist 200 "hello" outlines -> polylines (metres, centred) */
function helloOutline() {
  if (helloLine) return helloLine;
  const font = getAssets().fonts.geist200;
  const size = 0.034;
  const path = font.getPath('hello', 0, 0, size);
  const bb = path.getBoundingBox();
  const cx = (bb.x1 + bb.x2) / 2, cy = (bb.y1 + bb.y2) / 2;
  const sp = new THREE.ShapePath();
  for (const c of path.commands as any[]) {
    if (c.type === 'M') sp.moveTo(c.x - cx, -(c.y - cy));
    else if (c.type === 'L') sp.lineTo(c.x - cx, -(c.y - cy));
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1 - cx, -(c.y1 - cy), c.x - cx, -(c.y - cy));
    else if (c.type === 'C') sp.bezierCurveTo(c.x1 - cx, -(c.y1 - cy), c.x2 - cx, -(c.y2 - cy), c.x - cx, -(c.y - cy));
  }
  const pl = sp.subPaths.map((s) => s.getSpacedPoints(80).map((p) => new THREE.Vector3(p.x, p.y, 0)));
  let total = 0;
  for (const l of pl) for (let i = 1; i < l.length; i++) total += l[i].distanceTo(l[i - 1]);
  helloLine = {pl, total};
  return helloLine;
}

export const RING_SPAWN = (k: number) => 640 + 6 * k;

export const Phone: React.FC<{frame: number}> = ({frame: f}) => {
  const R = useMemo(() => {
    const pt = texSet('black_gloss_plastic', 0.25 / TILE.metal, 0.25 / TILE.metal);
    const bakelite = new THREE.MeshPhysicalMaterial({color: '#0D0D0F', normalMap: pt.normal_gl, normalScale: new THREE.Vector2(0.15, 0.15), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0});
    const st = texSet('brushed_steel', 0.09 / TILE.metal, 0.09 / TILE.metal);
    const steel = new THREE.MeshPhysicalMaterial({map: st.albedo, normalMap: st.normal_gl, roughnessMap: st.roughness, metalness: 1, roughness: 0.25});
    const chrome = new THREE.MeshPhysicalMaterial({color: '#dfe3e8', metalness: 1, roughness: 0.12});
    const card = new THREE.MeshPhysicalMaterial({map: dialCardTexture(), roughness: 0.6});
    // finger wheel with 10 holes
    const wheel = new THREE.Shape(); wheel.absarc(0, 0, 0.043, 0, Math.PI * 2, false);
    for (let d = 0; d <= 9; d++) { const a = holeAngle(d); const h = new THREE.Path(); h.absarc(Math.cos(a) * DIAL.holeR, Math.sin(a) * DIAL.holeR, 0.0065, 0, Math.PI * 2, true); wheel.holes.push(h); }
    const hub = new THREE.Path(); hub.absarc(0, 0, 0.012, 0, Math.PI * 2, true); wheel.holes.push(hub);
    const wheelGeo = new THREE.ExtrudeGeometry(wheel, {depth: 0.003, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0006, bevelSegments: 2, curveSegments: 32});
    const body = bodyGeometry();
    // handset: spine arc (150 mm) + two lathe cups
    const spine = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.075, -0.012, 0), new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0.075, -0.012, 0)), 48, 0.013, 20, false);
    const prof = [[0.008, 0.0], [0.02, 0.004], [0.026, 0.012], [0.026, 0.022], [0.024, 0.026], [0.0, 0.027]].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.LatheGeometry(prof, 40);
    cup.rotateX(Math.PI); cup.translate(0, 0.0, 0);
    const grille = new THREE.MeshPhysicalMaterial({color: '#1a1a1c', roughness: 0.4, metalness: 0.6, alphaMap: grilleAlpha(), alphaTest: 0.5, side: THREE.DoubleSide});
    const ringMat = new THREE.MeshBasicMaterial({color: new THREE.Color('#CFE8FF').multiplyScalar(2.0), transparent: true, toneMapped: false, depthWrite: false});
    const ringMats = [0, 1, 2, 3, 4, 5].map(() => ringMat.clone());
    const ringMeshes = ringMats.map((m) => { const x = new THREE.Mesh(new THREE.BufferGeometry(), m); x.frustumCulled = false; return x; });
    const lineMat = new THREE.MeshBasicMaterial({color: new THREE.Color('#CFE8FF').multiplyScalar(2.4), toneMapped: false});
    const lineMesh = new THREE.Mesh(new THREE.BufferGeometry(), lineMat); lineMesh.frustumCulled = false;
    return {bakelite, steel, chrome, card, wheelGeo, body, spine, cup, grille, ringMats, ringMeshes, lineMesh};
  }, []);

  const reveal = smoothstep(548, 570, f);
  const ds = dialState(f);
  const hsM = handsetLocal(f);
  const earW = EAR_LOCAL.clone().applyMatrix4(hsM).applyMatrix4(PM);
  const camLike = new THREE.Vector3(0, 0.16, 0.85).applyMatrix4(PM);
  const faceQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camLike, earW, new THREE.Vector3(0, 1, 0)));

  // ---- sound rings -> superellipse screen outlines ----
  const rings: React.ReactNode[] = [];
  const smQ = new THREE.Quaternion(), smP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  phoneStationMatrix(f).decompose(smP, smQ, tmpS);
  for (let k = 0; k < 6; k++) {
    const t0 = RING_SPAWN(k);
    if (f < t0 || f > 728) continue;
    const g = easeOutCubic(remap(f, t0, t0 + 30));
    const r = 0.12 * g;
    const op = lerp(1, 0.4, g);
    const rawT = remap(f, 675 + k * 2, 720);
    const m = easeInOutCubic(rawT);
    const n = lerp(2, 8, m);
    const a = lerp(r, PHONE.w / 2, m), b = lerp(r, PHONE.h / 2, m);
    const pts = superellipse(Math.max(a, 0.001), Math.max(b, 0.001), n, 96);
    const mesh = R.ringMeshes[k];
    mesh.geometry.dispose();
    mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.0006 * (1 + 1.5 * (1 - g) * 0), 6, true);
    // travel to the smartphone and stack into its edge; interpolated in camera space so they stay in frame
    const towards = smP.clone().add(new THREE.Vector3(0, 0, (k - 2.5) * 0.0013).applyQuaternion(smQ));
    const startW = earW.clone().add(new THREE.Vector3(0, 0, 0.03 + k * 0.006).applyQuaternion(faceQ));
    let pos = startW, quat = faceQ.clone();
    if (m > 0) {
      const camNow = cameraMatrix(shotCamera(f, SHOT.vertical, false));
      const camStart = cameraMatrix(shotCamera(675 + k * 2, SHOT.vertical, false));
      const invNow = camNow.clone().invert();
      const relStart = startW.clone().applyMatrix4(camStart.clone().invert());
      const relEnd = towards.clone().applyMatrix4(invNow);
      const axisPt = new THREE.Vector3((k - 2.5) * 0.02, 0, -0.42 - k * 0.03);
      const rel = relStart.clone().lerp(relEnd, m).lerp(axisPt, 0.92 * smoothstep(0, 0.2, rawT) * (1 - smoothstep(0.8, 1, rawT)));
      pos = rel.applyMatrix4(camNow);
      const qCamNow = new THREE.Quaternion().setFromRotationMatrix(camNow);
      const qCamStart = new THREE.Quaternion().setFromRotationMatrix(camStart);
      const qRelStart = qCamStart.clone().invert().multiply(faceQ);
      const qRelEnd = qCamNow.clone().invert().multiply(smQ);
      quat = qCamNow.multiply(qRelStart.slerp(qRelEnd, m));
    }
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    R.ringMats[k].opacity = op * (1 - smoothstep(716, 728, f));
    rings.push(<primitive key={k} object={mesh} />);
  }

  // ---- luminous "hello" line between rings 2 and 3 (646-672) ----
  const H = helloOutline();
  const prog = easeInOutCubic(remap(f, 646, 672));
  let lineNode: React.ReactNode = null;
  if (f >= 646 && f < 690) {
    let budget = prog * H.total;
    const parts: THREE.TubeGeometry[] = [];
    for (const l of H.pl) {
      if (budget <= 0) break;
      const pts: THREE.Vector3[] = [l[0]];
      for (let i = 1; i < l.length && budget > 0; i++) { const d = l[i].distanceTo(l[i - 1]); if (d > budget) { pts.push(l[i - 1].clone().lerp(l[i], budget / d)); budget = 0; } else { pts.push(l[i]); budget -= d; } }
      if (pts.length > 1) parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.0004, 5, false));
    }
    R.lineMesh.geometry.dispose();
    const merged = mergeTubes(parts);
    R.lineMesh.geometry = merged;
    R.lineMesh.position.copy(earW.clone().add(new THREE.Vector3(0, 0.0, 0.045).applyQuaternion(faceQ)));
    R.lineMesh.quaternion.copy(faceQ);
    (R.lineMesh.material as THREE.MeshBasicMaterial).opacity = 1;
    (R.lineMesh.material as THREE.MeshBasicMaterial).transparent = true;
    (R.lineMesh.material as THREE.MeshBasicMaterial).opacity = 1 - smoothstep(676, 690, f);
    lineNode = <primitive object={R.lineMesh} />;
  }

  // ---- hand: dial with the index, then lift the handset ----
  const sm = PM;
  const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).transformDirection(sm);
  const dialM = new THREE.Matrix4().compose(DIAL.centre, new THREE.Quaternion().setFromEuler(new THREE.Euler(DIAL.tilt, 0, 0)), new THREE.Vector3(1, 1, 1));
  const holeA = holeAngle(ds.digit) + ds.rot;
  const lifted = ds.phase === 'out' || ds.phase === 'idle' ? (ds.phase === 'out' ? smoothstep(0, 3, f - (585 + ds.k * 18 + 9)) : 1) : 0;
  const tipD = new THREE.Vector3(Math.cos(holeA) * DIAL.holeR, Math.sin(holeA) * DIAL.holeR, 0.002 + 0.02 * lifted).applyMatrix4(dialM).applyMatrix4(PM);
  const handIn = easeOutCubic(remap(f, 568, 584));
  const tipEnter = tipD.clone().add(dir(0.15, 0.08, 0.1).multiplyScalar(1 - handIn));
  const gripW = new THREE.Vector3(0.0, 0.018, 0.01).applyMatrix4(hsM).applyMatrix4(PM);
  const handOut = easeInOutCubic(remap(f, 672, 690));
  const toHold = easeInOutCubic(remap(f, 618, 628));
  const holdTarget = gripW.clone().add(dir(0.1, 0.1, 0.12).multiplyScalar(handOut));
  const showHand = f >= 566 && f <= 690;
  const dialPose = mixPose(POSES.pressFinger, {...POSES.pressFinger, index: 0.3}, 1 - lifted);

  return (
    <>
      <StationRoot name="phone">
        <group scale={[1, 1, 1]} visible={reveal > 0.001}>
          <mesh geometry={R.body} material={R.bakelite} castShadow receiveShadow />
          {/* cradle prongs */}
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} material={R.bakelite} position={[x, 0.07, -0.03]}><capsuleGeometry args={[0.009, 0.022, 6, 16]} /></mesh>
          ))}
          {/* dial assembly */}
          <group position={DIAL.centre} rotation={[DIAL.tilt, 0, 0]}>
            <mesh material={R.steel} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.001]}><cylinderGeometry args={[0.045, 0.045, 0.002, 64]} /></mesh>
            <mesh material={R.card} position={[0, 0, 0.0005]}><circleGeometry args={[0.042, 64]} /></mesh>
            <group rotation={[0, 0, ds.rot]} position={[0, 0, 0.0012]}>
              <mesh geometry={R.wheelGeo} material={R.bakelite} />
            </group>
            <mesh material={R.chrome} position={[Math.cos(STOP) * 0.046, Math.sin(STOP) * 0.046, 0.006]} rotation={[0, 0, STOP]}><boxGeometry args={[0.012, 0.003, 0.006]} /></mesh>
          </group>
          {/* handset */}
          <group matrixAutoUpdate={false} matrix={hsM}>
            <mesh geometry={R.spine} material={R.bakelite} castShadow />
            {[-0.075, 0.075].map((x) => (
              <group key={x} position={[x, -0.012, 0]}>
                <mesh geometry={R.cup} material={R.bakelite} castShadow />
                <mesh material={R.grille} position={[0, -0.0272, 0]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.02, 40]} /></mesh>
              </group>
            ))}
          </group>
        </group>
      </StationRoot>
      {rings}
      {lineNode}
      {showHand && (
        <Hand side="right" pose={dialPose} effector="index-finger-tip" target={tipEnter} fingerDir={dir(-0.3, -0.75, -0.55)} palmDir={dir(0, -0.35, -1)} frame={f} seed={7} look="cool" enterFrame={568} ground={{point: new THREE.Vector3().setFromMatrixPosition(stationMatrix('phone')), normal: new THREE.Vector3(0, 1, 0)}}
          to={{pose: POSES.hold, effector: 'index-finger-phalanx-proximal', target: holdTarget, fingerDir: dir(-0.1, -1, -0.3), palmDir: dir(0, -0.2, -1)}} t={toHold} />
      )}
    </>
  );
};

function mergeTubes(parts: THREE.BufferGeometry[]) {
  if (parts.length === 0) return new THREE.BufferGeometry();
  let n = 0, ni = 0;
  for (const p of parts) { n += p.attributes.position.count; ni += p.index!.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    const ix = p.index!.array;
    for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + o;
    o += p.attributes.position.count; oi += ix.length;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
