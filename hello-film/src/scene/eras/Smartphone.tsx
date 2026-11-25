import React, {useMemo} from 'react';
import * as THREE from 'three';
import {getAssets, texSet, TILE} from '../../lib/assets';
import {PHONE, uiToPhone} from '../layout';
import {phoneWorldMatrix, socketFocusY, ORB_UI, orbWorld} from './returnTiming';
import {drawPost, KEYS, POST_PILL, P as post} from '../ui/drawPost';
import {drawChat, orbRadius, orbColours, setHandOutline} from '../ui/drawChat';
import {UI} from '../ui/common';
import {Hand, POSES} from '../hands/Hand';
import {easeInOutCubic, easeOutCubic, remap, smoothstep, lerp, clamp01, easeInCubic} from '../../lib/ease';
import {useBillboards, BillboardPrim} from '../particles/Billboards';
import {hash, SEEDS} from '../../lib/rng';
import {curlDrift} from '../../lib/noise';
import screenGlsl from '../../fx/shaders/screenEmission.glsl';
import {shotCamera} from '../../lib/camera';
import {SHOT} from '../../lib/shot';

const NOISE_GLSL = `
float rh(vec2 p){ p = fract(p*vec2(233.34, 851.73)); p += dot(p, p+23.45); return fract(p.x*p.y); }
float rn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(rh(i),rh(i+vec2(1,0)),f.x), mix(rh(i+vec2(0,1)),rh(i+vec2(1,1)),f.x), f.y); }
float rfbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*rn(p); p*=2.03; a*=0.5; } return s; }
float rn3(vec3 p){ return rn(p.xy*1.0 + p.z*0.73) * 0.5 + rn(p.yz*1.3 + p.x*0.41) * 0.5; }`;

/** noise-threshold dissolve with an edge glow; uDis: 0 = solid, 1 = gone */
function addDissolve(m: THREE.MeshPhysicalMaterial, u: {uDis: {value: number}; uGlow: {value: THREE.Color}}) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev?.call(m, s, r);
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjP; uniform float uDis; uniform vec3 uGlow;' + NOISE_GLSL + '\nfloat disEdge;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n{ float n = rn3(vObjP * 260.0) * 0.7 + rn3(vObjP * 60.0) * 0.3; float th = uDis * 1.08 - 0.04; if (n < th) discard; disEdge = (uDis > 0.001 && uDis < 0.999) ? 1.0 - smoothstep(0.0, 0.05, n - th) : 0.0; }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * disEdge * 6.0;');
  };
  m.customProgramCacheKey = () => 'dis_' + m.uuid;
}

function bodyGeometry() {
  const w = PHONE.w - 0.002, h = PHONE.h - 0.002, r = 0.009;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, h / 2 - r); s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2); s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -h / 2 + r); s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, {depth: PHONE.d - 0.002, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 10, curveSegments: 24});
  g.translate(0, 0, -(PHONE.d - 0.002) / 2);
  return g;
}

export const Smartphone: React.FC<{frame: number; screenMix: number}> = ({frame: f, screenMix}) => {
  const R = useMemo(() => {
    const A = getAssets();
    setHandOutline(A.svg.hand_stencil_silhouette);
    const ui = document.createElement('canvas'); ui.width = UI.w * UI.scale; ui.height = UI.h * UI.scale;
    const uiTex = new THREE.CanvasTexture(ui); uiTex.colorSpace = THREE.SRGBColorSpace; uiTex.anisotropy = 8; uiTex.generateMipmaps = true; uiTex.minFilter = THREE.LinearMipmapLinearFilter;
    const al = texSet('aluminium', 0.02 / TILE.metal, 0.02 / TILE.metal);
    const disU = {uDis: {value: 0}, uGlow: {value: new THREE.Color('#CFE8FF')}};
    const frame = new THREE.MeshPhysicalMaterial({color: '#C9CDD2', metalness: 1, roughness: 0.28});
    addDissolve(frame, disU);
    const glassBlack = new THREE.MeshPhysicalMaterial({color: '#050506', roughness: 0.02, clearcoat: 1, metalness: 0});
    addDissolve(glassBlack, disU);
    const alu = new THREE.MeshPhysicalMaterial({map: al.albedo, normalMap: al.normal_gl, roughnessMap: al.roughness, metalness: 1, roughness: 0.3});
    const lens = new THREE.MeshPhysicalMaterial({color: '#030305', roughness: 0.05, clearcoat: 1});
    const scrU = {uPower: {value: 0}, uLcd: {value: 0}, uRagAmp: {value: 0}, uRagHalf: {value: 1000}, uRagCentre: {value: new THREE.Vector2(195, 422)}};
    const screen = new THREE.MeshPhysicalMaterial({color: '#000000', emissive: new THREE.Color('#ffffff'), emissiveMap: uiTex, emissiveIntensity: 1, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 1.0});
    screen.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, scrU);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vScrUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvScrUv = uv;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vScrUv; uniform float uPower; uniform float uLcd; uniform float uRagAmp; uniform float uRagHalf; uniform vec2 uRagCentre;' + NOISE_GLSL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + screenGlsl);
    };
    screen.customProgramCacheKey = () => 'phoneScreen';
    const body = bodyGeometry();
    // reply bubbles (3D)
    const bc = document.createElement('canvas'); bc.width = 132; bc.height = 88;
    const bx = bc.getContext('2d')!;
    bx.fillStyle = '#1C1C22'; bx.beginPath(); (bx as any).roundRect(4, 4, 124, 80, 36); bx.fill();
    bx.fillStyle = '#8A8F98'; [42, 66, 90].forEach((x) => { bx.beginPath(); bx.arc(x, 44, 7, 0, Math.PI * 2); bx.fill(); });
    const bubTex = new THREE.CanvasTexture(bc); bubTex.colorSpace = THREE.SRGBColorSpace;
    const bubMats = [0, 1, 2, 3, 4, 5].map(() => new THREE.MeshBasicMaterial({map: bubTex, transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.6)}));
    // orb sprite texture
    const oc = document.createElement('canvas'); oc.width = oc.height = 256;
    const ox = oc.getContext('2d')!;
    const g = ox.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.9)'); g.addColorStop(0.32, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ox.fillStyle = g; ox.fillRect(0, 0, 256, 256);
    const orbTex = new THREE.CanvasTexture(oc);
    const orbMat = new THREE.SpriteMaterial({map: orbTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(3, 3, 3)});
    const orb = new THREE.Sprite(orbMat);
    return {ui, uiTex, disU, frame, glassBlack, alu, lens, screen, scrU, body, bubMats, orb, orbMat, avatar: A.avatar};
  }, []);

  // ---- UI canvas ----
  const ctx = R.ui.getContext('2d')!;
  ctx.setTransform(UI.scale, 0, 0, UI.scale, 0, 0);
  if (f < 840) drawPost(ctx, f, R.avatar); else drawChat(ctx, f, R.avatar);
  R.uiTex.needsUpdate = true;

  // ---- materialise / dissolve ----
  const dis = f < 1000 ? 1 - smoothstep(690, 712, f) : smoothstep(1040, 1100, f);
  R.disU.uDis.value = dis;
  R.disU.uGlow.value.set(f < 1000 ? '#CFE8FF' : '#FFC872');
  // power on: 0 -> 1 over 8 f, overshoot 1.08, back
  const po = f < 712 ? 0 : f < 720 ? easeOutCubic((f - 712) / 8) * 1.08 : lerp(1.08, 1, smoothstep(720, 726, f));
  R.scrU.uPower.value = po;
  R.screen.emissiveIntensity = lerp(1.55, 1.0, screenMix);
  R.screen.envMapIntensity = lerp(1.0, 0.04, smoothstep(830, 856, f));
  R.screen.clearcoat = lerp(1, 0.0, smoothstep(830, 856, f));
  R.screen.roughness = lerp(0.02, 0.35, smoothstep(830, 856, f));
  R.screen.metalness = 0; R.screen.specularIntensity = lerp(1, 0, smoothstep(830, 856, f));
  const cam = shotCamera(f, SHOT.vertical, false);
  const M = phoneWorldMatrix(f);
  const phonePos = new THREE.Vector3().setFromMatrixPosition(M);
  R.scrU.uLcd.value = cam.pos.distanceTo(phonePos) < 0.25 ? 1 : 0;
  // ragged edge
  const rag = remap(f, 1040, 1108);
  R.scrU.uRagAmp.value = 0.18 * 390 * smoothstep(1040, 1075, f);
  R.scrU.uRagHalf.value = f < 1040 ? 1000 : lerp(260, -60, easeInCubic(rag) * 0.35 + easeInOutCubic(rag) * 0.65);
  R.scrU.uRagCentre.value.set(195, socketFocusY(f));

  // ---- thumb ----
  const ks = post.typingSchedule.keystrokes;
  const toWorld = (p: THREE.Vector3) => p.clone().applyMatrix4(M);
  const keyPt = (ch: string) => { const k = KEYS[ch]; return uiToPhone(k.x + k.w / 2, k.y + k.h / 2 + 4); };
  let tip = keyPt('h'), hover = 0.007;
  if (f < 735) { const e = easeOutCubic(remap(f, 718, 733)); tip = keyPt('h').add(new THREE.Vector3(0.06, -0.08, 0.03).multiplyScalar(1 - e)); hover = 0.007 * (1 - smoothstep(731, 735, f)); }
  else if (f < 788) {
    let i = 0; while (i < ks.length - 1 && ks[i + 1].frame <= f) i++;
    const cur = ks[i], nxt = ks[Math.min(ks.length - 1, i + 1)];
    const dt = f - cur.frame;
    const press = dt < 2 ? 1 : 0;
    const mv = nxt === cur ? 0 : easeInOutCubic(remap(f, cur.frame + 2, nxt.frame - 0.5));
    tip = keyPt(cur.char).lerp(keyPt(nxt.char), mv);
    hover = press ? 0.0006 : 0.0006 + 0.006 * Math.sin(Math.PI * clamp01(mv)) + 0.002 * (dt >= 2 && mv === 0 ? 1 : 0) + 0.004 * smoothstep(783, 788, f);
  } else {
    const pill = uiToPhone(POST_PILL.x + POST_PILL.w / 2, POST_PILL.y + POST_PILL.h / 2 + 3);
    const e = easeInOutCubic(remap(f, 785, 791));
    tip = keyPt('d').lerp(pill, e);
    hover = f >= 792 && f < 795 ? 0.0006 : 0.007 * (1 - smoothstep(789, 792, f)) + 0.0006 + 0.006 * smoothstep(795, 800, f);
    tip.add(new THREE.Vector3(0.06, -0.1, 0.04).multiplyScalar(easeInOutCubic(remap(f, 798, 814))));
  }
  tip.z += hover;
  const tapPose = {...POSES.tap, thumbCurl: hover < 0.001 ? 0.45 : 0.2};
  const dirP = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).transformDirection(M);
  const showThumb = f >= 716 && f <= 816;

  // ---- reply bubbles leave the screen plane (810-832) ----
  const bubbles: React.ReactNode[] = [];
  post.publishedPost.replyBubbles.spawnFrames.forEach((s0, i) => {
    if (f < s0 || f > s0 + 20) return;
    const t = (f - s0) / 18;
    const sz = lerp(26, 44, hash(i, 41)) * PHONE.pt;
    const local = uiToPhone(40 + 60 * i, 214).add(new THREE.Vector3((hash(i, 42) - 0.5) * 0.01, 0.06 * easeOutCubic(t), 0.004 + 0.02 * easeOutCubic(t)));
    const p = toWorld(local);
    const q = new THREE.Quaternion().setFromRotationMatrix(M).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4 * t, (hash(i, 43) - 0.5) * 0.8 * t, (hash(i, 44) - 0.5) * 0.6 * t)));
    R.bubMats[i].opacity = clamp01(t * 6) * (1 - smoothstep(0.4, 1, t));
    bubbles.push(<mesh key={i} position={p} quaternion={q} material={R.bubMats[i]}><planeGeometry args={[sz * 1.5, sz]} /></mesh>);
  });

  // ---- 3D orb sprite (bloom catches it) ----
  const orbOn = f >= 880 && f <= 1125;
  if (orbOn) {
    const oc = orbColours(f);
    const rPt = orbRadius(f) * oc.k;
    const toFire = smoothstep(1060, 1120, f);
    const size = lerp(rPt * 2.2 * PHONE.pt, 0.05, toFire) * (1 - 0.6 * smoothstep(1100, 1122, f));
    R.orb.position.copy(orbWorld(f));
    R.orb.scale.setScalar(Math.max(1e-4, size));
    const col = new THREE.Color(`rgb(${oc.core.map(Math.round).join(',')})`).lerp(new THREE.Color(`rgb(${oc.halo.map(Math.round).join(',')})`), 0.35);
    R.orbMat.color.copy(col).multiplyScalar(lerp(1.6, 4, toFire) * oc.k * (1 - smoothstep(1112, 1125, f)));
  }

  const showBody = f >= 688 && f <= 1112;
  const q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  M.decompose(pos, q, sc);
  return (
    <>
      {showBody && (
        <group position={pos} quaternion={q}>
          <mesh geometry={R.body} material={R.frame} castShadow />
          <mesh material={R.glassBlack} position={[0, 0, PHONE.d / 2 + 0.0001]}><planeGeometry args={[PHONE.w - 0.0028, PHONE.h - 0.0028]} /></mesh>
          <mesh material={R.screen} position={[0, 0, PHONE.d / 2 + 0.0003]} renderOrder={2}><planeGeometry args={[PHONE.scrW, PHONE.scrH]} /></mesh>
          {/* camera island (back, top-left) */}
          <group position={[-0.018, 0.055, -PHONE.d / 2 - 0.0008]} rotation={[Math.PI / 2, 0, 0]}>
            {[[0, 0.007], [0, -0.007], [0.012, 0]].map(([x, z], k) => (
              <group key={k} position={[x, 0, z]}>
                <mesh material={R.alu}><cylinderGeometry args={[0.0052, 0.0052, 0.0016, 32]} /></mesh>
                <mesh material={R.lens} position={[0, -0.0003, 0]}><cylinderGeometry args={[0.0038, 0.0038, 0.0016, 32]} /></mesh>
              </group>
            ))}
          </group>
          {/* side buttons */}
          <mesh material={R.alu} position={[PHONE.w / 2 + 0.0004, 0.03, 0]}><boxGeometry args={[0.0012, 0.018, 0.003]} /></mesh>
          <mesh material={R.alu} position={[-PHONE.w / 2 - 0.0004, 0.04, 0]}><boxGeometry args={[0.0012, 0.01, 0.003]} /></mesh>
          <mesh material={R.alu} position={[-PHONE.w / 2 - 0.0004, 0.025, 0]}><boxGeometry args={[0.0012, 0.01, 0.003]} /></mesh>
        </group>
      )}
      {showThumb && (
        <Hand side="right" pose={tapPose} effector="thumb-tip" target={toWorld(tip)} fingerDir={dirP(-0.45, 0.55, -0.7)} palmDir={dirP(-0.7, -0.1, -0.7)} frame={f} seed={9} />
      )}
      {bubbles}
      {orbOn && <primitive object={R.orb} />}
      <DissolveEmbers frame={f} />
    </>
  );
};

const ES = SEEDS.embers ^ 0x77;
/** the phone body dissolves into 1,500 embers that rise and drift (1040-1150) */
const DissolveEmbers: React.FC<{frame: number}> = ({frame: f}) => {
  const bb = useBillboards(1500, {normalShare: 0.15, gain: 4, soft: 0.0});
  const on = f >= 1040 && f <= 1160;
  if (on) {
    const d: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 1500; i++) {
      const t0 = 1040 + 62 * hash(i, ES);
      const age = f - t0;
      if (age < 0 || age > 48) { bb.alpha[i] = 0; continue; }
      const local = new THREE.Vector3((hash(i, ES + 1) - 0.5) * PHONE.w, (hash(i, ES + 2) - 0.5) * PHONE.h, (hash(i, ES + 3) - 0.5) * PHONE.d);
      // spread wider than the body so embers fill the frame edge as the screen tears
      local.x *= 1.0 + 1.6 * hash(i, ES + 4); local.y *= 1.0 + 0.6 * hash(i, ES + 5);
      const p = local.applyMatrix4(phoneWorldMatrix(Math.min(t0, 1110)));
      curlDrift(i + ES, age / 30 * 2, d);
      p.x += d[0] * 0.02 * age / 30; p.y += 0.05 * (age / 30) + d[1] * 0.015 * age / 30; p.z += d[2] * 0.02 * age / 30;
      bb.pos.set([p.x, p.y, p.z], i * 3);
      bb.size[i] = 0.0006 + 0.0012 * hash(i, ES + 6);
      const k = age / 48;
      bb.col.set([1, lerp(0.85, 0.45, k), lerp(0.55, 0.15, k)], i * 3);
      bb.alpha[i] = smoothstep(0, 0.1, k) * (1 - smoothstep(0.5, 1, k));
    }
    bb.commit();
  }
  bb.mesh.visible = on;
  return <BillboardPrim bb={bb} />;
};
