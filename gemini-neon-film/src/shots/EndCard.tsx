import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SPARK, sec} from '../edl';
import {FONT_FAMILY, FONT_WEIGHT} from '../fonts';

// Spark PNG is 2048 px with an 85 px transparent margin → visible mark = 91.7 %.
const SPARK_FILL = (2048 - 2 * 85) / 2048;
const RISE = 6; // frames

const fade = (frame: number, at: number, len: number) =>
  interpolate(frame, [at, at + len], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

/**
 * End card (no disclaimer line). OUTSIDE the grade: the spark is shown untouched, in its original
 * colours (plain opacity fade only). Text is plain Geist Medium, not a logo.
 */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const vertical = height > width;
  const H = height;

  const sparkIn = sec(0.4);
  const sparkLen = sec(0.5);
  const titleAt = sparkIn + sparkLen; // 0.9 s
  const tagAt = titleAt + Math.round(0.25 * 30); // +0.25 s

  const sparkVisible = H * 0.14;
  const sparkBox = sparkVisible / SPARK_FILL;
  const sparkCenterY = H * (vertical ? 0.4 : 0.39);
  // 4.5 % of frame height; in 9:16 the line would overflow 1080 px, so it is
  // capped to fit ~88 % of the width on one line.
  const titleSize = vertical ? Math.min(H * 0.045, width * 0.062) : H * 0.045;
  const tagSize = H * 0.022;

  const titleTop = sparkCenterY + sparkVisible / 2 + H * 0.045;
  const tagTop = titleTop + titleSize * 1.1 + H * 0.016;

  const text: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontWeight: FONT_WEIGHT,
    lineHeight: 1.1,
  };

  return (
    <AbsoluteFill style={{backgroundColor: 'black'}}>
      <Img
        src={staticFile(SPARK)}
        style={{
          position: 'absolute',
          width: sparkBox,
          height: sparkBox,
          left: (width - sparkBox) / 2,
          top: sparkCenterY - sparkBox / 2,
          opacity: fade(frame, sparkIn, sparkLen),
        }}
      />
      <div style={{...text, top: titleTop, fontSize: titleSize, color: '#ffffff', letterSpacing: '0.005em', whiteSpace: 'nowrap', opacity: fade(frame, titleAt, RISE)}}>
        BreezeOg × Gemini 4 Neon
      </div>
      <div style={{...text, top: tagTop, fontSize: tagSize, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.02em', opacity: fade(frame, tagAt, RISE)}}>
        give it a charge.
      </div>
    </AbsoluteFill>
  );
};
