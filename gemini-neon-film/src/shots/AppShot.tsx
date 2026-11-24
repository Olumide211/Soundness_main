import React from 'react';
import {AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {sec, type Push} from '../edl';

// The phone recording is 1080×2640. Crop off the status bar (top 4 %) and keep
// the upper part of the screen (picker + answer live there; the keyboard and
// input bar sit lower and are never shown).
const SRC_W = 1080;
const CROP_TOP = Math.round(2640 * 0.04); // 106 px
const CROP_H_16x9 = 1594; // visible source height in the 16:9 panel
// Where the "Deeper analysis · 4 Neon ✓" row sits in the source (px)
const NEON_ROW = {x: 450, y: 690};
// Where the streamed answer sits in the source (px)
const ANSWER = {x: 540, y: 600};

export const AppShot: React.FC<{
  inPoint: number;
  rate?: number;
  part: 'picker' | 'stream';
  push?: Push;
  duration: number;
  file: string;
}> = ({inPoint, rate = 1, part, push, duration, file}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const vertical = height > width;

  const p = push ?? (part === 'stream' ? {from: 1.0, to: 1.03, ox: 0, oy: 0} : {from: 1, to: 1, ox: 0, oy: 0});
  const zoom = interpolate(frame, [0, Math.max(1, duration - 1)], [p.from, p.to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const target = part === 'picker' ? NEON_ROW : ANSWER;

  let panelW: number;
  let panelH: number;
  let s: number;
  let offX: number;
  if (!vertical) {
    panelH = Math.round(height * 0.82);
    s = panelH / CROP_H_16x9;
    panelW = Math.round(SRC_W * s);
    offX = 0;
  } else {
    // fill the 9:16 frame, cropped slightly (4 % overscale)
    panelW = width;
    panelH = height;
    s = (width / SRC_W) * 1.04;
    offX = (width - SRC_W * s) / 2;
  }
  const origin = `${(target.x * s + offX).toFixed(1)}px ${((target.y - CROP_TOP) * s).toFixed(1)}px`;

  const video = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${zoom.toFixed(5)})`,
        transformOrigin: origin,
      }}
    >
      <OffthreadVideo
        src={staticFile(file)}
        muted
        trimBefore={sec(inPoint)}
        playbackRate={rate}
        style={{
          position: 'absolute',
          left: offX,
          top: -CROP_TOP * s,
          width: SRC_W * s,
          height: 2640 * s,
        }}
      />
    </div>
  );

  if (vertical) {
    return <AbsoluteFill style={{overflow: 'hidden', backgroundColor: 'black'}}>{video}</AbsoluteFill>;
  }

  return (
    <AbsoluteFill style={{backgroundColor: 'black', alignItems: 'center', justifyContent: 'center'}}>
      <div
        style={{
          position: 'relative',
          width: panelW,
          height: panelH,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: 'black',
          boxShadow: '0 0 110px 18px rgba(255,255,255,0.075), 0 0 36px 2px rgba(255,255,255,0.05)',
        }}
      >
        {video}
      </div>
    </AbsoluteFill>
  );
};
