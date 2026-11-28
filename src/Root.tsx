const MODEL_LABEL = "Opus 5.5 HIGH";
import React from 'react';
import { Composition, staticFile } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { OrbVideo } from './Video';
import { TOTAL, FPS } from './three/state';

loadFont({ family: 'Inter', url: staticFile('fonts/Inter-Bold.otf'), weight: '700' });
loadFont({ family: 'Inter', url: staticFile('fonts/Inter-SemiBold.otf'), weight: '600' });
loadFont({ family: 'Inter', url: staticFile('fonts/Inter-Medium.otf'), weight: '500' });

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="OrbTest9x16" component={OrbVideo} width={1080} height={1920} fps={FPS} durationInFrames={TOTAL} defaultProps={{ modelLabel: MODEL_LABEL }} />
    <Composition id="OrbTest4x5" component={OrbVideo} width={1080} height={1350} fps={FPS} durationInFrames={TOTAL} defaultProps={{ modelLabel: MODEL_LABEL }} />
  </>
);
