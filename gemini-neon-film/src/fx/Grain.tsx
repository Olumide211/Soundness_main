import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {mulberry32} from './rng';

// Animated 35 mm grain. A new seed every frame (seed = frame), so it is never
// static, but identical on every render. Drawn at 2/3 resolution and scaled up
// with smoothing for a slightly soft, filmic clump. Blended with `overlay`, so
// pure black stays pure black (lift 0). Overlay at 0.2 opacity of uniform noise
// ≈ 6 % deviation in the midtones.
const SCALE = 2 / 3;

export const Grain: React.FC<{opacity?: number; seed?: number}> = ({opacity = 0.2, seed = 7}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.round(width * SCALE);
  const h = Math.round(height * SCALE);

  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    const rand = mulberry32(seed * 100003 + frame * 7919 + 1);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // average of two uniforms → softer, triangle-shaped distribution
      const v = ((rand() + rand()) * 127.5) | 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [frame, w, h, seed]);

  return (
    <AbsoluteFill style={{mixBlendMode: 'overlay', opacity, pointerEvents: 'none'}}>
      <canvas ref={ref} width={w} height={h} style={{width: '100%', height: '100%'}} />
    </AbsoluteFill>
  );
};
