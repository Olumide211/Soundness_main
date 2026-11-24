import {continueRender, delayRender, staticFile} from 'remotion';

// Geist Medium, bundled locally (public/fonts, copied by scripts/prep.mjs).
// Rendering waits for it via delayRender. Falls back to Inter Medium / system sans.
export const FONT_FAMILY = "'Geist', 'Inter', system-ui, sans-serif";
export const FONT_WEIGHT = 500;

let started = false;
export const ensureFonts = () => {
  if (started || typeof window === 'undefined' || !('FontFace' in window)) return;
  started = true;
  const handle = delayRender('Loading Geist Medium');
  const face = new FontFace('Geist', `url('${staticFile('fonts/Geist-Medium.woff2')}') format('woff2')`, {
    weight: '500',
    style: 'normal',
  });
  face
    .load()
    .then(() => {
      document.fonts.add(face);
      return document.fonts.ready;
    })
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error('Geist failed to load, falling back', err);
      continueRender(handle);
    });
};
ensureFonts();
