import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

export type SpriteKind = 'smoke' | 'spark' | 'ash';

const VERT = /* glsl */ `
attribute vec3 iPos; attribute float iSize; attribute float iAlpha; attribute vec3 iColor; attribute float iRot; attribute float iSeed; attribute vec3 iVel;
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vColor;
void main(){
  vUv = uv; vAlpha = iAlpha; vSeed = iSeed; vColor = iColor;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
#ifdef STRETCH
  vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
  vec2 d = vv.xy; float L = length(d);
  vec2 dir = L > 1e-5 ? d / L : vec2(0.0, 1.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 off = nrm * c.x * iSize + dir * c.y * (iSize + L);
#else
  float cs = cos(iRot), sn = sin(iRot);
  vec2 off = vec2(c.x*cs - c.y*sn, c.x*sn + c.y*cs) * iSize;
#endif
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG: Record<SpriteKind, string> = {
  smoke: /* glsl */ `
uniform float uTime; varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vColor;
${NOISE_GLSL}
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  float n = fbm2(p * 2.6 + vec2(vSeed * 17.0, vSeed * 5.0 - uTime * 0.35));
  float n2 = fbm2(p * 5.0 + vec2(vSeed * 3.0 + 11.0, -uTime * 0.6));
  float a = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.9) * (0.55 + 0.9 * (n2 - 0.35));
  a = clamp(a, 0.0, 1.0) * vAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor, a);
}`,
  spark: /* glsl */ `
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vColor;
void main(){
  float across = abs(vUv.x - 0.5) * 2.0;
  float along = abs(vUv.y - 0.5) * 2.0;
  float s = (1.0 - smoothstep(0.0, 1.0, across)) * (1.0 - smoothstep(0.55, 1.0, along));
  s = s * s;
  gl_FragColor = vec4(vColor * s * vAlpha, 1.0);
}`,
  ash: /* glsl */ `
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vColor;
${NOISE_GLSL}
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  float n = vnoise2(p * 5.0 + vSeed * 31.0);
  float edge = 0.55 + 0.35 * (n - 0.5) + 0.15 * vnoise2(p * 13.0 + vSeed * 7.0);
  float m = 1.0 - smoothstep(edge - 0.06, edge, r);
  if (m < 0.05) discard;
  float rim = smoothstep(edge - 0.25, edge - 0.04, r);
  vec3 base = vec3(0.045, 0.04, 0.038) * (0.7 + 0.6 * n);
  vec3 col = base + vColor * rim * (0.6 + 0.8 * vnoise2(p * 9.0 + vSeed));
  gl_FragColor = vec4(col, m * vAlpha);
}`,
};

export class Sprites {
  mesh: THREE.Mesh;
  count: number;
  geo: THREE.InstancedBufferGeometry;
  mat: THREE.ShaderMaterial;
  a: { pos: Float32Array; size: Float32Array; alpha: Float32Array; color: Float32Array; rot: Float32Array; seed: Float32Array; vel: Float32Array };
  private attrs: THREE.InstancedBufferAttribute[] = [];
  constructor(count: number, kind: SpriteKind) {
    this.count = count;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const mk = (n: number) => new Float32Array(count * n);
    this.a = { pos: mk(3), size: mk(1), alpha: mk(1), color: mk(3), rot: mk(1), seed: mk(1), vel: mk(3) };
    const add = (name: string, arr: Float32Array, n: number) => {
      const at = new THREE.InstancedBufferAttribute(arr, n);
      at.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, at);
      this.attrs.push(at);
    };
    add('iPos', this.a.pos, 3); add('iSize', this.a.size, 1); add('iAlpha', this.a.alpha, 1); add('iColor', this.a.color, 3);
    add('iRot', this.a.rot, 1); add('iSeed', this.a.seed, 1); add('iVel', this.a.vel, 3);
    geo.instanceCount = count;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG[kind],
      transparent: true,
      depthWrite: false,
      blending: kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: kind === 'spark' ? { STRETCH: '' } : {},
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === 'smoke' ? 5 : 4;
    for (let i = 0; i < count; i++) this.a.seed[i] = (i * 0.618034) % 1;
  }
  hideAll() { this.a.alpha.fill(0); }
  set(i: number, x: number, y: number, z: number, size: number, alpha: number, r: number, g: number, b: number, rot = 0, vx = 0, vy = 0, vz = 0) {
    const A = this.a;
    A.pos[i * 3] = x; A.pos[i * 3 + 1] = y; A.pos[i * 3 + 2] = z;
    A.size[i] = size; A.alpha[i] = alpha; A.rot[i] = rot;
    A.color[i * 3] = r; A.color[i * 3 + 1] = g; A.color[i * 3 + 2] = b;
    A.vel[i * 3] = vx; A.vel[i * 3 + 1] = vy; A.vel[i * 3 + 2] = vz;
  }
  commit(time: number) {
    this.mat.uniforms.uTime.value = time;
    for (const at of this.attrs) at.needsUpdate = true;
  }
}

/** Instanced 3D droplets / blobs. */
export class Blobs {
  mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  n = 0;
  constructor(count: number, material: THREE.Material, detail = 12) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, detail, Math.max(6, Math.floor(detail * 0.75))), material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }
  begin() { this.n = 0; }
  /** stretch along a direction (dx,dy,dz) by factor */
  push(x: number, y: number, z: number, r: number, dx = 0, dy = 1, dz = 0, stretch = 1, flat = 1) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.v.set(dx, dy, dz);
    const L = this.v.length();
    if (L > 1e-6) this.v.multiplyScalar(1 / L); else this.v.set(0, 1, 0);
    this.q.setFromUnitVectors(this.up, this.v);
    this.s.set(r * flat, r * stretch, r * flat);
    this.m.compose(this.v.set(x, y, z), this.q, this.s);
    this.mesh.setMatrixAt(this.n++, this.m);
  }
  pushFlat(x: number, y: number, z: number, rx: number, ry: number, rz: number, rotY = 0) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.q.setFromAxisAngle(this.up, rotY);
    this.s.set(rx, ry, rz);
    this.m.compose(this.v.set(x, y, z), this.q, this.s);
    this.mesh.setMatrixAt(this.n++, this.m);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
