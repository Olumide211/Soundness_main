import React from 'react';
import {easeOutCubic, remap, lerp} from '../lib/ease';
import {T} from '../lib/timeline';

/** 2D credit tail (credit versions only, frames 1200-1274) */
export const Credit: React.FC<{frame: number; vertical: boolean}> = ({frame, vertical}) => {
  const rule = easeOutCubic(remap(frame, T.ruleStart, T.ruleEnd));
  const t = easeOutCubic(remap(frame, T.textStart, T.textEnd));
  const fontSize = vertical ? 32 : 26;
  const ls = lerp(0.32, 0.28, t);
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%, 0)'}}>
        <div style={{position: 'absolute', left: '50%', top: -22 - fontSize * 0.8, width: 120 * rule, height: 1, marginLeft: -60 * rule, background: 'rgba(244,237,228,0.7)'}} />
      </div>
      <div
        style={{
          position: 'absolute', left: 0, width: '100%', top: '52%', textAlign: 'center',
          transform: `translateY(${lerp(8, 0, t) - fontSize * 0.8}px)`,
          fontFamily: 'Geist', fontWeight: 500, fontSize, letterSpacing: `${ls}em`, paddingLeft: `${ls}em`,
          color: `rgba(244,237,228,${0.92 * t})`, lineHeight: 1, whiteSpace: 'nowrap',
        }}
      >
        Edited by BreezeOg
      </div>
    </div>
  );
};
