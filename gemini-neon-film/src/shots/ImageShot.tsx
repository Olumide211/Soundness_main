import React from 'react';
import {Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Still-image stand-ins for the AI shots.
 *  - S07 (NeTube, square, on black): fitted so the whole "Ne" shows, darkened.
 *  - S22 (discharge tube, 3:2): cover-fill, with the flicker-on.
 */
export const ImageShot: React.FC<{
  file: string;
  fit: 'contain-square' | 'cover';
  brightness?: number;
  /** frame (local to the shot) at which the flicker-on begins */
  flickerFrame?: number;
  srcAspect: number;
}> = ({file, fit, brightness = 1, flickerFrame, srcAspect}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const vertical = height > width;

  let w: number;
  let h: number;
  if (fit === 'contain-square') {
    // square image with a black background: no visible edges on black
    const side = vertical ? width * 1.06 : height;
    w = side;
    h = side;
  } else {
    const frameAspect = width / height;
    if (srcAspect > frameAspect) {
      h = height;
      w = height * srcAspect;
    } else {
      w = width;
      h = width / srcAspect;
    }
  }

  let level = brightness;
  if (flickerFrame !== undefined) level = flicker(frame - flickerFrame);

  return (
    <Img
      src={staticFile(file)}
      style={{
        position: 'absolute',
        width: w,
        height: h,
        left: (width - w) / 2,
        top: (height - h) / 2,
        filter: `brightness(${level.toFixed(3)})`,
      }}
    />
  );
};

/** Dark tube → 3 quick brightness pulses → holds bright. f = frames since flicker start. */
export const flicker = (f: number) => {
  if (f < 0) return 0.06;
  //            pulse 1     off   pulse 2  off      pulse 3   dip  → hold
  const seq = [0.85, 0.75, 0.1, 0.08, 0.6, 0.12, 0.08, 1.0, 0.95, 0.3];
  if (f < seq.length) return seq[f];
  return 1.0;
};
