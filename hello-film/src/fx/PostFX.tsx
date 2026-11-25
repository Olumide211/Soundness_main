import React, {useEffect, useMemo} from 'react';
import * as THREE from 'three';
import {useFrame, useThree} from '@react-three/fiber';
import {EffectComposer, RenderPass, EffectPass, BloomEffect, DepthOfFieldEffect, Effect, EffectAttribute} from 'postprocessing';
import grainFrag from './shaders/grainCA.glsl';

class GradeEffect extends Effect {
  constructor() {
    super('GrainCAVignette', grainFrag, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ['uFrame', new THREE.Uniform(0)], ['uGrain', new THREE.Uniform(1)], ['uExposure', new THREE.Uniform(1)],
        ['uScreenMix', new THREE.Uniform(0)], ['uCA', new THREE.Uniform(1.2)], ['uVignette', new THREE.Uniform(0.28)], ['uRes', new THREE.Uniform(new THREE.Vector2(1080, 1080))],
      ]),
    });
  }
}

export type FxState = {frame: number; grain: boolean; exposure: number; screenMix: number; focus: number; bokeh: number; focusRange: number};

export const PostFX: React.FC<{s: FxState}> = ({s}) => {
  const {gl, scene, camera, size} = useThree();
  const P = useMemo(() => {
    const composer = new EffectComposer(gl, {multisampling: 4, frameBufferType: THREE.HalfFloatType});
    const rp = new RenderPass(scene, camera);
    const dof = new DepthOfFieldEffect(camera, {worldFocusDistance: 2.6, worldFocusRange: 1.0, bokehScale: 2, resolutionScale: 0.5});
    const bloom = new BloomEffect({luminanceThreshold: 0.8, intensity: 0.6, mipmapBlur: true, radius: 0.7, luminanceSmoothing: 0.08});
    const grade = new GradeEffect();
    composer.addPass(rp);
    const dofPass = new EffectPass(camera, dof);
    composer.addPass(dofPass);
    composer.addPass(new EffectPass(camera, bloom));
    composer.addPass(new EffectPass(camera, grade));
    return {composer, dof, dofPass, bloom, grade};
  }, [gl, scene, camera]);
  useEffect(() => { P.composer.setSize(size.width, size.height); }, [P, size]);
  useEffect(() => () => P.composer.dispose(), [P]);
  // per-frame params
  P.dof.cocMaterial.worldFocusDistance = s.focus;
  P.dof.cocMaterial.worldFocusRange = s.focusRange;
  P.dof.bokehScale = s.bokeh;
  P.dofPass.enabled = s.bokeh > 0.05;
  const u = P.grade.uniforms;
  u.get('uFrame')!.value = s.frame % 1200;
  u.get('uGrain')!.value = s.grain ? 1 : 0;
  u.get('uExposure')!.value = s.exposure;
  u.get('uScreenMix')!.value = s.screenMix;
  (u.get('uRes')!.value as THREE.Vector2).set(size.width, size.height);
  useFrame(() => { P.composer.render(); }, 1);
  return null;
};
