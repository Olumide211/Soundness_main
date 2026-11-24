import React from 'react';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {FONT_FAMILY, FONT_WEIGHT} from '../fonts';

export type SubChunk = {text: string; from: number; duration: number};

/** Tiny lowercase captions. Hard on/off, no box, soft 1 px shadow. */
export const Subtitles: React.FC<{chunks: SubChunk[]}> = ({chunks}) => {
  const {width, height} = useVideoConfig();
  const vertical = height > width;
  const fontSize = vertical ? 30 : 24;
  return (
    <>
      {chunks.map((c, i) => (
        <Sequence key={i} from={c.from} durationInFrames={c.duration} layout="none">
          <AbsoluteFill style={{pointerEvents: 'none'}}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                // 16:9: bottom centre (baseline ~94 %). 9:16: 78 % of frame height.
                top: vertical ? height * 0.78 - fontSize / 2 : undefined,
                bottom: vertical ? undefined : Math.round(height * 0.06),
                textAlign: 'center',
                fontFamily: FONT_FAMILY,
                fontWeight: FONT_WEIGHT,
                fontSize,
                lineHeight: 1,
                letterSpacing: '0.02em',
                color: 'rgba(255,255,255,0.9)',
                textShadow: '0 1px 1px rgba(0,0,0,0.75), 0 0 4px rgba(0,0,0,0.55), 0 0 14px rgba(0,0,0,0.5), 0 0 28px rgba(0,0,0,0.45)',
                textTransform: 'lowercase',
                whiteSpace: 'nowrap',
              }}
            >
              {c.text}
            </div>
          </AbsoluteFill>
        </Sequence>
      ))}
    </>
  );
};
