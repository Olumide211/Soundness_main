import React from 'react';
import {AbsoluteFill} from 'remotion';

// ── Look ─────────────────────────────────────────────────────────────────────
// B&W (or 15 % saturation for S22) → crushed blacks (lift 0) → gentle S-curve
// → slightly hot highlights → ~8 % sepia warmth. One SVG filter, sRGB space.
const BLACK_CRUSH = 0.035; // everything below this goes to pure black
const S_AMOUNT = 0.28; // 0 = linear, 1 = full smoothstep
const HOT_KNEE = 0.72; // highlights above this get a little extra gain
const HOT_GAIN = 0.14;
const SEPIA = 0.08;

const curve = (x: number) => {
  let y = Math.max(0, (x - BLACK_CRUSH) / (1 - BLACK_CRUSH));
  const s = y * y * (3 - 2 * y);
  y = y + S_AMOUNT * (s - y);
  if (y > HOT_KNEE) y += (y - HOT_KNEE) * HOT_GAIN;
  return Math.min(1, Math.max(0, y));
};

const TABLE = Array.from({length: 65}, (_, i) => curve(i / 64).toFixed(4)).join(' ');

// 8 % blend between identity and the classic sepia matrix
const sepiaMatrix = (() => {
  const sep = [
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131],
  ];
  const rows: string[] = [];
  for (let r = 0; r < 3; r++) {
    const row = [0, 1, 2].map((c) => ((r === c ? 1 : 0) * (1 - SEPIA) + sep[r][c] * SEPIA).toFixed(4));
    rows.push(`${row.join(' ')} 0 0`);
  }
  rows.push('0 0 0 1 0');
  return rows.join('  ');
})();

export const gradeFilterId = (saturation: number) => `neon-grade-${Math.round(saturation * 100)}`;

/** Put once per composition: the SVG filter definitions used by <Grade>. */
export const GradeDefs: React.FC<{saturations: number[]}> = ({saturations}) => (
  <svg width={0} height={0} style={{position: 'absolute'}} aria-hidden>
    <defs>
      {[...new Set(saturations)].map((s) => (
        <filter key={s} id={gradeFilterId(s)} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="saturate" values={String(s)} />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={TABLE} />
            <feFuncG type="table" tableValues={TABLE} />
            <feFuncB type="table" tableValues={TABLE} />
          </feComponentTransfer>
          <feColorMatrix type="matrix" values={sepiaMatrix} />
        </filter>
      ))}
    </defs>
  </svg>
);

/** The shared grade. Wrap every shot's picture in it (not the end-card spark). */
export const Grade: React.FC<{saturation?: number; children: React.ReactNode}> = ({saturation = 0, children}) => (
  <AbsoluteFill style={{filter: `url(#${gradeFilterId(saturation)})`, backgroundColor: 'black'}}>{children}</AbsoluteFill>
);
