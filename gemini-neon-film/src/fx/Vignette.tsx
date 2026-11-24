import React from 'react';
import {AbsoluteFill} from 'remotion';

/** ~25 % vignette: corners darken by about a quarter, centre untouched. */
export const Vignette: React.FC<{strength?: number}> = ({strength = 0.25}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse 75% 75% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${(strength * 0.55).toFixed(3)}) 75%, rgba(0,0,0,${strength.toFixed(3)}) 100%)`,
    }}
  />
);
