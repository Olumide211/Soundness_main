import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

// Billboarded volumetric-looking flame. HDR output (blooms), additive.
const VERT = /* glsl */ `
uniform vec2 uSize; uniform float uLean;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  // cylindrical billboard: keep world-up
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 rightV = normalize(cross(upV, vec3(0.0, 0.0, 1.0)));
  vec2 c = position.xy; // x in [-0.5,0.5], y in [0,1]
  mv.xyz += rightV * (c.x * uSize.x + uLean * c.y * c.y * uSize.y) + upV * c.y * uSize.y;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform float uTime; uniform float uSeed; uniform float uIntensity; uniform float uTurb; uniform float uBlue;
varying vec2 vUv;
${NOISE_GLSL}
void main(){
  float y = vUv.y; float x = (vUv.x - 0.5) * 2.0;
  float t = uTime;
  float n = fbm2(vec2(x * 1.8 + uSeed, y * 3.2 - t * 3.1));
  float n2 = fbm2(vec2(x * 4.0 - uSeed, y * 6.0 - t * 5.3));
  x += (n - 0.5) * (0.30 + uTurb) * y + sin(t * 2.3 + uSeed * 6.0) * 0.07 * y * y;
  // teardrop body: narrow pointed top, rounded base
  float w = 0.46 * pow(clamp(y / 0.24, 0.0, 1.0), 0.55) * (1.0 - smoothstep(0.24, 1.0, y) * 0.92) + 0.02;
  float d = abs(x) / w;
  float vy = y < 0.24 ? (0.24 - y) / 0.2 : 0.0;
  float body = 1.0 - smoothstep(0.55, 1.0, sqrt(d * d + vy * vy));
  // tongues near the top for turbulent fire
  body *= 1.0 - smoothstep(0.5, 1.0, y + (n2 - 0.5) * (0.25 + uTurb * 1.4));
  if (body < 0.003) discard;
  float core = 1.0 - smoothstep(0.0, 0.55, sqrt(d * d * 1.6 + pow(max(0.0, y - 0.32) * 1.9, 2.0) + vy * vy));
  vec3 cEdge = vec3(1.0, 0.22, 0.03);
  vec3 cBody = vec3(1.0, 0.55, 0.12);
  vec3 cCore = vec3(1.0, 0.92, 0.62);
  vec3 col = mix(cEdge, cBody, smoothstep(0.0, 0.6, body));
  col = mix(col, cCore, core);
  // dark zone right above the wick and blue base
  float blueZone = (1.0 - smoothstep(0.08, 0.3, y)) * smoothstep(0.2, 0.9, d) * uBlue;
  col = mix(col, vec3(0.15, 0.3, 1.0) * 0.8, blueZone);
  float lum = (0.9 + 2.6 * core) * body * uIntensity;
  gl_FragColor = vec4(col * lum, body);
}`;

export class Flame {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor(seed: number, opts: { turb?: number; blue?: number } = {}) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: seed }, uIntensity: { value: 1 }, uSize: { value: new THREE.Vector2(1, 3) },
        uLean: { value: 0 }, uTurb: { value: opts.turb ?? 0 }, uBlue: { value: opts.blue ?? 1 },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  set(time: number, w: number, h: number, intensity: number, lean = 0) {
    const u = this.mat.uniforms;
    u.uTime.value = time; u.uSize.value.set(w, h); u.uIntensity.value = intensity; u.uLean.value = lean;
    this.mesh.visible = intensity > 0.001 && h > 0.01;
  }
}
