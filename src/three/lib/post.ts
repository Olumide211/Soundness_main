import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, DepthOfFieldEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, Effect, EffectAttribute, BlendFunction,
} from 'postprocessing';
import { NOISE_GLSL } from './glsl';

const LENS_FRAG = /* glsl */ `
uniform vec2 uVel; uniform vec4 uSrc[3]; uniform float uTime; uniform float uAspect; uniform vec3 uMask;
${NOISE_GLSL}
vec2 shimmer(vec2 uv){
  vec2 off = vec2(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 s = uSrc[i];
    if (s.w <= 0.0) continue;
    vec2 d = uv - s.xy; d.x *= uAspect;
    float r = s.z;
    float h = d.y / r;
    float w = abs(d.x) / (r * (0.85 + 0.28 * max(h, 0.0)));
    float m = smoothstep(-0.9, 0.5, h) * (1.0 - smoothstep(3.0, 6.0, h)) * (1.0 - smoothstep(0.45, 1.05, w));
    vec2 q = vec2(d.x / r * 2.4, h * 1.7 - uTime * 2.2);
    float n1 = vnoise2(q * 2.6) - 0.5;
    float n2 = vnoise2(q * 2.6 + vec2(17.3, 4.1)) - 0.5;
    float n3 = vnoise2(q * 6.1 + vec2(3.3, 9.7)) - 0.5;
    off += vec2(n1 + n3 * 0.5, (n2 + n3 * 0.4) * 0.6) * m * s.w * r * 0.055;
  }
  return off;
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec2 suv = uv + shimmer(uv);
  float L = length(uVel);
  if (L < 0.0008) { outputColor = texture2D(inputBuffer, suv); return; }
  vec2 dm = uv - uMask.xy; dm.x *= uAspect;
  float keep = smoothstep(uMask.z * 1.1, uMask.z * 2.6, length(dm));
  vec2 v = uVel * mix(0.1, 1.0, keep);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 20; i++) {
    float f = (float(i) + hash12(uv * 1000.0 + float(i))) / 20.0 - 0.5;
    acc += texture2D(inputBuffer, suv + v * f);
  }
  outputColor = acc / 20.0;
}`;

export class LensEffect extends Effect {
  constructor() {
    super('LensEffect', LENS_FRAG, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ['uVel', new THREE.Uniform(new THREE.Vector2())],
        ['uSrc', new THREE.Uniform([new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()])],
        ['uTime', new THREE.Uniform(0)],
        ['uAspect', new THREE.Uniform(1)],
        ['uMask', new THREE.Uniform(new THREE.Vector3())],
      ]),
    });
  }
}

const GRAIN_FRAG = /* glsl */ `
uniform float uFrame; uniform vec2 uRes;
float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec2 px = floor(uv * uRes);
  float n = (h(px + vec2(uFrame * 37.0, uFrame * 11.0)) + h(px * 1.37 + uFrame * 5.0)) * 0.5 - 0.5;
  float l = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float amt = 0.022 * (1.0 - 0.6 * l) * (0.4 + 0.6 * smoothstep(0.0, 0.08, l));
  outputColor = vec4(max(inputColor.rgb + n * amt, 0.0), inputColor.a);
}`;

export class GrainEffect extends Effect {
  constructor(w: number, h: number) {
    super('GrainEffect', GRAIN_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uFrame', new THREE.Uniform(0)],
        ['uRes', new THREE.Uniform(new THREE.Vector2(w, h))],
      ]),
    });
  }
}

export function makeComposer(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number) {
  const composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
  composer.addPass(new RenderPass(scene, camera));
  const dof = new DepthOfFieldEffect(camera, { worldFocusDistance: 50, worldFocusRange: 28, bokehScale: 2.4, resolutionScale: 0.5 });
  dof.target = new THREE.Vector3();
  const lens = new LensEffect();
  const bloom = new BloomEffect({
    blendFunction: BlendFunction.ADD, mipmapBlur: true, luminanceThreshold: 1.6, luminanceSmoothing: 0.3, intensity: 0.6, radius: 0.68,
  });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.5 });
  const grain = new GrainEffect(w, h);
  composer.addPass(new EffectPass(camera, dof));
  composer.addPass(new EffectPass(camera, lens));
  composer.addPass(new EffectPass(camera, bloom, tone, vignette, grain));
  composer.setSize(w, h, false);
  return { composer, dof, lens, bloom, grain };
}
