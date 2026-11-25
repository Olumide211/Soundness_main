import React, {useEffect, useState} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {loadAssets} from './lib/assets';
import {loadAllFonts} from './fonts';
import {SHOT} from './lib/shot';
import {Scene} from './scene/Scene';
import {Credit} from './overlay/Credit';

export type HelloProps = {grain: boolean; debug: boolean; vertical: boolean; credit: boolean};

export const Hello: React.FC<HelloProps> = (props) => {
  const {width, height} = useVideoConfig();
  const frame = useCurrentFrame();
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('loading hello-film-pack assets', {timeoutInMilliseconds: 180000}));
  (globalThis as any).__dbg = (props as any).__dbg;
  SHOT.vertical = props.vertical;
  SHOT.credit = props.credit;
  SHOT.grain = props.grain !== false;
  SHOT.debug = !!props.debug;
  useEffect(() => {
    Promise.all([loadAssets(), loadAllFonts()]).then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [handle]);
  return (
    <AbsoluteFill style={{backgroundColor: '#0A0604'}}>
      {ready && (
        <ThreeCanvas
          width={width}
          height={height}
          shadows
          gl={{antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, toneMappingExposure: 1, preserveDrawingBuffer: true, powerPreference: 'high-performance'}}
          camera={{fov: 35, near: 0.008, far: 40, position: [0, 1.25, 5.6]}}
        >
          <Scene rawFrame={frame} {...props} />
        </ThreeCanvas>
      )}
      {ready && props.credit && frame >= 1200 && <Credit frame={frame} vertical={props.vertical} />}
    </AbsoluteFill>
  );
};
