import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Push} from '../edl';
import {gateWeave, WEAVE_OVERSCALE} from '../fx/weave';

/**
 * Wraps a shot's picture: slow push-in over the shot (no zoom on the cut: it
 * starts at `from` on frame 0) plus the 1 px seeded gate weave.
 */
export const ShotFrame: React.FC<{
  globalFrom: number;
  duration: number;
  push?: Push;
  children: React.ReactNode;
}> = ({globalFrom, duration, push, children}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const vertical = height > width;
  const w = gateWeave(globalFrom + frame, fps);
  const s = push
    ? interpolate(frame, [0, Math.max(1, duration - 1)], [push.from, push.to], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  // In 9:16 the frame is already a crop centred on the subject, so pull the
  // push origin towards the centre of that crop.
  const ox = push ? (vertical ? 50 + (push.ox - 50) * 0.3 : push.ox) : 50;
  const oy = push ? push.oy : 50;
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${w.x.toFixed(3)}px, ${w.y.toFixed(3)}px) scale(${(s * WEAVE_OVERSCALE).toFixed(5)})`,
        transformOrigin: `${ox}% ${oy}%`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
