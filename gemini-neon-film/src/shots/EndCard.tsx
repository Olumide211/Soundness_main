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
 * End card. OUTSIDE the grade: the spark is shown untouched, in its original
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
  const footAt = tagAt + Math.round(0.25 * 30);

  const sparkVisible = H * 0.14;
  const sparkBox = sparkVisible / SPARK_FILL;
  const sparkCenterY = H * (vertical ? 0.4 : 0.39);
  const titleSize = H * 0.045;
  const tagSize = H * 0.022;
  const footSize = H * 0.016;

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
      <div style={{...text, top: titleTop, fontSize: titleSize, color: '#ffffff', letterSpacing: '0.005em', opacity: fade(frame, titleAt, RISE)}}>
        Gemini 4 Neon
      </div>
      <div style={{...text, top: tagTop, fontSize: tagSize, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.02em', opacity: fade(frame, tagAt, RISE)}}>
        give it a charge.
      </div>
      <div
        style={{
          ...text,
          // 9:16: keep the disclaimer above the TikTok caption/UI area
          bottom: vertical ? H * 0.2 : H * 0.05,
          left: vertical ? width * 0.08 : 0,
          right: vertical ? width * 0.08 : 0,
          fontSize: footSize,
          lineHeight: 1.45,
          color: 'rgba(255,255,255,0.45)',
          letterSpacing: '0.02em',
          opacity: fade(frame, footAt, RISE),
        }}
      >
        {vertical ? (
          <>
            concept film · not affiliated with or endorsed by google ·<br />
            edited by BreezeOg
          </>
        ) : (
          'concept film · not affiliated with or endorsed by google · edited by BreezeOg'
        )}
      </div>
    </AbsoluteFill>
  );
};
