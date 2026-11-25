import React, {useMemo} from 'react';
import * as THREE from 'three';

/** Instanced soft round billboards. Pure: caller fills arrays from (seed, index, frame) every render. */
export type BB = {
  mesh: THREE.InstancedMesh;
  pos: Float32Array; size: Float32Array; col: Float32Array; alpha: Float32Array;
  commit: (n?: number) => void;
};

const vert = /* glsl */ `
attribute vec3 iPos; attribute float iSize; attribute vec3 iCol; attribute float iAlpha;
varying vec2 vUv; varying vec3 vCol; varying float vA;
#include <fog_pars_vertex>
void main(){
  vUv = position.xy;
  vCol = iCol; vA = iAlpha;
  vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
  mvPosition.xy += position.xy * iSize;
  gl_Position = projectionMatrix * mvPosition;
  if (iAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <fog_vertex>
}`;
const frag = /* glsl */ `
uniform float uNormalShare; uniform float uGain; uniform float uSoft;
varying vec2 vUv; varying vec3 vCol; varying float vA;
#include <fog_pars_fragment>
void main(){
  float r = length(vUv) * 2.0;
  float a = (1.0 - smoothstep(uSoft, 1.0, r)) * vA;
  if (a < 0.003) discard;
  vec3 c = vCol * uGain;
  gl_FragColor = vec4(c * a, a * uNormalShare);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb *= 1.0 - fogFactor;
  #endif
}`;

export function useBillboards(count: number, opts: {normalShare?: number; gain?: number; soft?: number} = {}): BB {
  return useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    const pos = new Float32Array(count * 3), size = new Float32Array(count), col = new Float32Array(count * 3), alpha = new Float32Array(count);
    const aPos = new THREE.InstancedBufferAttribute(pos, 3), aSize = new THREE.InstancedBufferAttribute(size, 1), aCol = new THREE.InstancedBufferAttribute(col, 3), aA = new THREE.InstancedBufferAttribute(alpha, 1);
    [aPos, aSize, aCol, aA].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iPos', aPos); g.setAttribute('iSize', aSize); g.setAttribute('iCol', aCol); g.setAttribute('iAlpha', aA);
    const m = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {uNormalShare: {value: opts.normalShare ?? 0.65}, uGain: {value: opts.gain ?? 1}, uSoft: {value: opts.soft ?? 0.2}}]),
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.InstancedMesh(g, m, count);
    mesh.frustumCulled = false;
    const commit = (n = count) => {
      for (let i = n; i < count; i++) alpha[i] = 0;
      aPos.needsUpdate = aSize.needsUpdate = aCol.needsUpdate = aA.needsUpdate = true;
    };
    return {mesh, pos, size, col, alpha, commit};
  }, [count]);
}

export const BillboardPrim: React.FC<{bb: BB; renderOrder?: number}> = ({bb, renderOrder = 5}) => <primitive object={bb.mesh} renderOrder={renderOrder} />;
