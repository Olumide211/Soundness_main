// Layout + camera maths shared by the composition and the verification script.
export type LayoutName = '9x16' | '1x1';

export interface Layout {
  width: number;
  height: number;
  sceneScale: number; // sim px -> screen px
  cx: number; // screen position of the ring centre
  cy: number;
  safe: number;
  title: { top: number; size: number };
  subtitle: { top: number; size: number };
  question: { top: number; size: number };
  counter: { top: number; size: number };
  watermark: { size: number };
}

export const LAYOUTS: Record<LayoutName, Layout> = {
  '9x16': {
    width: 1080,
    height: 1920,
    sceneScale: 1,
    cx: 540,
    cy: 880,
    safe: 90,
    title: { top: 130, size: 120 },
    subtitle: { top: 290, size: 50 },
    question: { top: 220, size: 66 },
    counter: { top: 1440, size: 58 },
    watermark: { size: 30 },
  },
  '1x1': {
    width: 1080,
    height: 1080,
    sceneScale: 0.66,
    cx: 540,
    cy: 562,
    safe: 90,
    title: { top: 90, size: 70 },
    subtitle: { top: 176, size: 34 },
    question: { top: 120, size: 50 },
    counter: { top: 908, size: 42 },
    watermark: { size: 24 },
  },
};

export const SIM_CX = 540;
export const SIM_CY = 880;
export const BURST_FRAME = 1380;
export const FULL_FRAME = 1350;
export const LAST_FRAME = 1559;

export const smoother = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

// camera push-in 1.0 -> 1.08 across the build, easing back to exactly 1.0 for the loop
export function cameraZoom(f: number): number {
  if (f <= BURST_FRAME) return 1 + 0.08 * smoother(f / BURST_FRAME) * 0.6 + 0.08 * 0.4 * (f / BURST_FRAME);
  return 1 + 0.08 * (1 - smoother((f - BURST_FRAME) / 130));
}

/** sim coordinates -> screen pixel (without shake) */
export function toScreen(L: Layout, f: number, x: number, y: number, shake: [number, number] = [0, 0]) {
  const z = cameraZoom(f) * L.sceneScale;
  return { x: L.cx + shake[0] + (x - SIM_CX) * z, y: L.cy + shake[1] + (y - SIM_CY) * z, z };
}
