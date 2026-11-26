import React, {useMemo} from 'react';
import * as THREE from 'three';
import {getAssets, texSet, TILE} from '../../lib/assets';
import {StationRoot} from '../World';
import {PigmentData, PATCH} from '../particles/pigmentData';
import {MOTIFS} from '../particles/pigmentData';
import {shotCamera, cameraMatrix} from '../../lib/camera';
import {remap, easeInOutSine, easeInOutCubic} from '../../lib/ease';
import {CREDIT_TEXT} from '../../overlay/Credit';

export const WALL_R = 6;
export const WALL_W = 3.1, WALL_H = 4; // narrowed so the return camera passes the wall's edge instead of through it
export const wallZ = (x: number) => WALL_R - Math.sqrt(WALL_R * WALL_R - x * x);

const HAND = MOTIFS[0];

export function makeCaveMaterial(pig: PigmentData) {
  const ts = texSet('cave_rock', WALL_W / TILE.rock, WALL_H / TILE.rock);
  const mat = new THREE.MeshPhysicalMaterial({
    map: ts.albedo, normalMap: ts.normal_gl, roughnessMap: ts.roughness, aoMap: ts.ao,
    displacementMap: ts.displacement, displacementScale: 0.06, displacementBias: -0.03,
    normalScale: new THREE.Vector2(1.2, 1.2), aoMapIntensity: 1.0,
    color: new THREE.Color('#C9A27A'), roughness: 1, metalness: 0,
  });
  const uniforms = {
    uFrame: {value: 0},
    uMask: {value: pig.mask},
    uTimes: {value: pig.times},
    uHeight: {value: ts.displacement},
    uOchre: {value: new THREE.Color('#E0A458')},
    uRust: {value: new THREE.Color('#B5652B')},
    uHandX: {value: new THREE.Vector2(HAND.cx - 0.2, HAND.cx + 0.2)},
    uSpec: {value: 1},
    // credit tail: the end card is painted onto the rock (pale ochre / kaolin), projected from the held credit camera
    uRefVP: {value: new THREE.Matrix4()},
    uCredit: {value: null as THREE.Texture | null},
    uCredX: {value: new THREE.Vector2(0, 1)},
    uCredRev: {value: 0},
    uCredA: {value: 0},
    uKaolin: {value: new THREE.Color('#D8A56A')},
  };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPatchM;\nuniform mat4 uRefVP;\nvarying vec4 vRefClip;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPatchM = position.xy;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRefClip = uRefVP * modelMatrix * vec4(transformed, 1.0);');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vPatchM;
uniform float uFrame; uniform sampler2D uMask; uniform sampler2D uTimes; uniform sampler2D uHeight;
uniform vec3 uOchre; uniform vec3 uRust; uniform vec2 uHandX;
varying vec4 vRefClip; uniform sampler2D uCredit; uniform vec2 uCredX; uniform float uCredRev; uniform float uCredA; uniform vec3 uKaolin;
float pigAmt; float pigBand;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec2 pu = vPatchM / ${PATCH.toFixed(3)} + 0.5;
  float inside = step(0.0, pu.x) * step(pu.x, 1.0) * step(0.0, pu.y) * step(pu.y, 1.0);
  vec4 pm = texture2D(uMask, clamp(pu, 0.0, 1.0)) * inside;
  float h = texture2D(uHeight, vMapUv).r;
  float grainB = smoothstep(0.35, 0.6, h + 0.15);
  float n1 = vnoise(vPatchM * 160.0) * 0.6 + vnoise(vPatchM * 47.0) * 0.4;
  vec4 tt = texture2D(uTimes, clamp(pu, 0.0, 1.0));
  float emitT = 100.0 + 18.0 * tt.r;
  float landT = 1112.0 + 54.0 * tt.g;
  float alive = 1.0;
  if (uFrame >= 100.0 && uFrame < 1110.0) alive = 1.0 - smoothstep(emitT, emitT + 4.0, uFrame);
  if (uFrame >= 1110.0) alive = smoothstep(landT, landT + 4.0, uFrame);
  float m = max(pm.r, pm.g);
  float isHand = step(0.5, abs(pm.b * 255.0 / 60.0 - 1.0) < 0.5 ? 1.0 : 0.0);
  float edge = mix(smoothstep(0.15, 0.75, m + (n1 - 0.5) * 0.55), smoothstep(0.03, 0.3, m * (0.8 + 0.4 * n1)), isHand);
  pigAmt = edge * alive * mix(0.45, 1.0, grainB) * 0.93;
  vec3 pig = mix(uRust, uOchre, pm.r / (pm.r + pm.g + 1e-4));
  pig *= 0.82 + 0.3 * n1;
  float wash = pm.a * (0.55 + 0.45 * grainB);
  diffuseColor.rgb = mix(diffuseColor.rgb, uOchre * 0.75, wash * 0.5);
  // wet-ochre sweep 40-70 across the hand stencil
  float sweepT = clamp((uFrame - 40.0) / 30.0, 0.0, 1.0);
  float sweepOn = step(40.0, uFrame) * step(uFrame, 70.0);
  float cx = mix(uHandX.x - 0.15, uHandX.y + 0.15, sweepT);
  pigBand = sweepOn * (1.0 - smoothstep(0.0, 0.125, abs(vPatchM.x - cx))) * smoothstep(0.02, 0.6, max(pm.g, pm.r)) * step(0.0, vPatchM.y);
  pig *= 1.0 - 0.18 * pigBand;
  diffuseColor.rgb = mix(diffuseColor.rgb, pig, pigAmt);
  if (uCredA > 0.0) {
    vec2 cuv = vRefClip.xy / vRefClip.w * 0.5 + 0.5;
    float cin = step(0.0, cuv.x) * step(cuv.x, 1.0) * step(0.0, cuv.y) * step(cuv.y, 1.0);
    float cm = texture2D(uCredit, clamp(cuv, 0.0, 1.0)).r * cin;
    float cxn = (cuv.x - uCredX.x) / (uCredX.y - uCredX.x);
    float rev = 1.0 - smoothstep(-0.03, 0.03, cxn - uCredRev + (n1 - 0.5) * 0.05); // brushed on left to right
    float n2 = vnoise(vPatchM * 420.0);
    float ce = smoothstep(0.3, 0.75, cm + (n1 - 0.5) * 0.6 + (n2 - 0.5) * 0.25) * mix(0.4, 1.0, grainB) * rev * uCredA;
    vec3 cp = uKaolin * (0.8 + 0.35 * n1);
    diffuseColor.rgb = mix(diffuseColor.rgb, cp, ce * 0.85);
    pigAmt = max(pigAmt, ce);
  }
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.85 - 0.30 * pigBand, pigAmt);`,
      );
  };
  (mat as any).userData.u = uniforms;
  mat.customProgramCacheKey = () => 'caveWall';
  return mat;
}

export function makeWallGeometry() {
  const g = new THREE.PlaneGeometry(WALL_W, WALL_H, 256, 170);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, wallZ(p.getX(i)));
  g.computeVertexNormals();
  return g;
}

/** the credit as a brush-lettered mask in the held credit camera's frame (square: bottom-left beside "hello"; vertical: under it) */
function creditMask(vertical: boolean) {
  const W = 1080, H = vertical ? 1920 : 1080;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const size = vertical ? 108 : 64;
  g.font = `400 ${size}px CaveatBrush`;
  const w = g.measureText(CREDIT_TEXT).width;
  const x = vertical ? (W - w) / 2 : Math.max(60, 0.43 * W - w);
  const y = vertical ? 0.865 * H : 0.84 * H;
  g.filter = 'blur(1.2px)';
  g.fillStyle = '#fff';
  g.fillText(CREDIT_TEXT, x, y);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return {t, x0: (x - 4) / W, x1: (x + w + 4) / W};
}

export const CaveWall: React.FC<{frame: number; rawFrame?: number; credit?: boolean; vertical?: boolean}> = ({frame, rawFrame = frame, credit = false, vertical = false}) => {
  const {geo, mat} = useMemo(() => {
    const pig = (getAssets() as any).pigment as PigmentData;
    return {geo: makeWallGeometry(), mat: makeCaveMaterial(pig)};
  }, []);
  const u = (mat as any).userData.u;
  u.uFrame.value = frame;
  const cred = useMemo(() => {
    if (!credit) return null;
    const m = creditMask(vertical);
    const c = shotCamera(1274, vertical, true); // the held end pose
    const cam = new THREE.PerspectiveCamera(c.fov, vertical ? 1080 / 1920 : 1, 0.008, 40);
    cam.updateProjectionMatrix();
    const vp = cam.projectionMatrix.clone().multiply(cameraMatrix(c).invert());
    return {...m, vp};
  }, [credit, vertical]);
  if (cred && rawFrame >= 1200) {
    u.uCredit.value = cred.t; u.uRefVP.value.copy(cred.vp); u.uCredX.value.set(cred.x0, cred.x1);
    u.uCredRev.value = 1.08 * easeInOutSine(remap(rawFrame, 1206, 1236)) - 0.04;
    u.uCredA.value = 1 - easeInOutCubic(remap(rawFrame, 1258, 1273));
  } else u.uCredA.value = 0;
  return (
    <StationRoot name="cave">
      <mesh geometry={geo} material={mat} receiveShadow={false} />
    </StationRoot>
  );
};
