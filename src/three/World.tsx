import React, { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { buildWorld } from './world';

const clock = { frame: 0 };

export const World: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const frame = useCurrentFrame();
  clock.frame = frame;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const world = useMemo(() => buildWorld(gl, scene, camera, width, height), [gl, scene, camera, width, height]);
  useFrame(() => {
    world.update(clock.frame);
    world.render();
  }, 1);
  return null;
};
