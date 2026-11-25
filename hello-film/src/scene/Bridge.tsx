import React, {useMemo} from 'react';
import * as THREE from 'three';
import {getAssets} from '../lib/assets';
import {CamState, cameraMatrix} from '../lib/camera';
import {smoothstep, remap} from '../lib/ease';

/**
 * Era hand-off bridges (FIX 1). A camera-locked surface that organically dissolves in over the departing station,
 * morphs its material (noise-threshold blend: rock -> papyrus fibre, papyrus -> paper, paper -> studio blue ...),
 * and dissolves out over the arriving station. The camera keeps moving on its spline; the surface's texture
 * drifts with the camera's own motion so it reads as a surface the lens glides over, never a black void.
 * Carrier objects (pigment, sorts, light line / wire) render on top of it (see `onTop`).
 */
type Surf = {tex?: string; rep: number; tint: [number, number, number]; gain: number};
const SURF: Record<string, Surf> = {
  rock: {tex: 'cave_rock', rep: 1.1, tint: [1.0, 0.52, 0.30], gain: 0.55},
  rockFar: {tex: 'cave_rock', rep: 0.8, tint: [0.9, 0.42, 0.22], gain: 0.32},
  papyrus: {tex: 'papyrus_paper', rep: 1.4, tint: [0.95, 0.78, 0.55], gain: 0.62},
  paper: {rep: 1, tint: [0.62, 0.60, 0.55], gain: 1},
  ink: {rep: 1, tint: [0.16, 0.14, 0.15], gain: 1},
  navy: {rep: 1, tint: [0.055, 0.085, 0.16], gain: 1},
  slate: {rep: 1, tint: [0.09, 0.10, 0.125], gain: 1},
};
export type BridgeSpec = {in: [number, number]; mix: [number, number]; out: [number, number]; a: string; b: string; edge: [number, number, number]; back?: boolean};
export const BRIDGES: BridgeSpec[] = [
  {in: [110, 122], mix: [120, 140], out: [138, 154], a: 'rock', b: 'papyrus', edge: [1.6, 0.7, 0.25]},
  {in: [226, 236], mix: [234, 250], out: [256, 270], a: 'papyrus', b: 'paper', edge: [1.2, 1.0, 0.8]},
  {in: [374, 386], mix: [380, 398], out: [404, 418], a: 'ink', b: 'navy', edge: [0.6, 0.85, 1.4]},
  {in: [526, 536], mix: [534, 550], out: [564, 578], a: 'navy', b: 'slate', edge: [0.6, 0.85, 1.4]},
  // return: a far, depth-tested firelit rock fill behind the ragged screen, so the void around it is never black
  {in: [1036, 1058], mix: [0, 1], out: [1084, 1104], a: 'rockFar', b: 'rockFar', edge: [0, 0, 0], back: true},
];
/** bridge opacity at f (the DOF is relaxed while a bridge covers the frame so carriers stay crisp) */
export function bridgeAlpha(f: number) {
  let a = 0;
  for (const B of BRIDGES) if (!B.back) a = Math.max(a, smoothstep(B.in[0], B.in[1], f) * (1 - smoothstep(B.out[0], B.out[1], f)));
  return a;
}
/** 0..1 coverage of the bridge at frame f (for carriers that must draw on top) */
export function bridgeActive(f: number) {
  return BRIDGES.some((b) => !b.back && f >= b.in[0] - 2 && f <= b.out[1] + 2);
}

const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const frag = `
varying vec2 vUv;
uniform sampler2D tA, tB; uniform float useA, useB, repA, repB, gainA, gainB;
uniform vec3 cA, cB, uEdge; uniform float uMix, uAlpha; uniform vec2 uOff, uAspect; uniform float uZoom, uSeed;
float h(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }
vec3 surf(sampler2D t, float use, float rep, vec3 tint, float gain, vec2 q){
  if (use > 0.5) return texture2D(t, q*rep).rgb * tint * gain;
  float g = fbm(q*5.0 + 3.0);
  return tint * (0.8 + 0.4*g);
}
void main(){
  vec2 p = (vUv - 0.5) * uAspect;
  vec2 q = p / uZoom + uOff;
  vec3 a = surf(tA, useA, repA, cA, gainA, q);
  vec3 b = surf(tB, useB, repB, cB, gainB, q*1.07 + 0.31);
  float n = fbm(p*2.6 + uSeed);
  float m = smoothstep(n - 0.10, n + 0.10, uMix*1.3 - 0.15);
  vec3 col = mix(a, b, m);
  // low-key light: warm/cool key from upper left, soft falloff (never flat, never black)
  vec2 kp = p - vec2(-0.22, 0.26);
  col *= 0.45 + 0.85 * exp(-dot(kp, kp) * 2.2);
  // glowing morph front
  float e = 1.0 - abs(2.0*m - 1.0);
  col += uEdge * pow(e, 5.0) * 0.35 * step(0.001, uMix) * step(uMix, 0.999);
  float n2 = fbm(p*2.0 + uSeed + 11.0);
  float al = smoothstep(n2 - 0.09, n2 + 0.09, uAlpha*1.3 - 0.15);
  float ae = 1.0 - abs(2.0*al - 1.0);
  col += uEdge * pow(ae, 6.0) * 0.25 * step(0.001, uAlpha) * step(uAlpha, 0.999);
  gl_FragColor = vec4(col, al);
}`;

export const Bridge: React.FC<{frame: number; cam: CamState; aspect: number}> = ({frame: f, cam, aspect}) => {
  const R = useMemo(() => {
    const tex: Record<string, THREE.Texture> = {};
    for (const s of Object.values(SURF)) if (s.tex && !tex[s.tex]) {
      const src = (getAssets() as any).tex[s.tex].albedo as THREE.Texture;
      const t = src.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
      tex[s.tex] = t;
    }
    const dummy = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); dummy.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false, fog: false,
      uniforms: {
        tA: {value: dummy}, tB: {value: dummy}, useA: {value: 0}, useB: {value: 0}, repA: {value: 1}, repB: {value: 1}, gainA: {value: 1}, gainB: {value: 1},
        cA: {value: new THREE.Vector3()}, cB: {value: new THREE.Vector3()}, uEdge: {value: new THREE.Vector3()},
        uMix: {value: 0}, uAlpha: {value: 0}, uOff: {value: new THREE.Vector2()}, uAspect: {value: new THREE.Vector2(1, 1)}, uZoom: {value: 1}, uSeed: {value: 0},
      },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.frustumCulled = false; mesh.renderOrder = 900; mesh.matrixAutoUpdate = false;
    return {tex, dummy, mat, mesh};
  }, []);
  const i = BRIDGES.findIndex((b) => f >= b.in[0] && f <= b.out[1]);
  if (i < 0) { R.mesh.visible = false; return <primitive object={R.mesh} />; }
  const B = BRIDGES[i];
  const alpha = smoothstep(B.in[0], B.in[1], f) * (1 - smoothstep(B.out[0], B.out[1], f));
  const mix = smoothstep(B.mix[0], B.mix[1], f);
  const u = R.mat.uniforms;
  const set = (k: 'A' | 'B', name: string) => {
    const s = SURF[name];
    (u as any)['t' + k].value = s.tex ? R.tex[s.tex] : R.dummy;
    (u as any)['use' + k].value = s.tex ? 1 : 0;
    (u as any)['rep' + k].value = s.rep;
    (u as any)['gain' + k].value = s.gain;
    (u as any)['c' + k].value.set(...s.tint);
  };
  set('A', B.a); set('B', B.b);
  u.uEdge.value.set(...B.edge);
  u.uMix.value = mix; u.uAlpha.value = alpha; u.uSeed.value = i * 17.3;
  // texture drifts with the camera's own travel (parallax-like), slow zoom as it pushes forward
  const t = remap(f, B.in[0], B.out[1]);
  u.uOff.value.set(0.35 * t + 0.1 * i, -0.12 * t);
  u.uZoom.value = 1 + 0.35 * t;
  // place the plane 0.2 m in front of the lens, oversized to cover the frustum
  const D = B.back ? 6 : 0.2;
  R.mat.depthTest = !!B.back;
  R.mesh.renderOrder = B.back ? -5 : 900;
  const halfH = D * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * 1.25;
  const halfW = halfH * aspect;
  u.uAspect.value.set(aspect, 1);
  const M = cameraMatrix(cam).multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 0, -D), new THREE.Quaternion(), new THREE.Vector3(halfW * 2, halfH * 2, 1)));
  R.mesh.matrix.copy(M);
  R.mesh.matrixWorldNeedsUpdate = true;
  R.mesh.visible = alpha > 0.001;
  return <primitive object={R.mesh} />;
};

/** draw an object above the bridge (transparent pass, no depth test) while `on` */
export function onTop(obj: THREE.Object3D, on: boolean, order = 1000) {
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    (o as THREE.Mesh).renderOrder = on ? order : 0;
    for (const mm of Array.isArray(m) ? m : [m]) {
      const ud = mm.userData as any;
      if (ud.__base === undefined) ud.__base = {transparent: mm.transparent, depthTest: mm.depthTest};
      mm.transparent = on ? true : ud.__base.transparent;
      mm.depthTest = on ? false : ud.__base.depthTest;
    }
  });
}
