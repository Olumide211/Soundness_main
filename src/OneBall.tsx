import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/geist-mono/500.css';
import { drawFrame, sim } from './draw';
import { LAYOUTS, LayoutName } from './layout';

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

  const count = sim.counts[f] ?? 1;

  return (
    <AbsoluteFill style={{ backgroundColor: '#05050A' }}>
      <Scene layout={layout} />
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
      <Audio src={staticFile('audio/mix.wav')} />
    </AbsoluteFill>
  );
};
