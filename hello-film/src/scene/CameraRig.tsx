import React, {useLayoutEffect} from 'react';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {cameraMatrix, shotCamera} from '../lib/camera';

export const CameraRig: React.FC<{rawFrame: number; vertical: boolean; credit: boolean}> = ({rawFrame, vertical, credit}) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const c = shotCamera(rawFrame, vertical, credit);
  const m = cameraMatrix(c);
  m.decompose(camera.position, camera.quaternion, camera.scale);
  camera.fov = c.fov;
  camera.near = 0.008;
  camera.far = 40;
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  useLayoutEffect(() => {}, [rawFrame]);
  return null;
};
