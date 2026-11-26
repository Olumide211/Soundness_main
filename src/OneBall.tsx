import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/geist-mono/500.css';
import { drawFrame, sim } from './draw';
import { LAYOUTS, LayoutName } from './layout';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const Scene: React.FC<{ layout: LayoutName }> = ({ layout }) => {
  const L = LAYOUTS[layout];
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => delayRender('fonts'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([
      document.fonts.load('700 17px Inter'),
      document.fonts.load('600 17px Inter'),
      document.fonts.load('500 17px "Geist Mono"'),
    ])
      .then(() => document.fonts.ready)
      .then(() => {
        setReady(true);
        continueRender(handle);
      });
  }, [handle]);
  useLayoutEffect(() => {
    if (!ready || !ref.current) return;
    const ctx = ref.current.getContext('2d')!;
    drawFrame(ctx, frame, L);
  }, [frame, ready, L]);
  return <canvas ref={ref} width={L.width} height={L.height} style={{ position: 'absolute', inset: 0 }} />;
};

const textBase: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  textAlign: 'center',
  color: '#fff',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 700,
  whiteSpace: 'nowrap',
  textShadow: '0 0 24px rgba(120,150,255,0.35), 0 2px 10px rgba(0,0,0,0.6)',
};

export const OneBall: React.FC<{ layout: LayoutName }> = ({ layout }) => {
  const L = LAYOUTS[layout];
  const f = useCurrentFrame();

  // "1 ball." — on from frame 0, fades out ~2.6-3.0 s, fades back in for the loop (25.0-25.6 s)
  const titleOp = f < 1400 ? interpolate(f, [156, 180], [1, 0], clamp) : interpolate(f, [1500, 1536], [0, 1], clamp);
  const titleY = f < 1400 ? 0 : interpolate(f, [1500, 1536], [14, 0], clamp);
  const subOp = interpolate(f, [36, 60, 156, 180], [0, 1, 1, 0], clamp);
  const subY = interpolate(f, [36, 60], [16, 0], clamp);
  const qOp = interpolate(f, [1020, 1056, 1284, 1320], [0, 1, 1, 0], clamp);
  const qY = interpolate(f, [1020, 1056], [18, 0], clamp);
  const count = sim.counts[f] ?? 1;

  return (
    <AbsoluteFill style={{ backgroundColor: '#05050A' }}>
      <Scene layout={layout} />
      <div style={{ ...textBase, top: L.title.top + titleY, fontSize: L.title.size, letterSpacing: -2, opacity: titleOp, lineHeight: 1.1 }}>
        1 ball.
      </div>
      <div style={{ ...textBase, top: L.subtitle.top + subY, fontSize: L.subtitle.size, fontWeight: 600, opacity: subOp, color: 'rgba(255,255,255,0.88)', lineHeight: 1.2 }}>
        every bounce makes another.
      </div>
      <div style={{ ...textBase, top: L.question.top + qY, fontSize: L.question.size, opacity: qOp, letterSpacing: -1, lineHeight: 1.2 }}>
        will it fill the circle?
      </div>
      <div
        style={{
          ...textBase,
          top: L.counter.top,
          fontSize: L.counter.size,
          fontFamily: '"Geist Mono", monospace',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 1,
          lineHeight: 1.2,
          textShadow: '0 0 18px rgba(120,150,255,0.45)',
        }}
      >
        balls: {count}
      </div>
      <div
        style={{
          position: 'absolute',
          right: L.safe,
          bottom: L.safe,
          color: '#fff',
          opacity: 0.4,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          fontSize: L.watermark.size,
          lineHeight: 1,
        }}
      >
        @BreezeOg1
      </div>
      <Audio src={staticFile('audio/mix.wav')} />
    </AbsoluteFill>
  );
};
