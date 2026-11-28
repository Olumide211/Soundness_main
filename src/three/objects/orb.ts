import * as THREE from 'three';
import { NOISE_GLSL } from '../lib/glsl';

const lin = (hex: string) => new THREE.Color(hex); // THREE.Color parses sRGB hex into linear working space

export function createOrb() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uHeat: { value: 1 },
      cCore: { value: lin('#FFF2B0') }, cMid: { value: lin('#FF7A1A') }, cEdge: { value: lin('#C21E00') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vObj;
      void main(){
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uHeat; uniform vec3 cCore; uniform vec3 cMid; uniform vec3 cEdge;
      varying vec3 vN; varying vec3 vV; varying vec3 vObj;
      ${NOISE_GLSL}
      void main(){
        float ndv = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        float g = 1.0 - ndv;
        // slow convection cells on the surface + oxide flecks
        vec3 p = vObj * 0.75;
        float n = fbm3(p + vec3(0.0, uTime * 0.12, uTime * 0.05));
        float cells = fbm3(p * 2.7 - vec3(uTime * 0.07, 0.0, 0.0));
        g = clamp(g + (n - 0.5) * 0.28, 0.0, 1.0);
        vec3 col = g < 0.38 ? mix(cCore, cMid, smoothstep(0.0, 0.38, g)) : mix(cMid, cEdge, smoothstep(0.38, 0.95, g));
        float crust = smoothstep(0.58, 0.8, cells);
        col *= mix(1.0, 0.55, crust * smoothstep(0.15, 0.7, g));
        float I = mix(3.6, 1.15, smoothstep(0.0, 0.9, g)) * (0.92 + 0.16 * n);
        gl_FragColor = vec4(col * I * uHeat, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3, 96, 64), mat);
  mesh.castShadow = false;
  const light = new THREE.PointLight(new THREE.Color('#FF6A1A'), 90, 0, 2);
  light.castShadow = false;
  const group = new THREE.Group();
  group.add(mesh, light);
  return {
    group, mesh, light,
    update(time: number, frame: number, heat: number) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uHeat.value = heat;
      // ±8% intensity pulse (two incommensurate sines, deterministic)
      const pulse = 1 + 0.08 * (0.65 * Math.sin(frame * 0.21) + 0.35 * Math.sin(frame * 0.53 + 1.3));
      light.intensity = 70 * heat * heat * pulse;
    },
  };
}
