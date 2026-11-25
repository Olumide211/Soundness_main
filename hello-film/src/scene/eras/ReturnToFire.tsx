import React, {useMemo} from 'react';
import * as THREE from 'three';
import {FIRE_POS} from '../layout';
import {flicker} from '../../lib/noise';
import flameFrag from '../../fx/shaders/flame.glsl';
import {fireWeight} from '../Lights';

const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/**
 * §7.6 offscreen fire: the light is the PointLight in Lights.tsx. This 3-quad additive billboard flame only
 * exists in case a (vertical) frame ever shows the floor near the light; it sits at the fire key position.
 * The orb hand-over (1060-1120) and the ragged screen reveal live in Smartphone.tsx / returnTiming.ts.
 */
export const ReturnToFire: React.FC<{frame: number; rawFrame: number; credit: boolean}> = ({frame: f, rawFrame, credit}) => {
  const mats = useMemo(() => [0, 1, 2].map((k) => new THREE.ShaderMaterial({vertexShader: vert, fragmentShader: flameFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: {uTime: {value: 0}, uFlick: {value: 1}, uSeed: {value: k * 3.7}}})), []);
  const w = fireWeight(rawFrame, credit);
  mats.forEach((m) => { m.uniforms.uTime.value = (rawFrame % 1200) / 30; m.uniforms.uFlick.value = flicker(f) * w; });
  if (w < 0.01) return null;
  return (
    <group position={[FIRE_POS.x, FIRE_POS.y - 0.12, FIRE_POS.z]}>
      {mats.map((m, k) => (
        <mesh key={k} material={m} rotation={[0, (k * Math.PI) / 3, 0]} position={[0, 0.09, 0]}><planeGeometry args={[0.16, 0.24]} /></mesh>
      ))}
    </group>
  );
};
