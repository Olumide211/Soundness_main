import React from 'react';
import {Composition} from 'remotion';
import {FPS, TOTAL_FRAMES} from './edl';
import {Film} from './Film';

export const Root: React.FC = () => (
  <>
    <Composition id="GeminiNeon16x9" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="GeminiNeon9x16" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} />
  </>
);
