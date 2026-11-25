import React from 'react';
import {easeOutCubic, easeInOutCubic, remap, lerp} from '../lib/ease';
import {T} from '../lib/timeline';

/** end card (credit versions only, frames 1200-1274): centred, Inter Medium, +2% tracking, soft in/out, over the warm cave */
export const CREDIT_TEXT = 'Breeze \u00D7 Opus 5.6';
export const Credit: React.FC<{frame: number; vertical: boolean}> = ({frame, vertical}) => {
  const tin = easeOutCubic(remap(frame, T.textStart, T.textEnd));
  const tout = 1 - easeInOutCubic(remap(frame, 1256, 1272));
  const a = tin * tout;
  const fontSize = vertical ? 64 : 54;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none'}}>
      {/* soft warm-dark pool behind the type for legibility (keeps the cave visible) */}
      <div style={{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: 0.55 * a,
        background: 'radial-gradient(ellipse 48% 22% at 50% 50%, rgba(20,9,4,0.85) 0%, rgba(20,9,4,0.35) 55%, rgba(20,9,4,0) 100%)'}} />
      <div
        style={{
          position: 'absolute', left: 0, width: '100%', top: '50%', textAlign: 'center',
          transform: `translateY(${lerp(10, 0, tin) - fontSize * 0.55}px)`,
          fontFamily: 'Inter', fontWeight: 500, fontSize, letterSpacing: '0.02em', paddingLeft: '0.02em',
          color: `rgba(247,238,226,${a})`, lineHeight: 1.1, whiteSpace: 'nowrap',
          textShadow: `0 0 24px rgba(255,170,90,${0.25 * a}), 0 2px 10px rgba(0,0,0,${0.4 * a})`,
        }}
      >
        {CREDIT_TEXT}
      </div>
    </div>
  );
};
