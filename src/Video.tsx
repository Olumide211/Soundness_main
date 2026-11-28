import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { World } from './three/World';
import { Overlay } from './Overlay';

export const OrbVideo: React.FC<{ modelLabel: string }> = ({ modelLabel }) => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0c' }}>
      <ThreeCanvas
        width={width}
        height={height}
        dpr={1}
        flat
        shadows
        gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 40, near: 1, far: 1200, position: [0, 20, 60] }}
      >
        <World width={width} height={height} />
      </ThreeCanvas>
      <Overlay modelLabel={modelLabel} />
    </AbsoluteFill>
  );
};
