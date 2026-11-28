import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { NSEG, OBJ, OUTRO, CREDIT, segStart } from './three/state';

const SAFE = 72;
const font = "'Inter', sans-serif";

const Pill: React.FC<{ children: React.ReactNode; opacity: number; scale?: number; pad?: string }> = ({ children, opacity, scale = 1, pad = '18px 34px' }) => (
  <div
    style={{
      opacity, transform: `scale(${scale})`, padding: pad, borderRadius: 999,
      background: 'rgba(12,12,14,0.42)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
      display: 'inline-flex', alignItems: 'center', gap: 18,
    }}
  >
    {children}
  </div>
);

export const Overlay: React.FC<{ modelLabel: string }> = ({ modelLabel }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const tall = height > 1600;

  // intro title (visible from frame 0)
  const introO = interpolate(frame, [44, 56], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const introS = interpolate(frame, [0, 30], [1.04, 1], { extrapolateRight: 'clamp' });

  // segment label
  let label: React.ReactNode = null;
  for (let i = 0; i < NSEG; i++) {
    const t = frame - segStart(i);
    if (t < -2 || t > 106) continue;
    const o = interpolate(t, [0, 8, 97, 103], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const y = interpolate(t, [0, 10], [-14, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    label = (
      <div style={{ position: 'absolute', top: SAFE + (tall ? 40 : 8), left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `translateY(${y}px)` }}>
        <Pill opacity={o}>
          <span style={{ fontFamily: font, fontWeight: 600, fontSize: 46, color: 'rgba(255,255,255,0.62)', letterSpacing: 1 }}>{i + 1}/8</span>
          <span style={{ fontFamily: font, fontWeight: 700, fontSize: 58, color: '#fff', letterSpacing: 3 }}>{OBJ[i].name}</span>
        </Pill>
      </div>
    );
  }

  // outro
  const ot = frame - OUTRO;
  const winS = spring({ frame: ot, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
  const winO = interpolate(ot, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * interpolate(frame, [CREDIT, CREDIT + 8], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ct = frame - CREDIT;
  const credO = interpolate(ct, [4, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dim = interpolate(ct, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {frame < 58 && (
        <div style={{ position: 'absolute', top: SAFE + (tall ? 70 : 20), left: SAFE, right: SAFE, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: introO, transform: `scale(${introS})` }}>
          <Pill opacity={1} pad="26px 46px">
            <span style={{ fontFamily: font, fontWeight: 700, fontSize: tall ? 84 : 72, color: '#fff', letterSpacing: -1, whiteSpace: 'nowrap' }}>hot orb vs 8 things</span>
          </Pill>
          <div style={{ height: 22 }} />
          <Pill opacity={1} pad="12px 30px">
            <span style={{ fontFamily: font, fontWeight: 500, fontSize: 44, color: 'rgba(255,255,255,0.82)' }}>model: {modelLabel}</span>
          </Pill>
        </div>
      )}
      {label}
      {ot >= 0 && (
        <AbsoluteFill style={{ background: `rgba(6,6,8,${0.28 * dim})`, backdropFilter: dim > 0 ? `blur(${10 * dim}px)` : undefined }} />
      )}
      {ot >= 0 && frame < CREDIT + 10 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: winO }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${tall ? -150 : -90}px) scale(${0.86 + 0.14 * winS})` }}>
            <div style={{ padding: '10px 50px 18px', borderRadius: 40, background: 'rgba(12,12,14,0.38)', backdropFilter: 'blur(14px)' }}>
              <div style={{ fontFamily: font, fontWeight: 700, fontSize: 120, color: '#fff', letterSpacing: -3, lineHeight: 1.15, textShadow: '0 6px 40px rgba(0,0,0,0.45)' }}>Steel wins.</div>
            </div>
            <div style={{ height: 18 }} />
            <div style={{ padding: '8px 28px', borderRadius: 999, background: 'rgba(12,12,14,0.38)', backdropFilter: 'blur(14px)' }}>
              <div style={{ fontFamily: font, fontWeight: 600, fontSize: 44, color: '#fff', opacity: 0.7, letterSpacing: 1 }}>{modelLabel}</div>
            </div>
          </div>
        </AbsoluteFill>
      )}
      {ct >= 0 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: credO }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '26px 44px', borderRadius: 28, background: 'rgba(12,12,14,0.42)', backdropFilter: 'blur(14px)', transform: `translateY(${tall ? -150 : -90}px)` }}>
            <div style={{ width: 64, height: 2, background: 'rgba(255,255,255,0.5)' }} />
            <div style={{ fontFamily: font, fontWeight: 600, fontSize: 36, color: '#fff', letterSpacing: 2 }}>Breeze × {modelLabel}</div>
            <div style={{ width: 64, height: 2, background: 'rgba(255,255,255,0.5)' }} />
          </div>
        </AbsoluteFill>
      )}
      <div style={{ position: 'absolute', right: SAFE, bottom: SAFE, fontFamily: font, fontWeight: 600, fontSize: 30, color: '#fff', opacity: 0.5 }}>@BreezeOg1</div>
    </AbsoluteFill>
  );
};
