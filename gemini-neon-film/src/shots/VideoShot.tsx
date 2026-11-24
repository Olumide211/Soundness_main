import React from 'react';
import {OffthreadVideo, staticFile, useVideoConfig} from 'remotion';
import {sec} from '../edl';

const SRC_W = 1920;
const SRC_H = 1080;

/** A 1920×1080 clip. 16:9 → full frame. 9:16 → height-filling crop centred on `crop916`. */
export const VideoShot: React.FC<{file: string; inPoint: number; rate?: number; crop916?: number}> = ({
  file,
  inPoint,
  rate = 1,
  crop916 = 0.5,
}) => {
  const {width, height} = useVideoConfig();
  const vertical = height > width;
  let box: React.CSSProperties;
  if (!vertical) {
    box = {left: 0, top: 0, width, height};
  } else {
    const s = height / SRC_H;
    const vw = SRC_W * s;
    const left = Math.min(0, Math.max(width - vw, width / 2 - crop916 * vw));
    box = {left, top: 0, width: vw, height};
  }
  return (
    <OffthreadVideo
      src={staticFile(file)}
      muted
      trimBefore={sec(inPoint)}
      playbackRate={rate}
      style={{position: 'absolute', objectFit: 'cover', ...box}}
    />
  );
};
