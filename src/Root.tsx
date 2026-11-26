import React from 'react';
import { Composition } from 'remotion';
import { OneBall } from './OneBall';

export const FPS = 60;
export const DURATION = 1560;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="OneBall9x16"
      component={OneBall}
      durationInFrames={DURATION}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ layout: '9x16' as const }}
    />
    <Composition
      id="OneBall1x1"
      component={OneBall}
      durationInFrames={DURATION}
      fps={FPS}
      width={1080}
      height={1080}
      defaultProps={{ layout: '1x1' as const }}
    />
  </>
);
