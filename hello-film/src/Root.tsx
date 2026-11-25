import React from 'react';
import {Composition} from 'remotion';
import {Hello, HelloProps} from './Hello';
import {LOOP_FRAMES, CREDIT_FRAMES, FPS} from './lib/timeline';

const base: HelloProps = {grain: true, debug: false, vertical: false, credit: false};
export const Root: React.FC = () => (
  <>
    <Composition id="HelloSquare" component={Hello} durationInFrames={LOOP_FRAMES} fps={FPS} width={1080} height={1080} defaultProps={{...base}} />
    <Composition id="HelloVertical" component={Hello} durationInFrames={LOOP_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{...base, vertical: true}} />
    <Composition id="HelloSquareCredit" component={Hello} durationInFrames={CREDIT_FRAMES} fps={FPS} width={1080} height={1080} defaultProps={{...base, credit: true}} />
    <Composition id="HelloVerticalCredit" component={Hello} durationInFrames={CREDIT_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{...base, vertical: true, credit: true}} />
  </>
);
