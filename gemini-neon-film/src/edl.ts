// ─────────────────────────────────────────────────────────────────────────────
// GEMINI 4 NEON · edit decision list
// Every cut, in-point and subtitle lives here. All times are in SECONDS.
//
//   start / end : where the shot sits on the timeline (end of one = start of next)
//   in          : where to start reading inside the source clip
//   rate        : playback speed (1 = normal)
//   sub         : subtitle chunk; "a / b" splits the shot in two halves
//   crop916     : 9:16 crop centre as a fraction of the source width (0 = left, 1 = right)
//   push        : slow push-in inside the shot (scale from → to, origin in %)
//   blackBefore : frames of pure black taken from the END of the previous shot
//
// To nudge a cut to the music: change the `end` of one shot AND the `start` of
// the next by the same amount (1 frame = 1/30 s ≈ 0.0333). Then re-render.
// ─────────────────────────────────────────────────────────────────────────────

export const FPS = 30;
export const DURATION = 28.6; // seconds → 858 frames

const PACK = 'gemini-neon-pack';
export const clip = (name: string) => `${PACK}/clips/${name}.mp4`;
export const image = (name: string) => `${PACK}/images/${name}`;
export const ai = (name: string) => `${PACK}/ai/${name}.mp4`;
export const SCREEN = `${PACK}/screen/gemini-app-cfr30.mp4`; // CFR copy of screen/gemini-app.mp4 (scripts/prep.mjs)
export const SPARK = `${PACK}/brand/gemini_spark_2048.png`;

export type Push = {from: number; to: number; ox: number; oy: number};

export type Shot = {
  id: string;
  kind: 'video' | 'image' | 'app' | 'end';
  file: string;
  in: number;
  start: number;
  end: number;
  rate?: number;
  sub?: string;
  crop916?: number;
  push?: Push;
  blackBefore?: number;
  /** S22 only: neon keeps a hint of colour */
  saturation?: number;
  /** S07 / S22 image stand-ins */
  brightness?: number;
  /** S22: flicker-on time on the timeline (seconds) */
  flickerAt?: number;
  /** App recording part: "picker" or "stream" */
  app?: 'picker' | 'stream';
  /** what the AI shot is used for if present (filled in by edl resolution) */
  aiFile?: string;
};

export const SHOTS: Shot[] = [
  {id: 'S01', kind: 'video', file: clip('S01_eye_A'),             in: 0.0, start: 0.0,  end: 1.0,  sub: 'every element',              crop916: 0.42, push: {from: 1.0, to: 1.03, ox: 44, oy: 48}},
  {id: 'S02', kind: 'video', file: clip('S02_ink_A'),             in: 0.5, start: 1.0,  end: 2.0,  sub: 'has a nature.',              crop916: 0.68, push: {from: 1.0, to: 1.03, ox: 62, oy: 40}},
  {id: 'S03', kind: 'video', file: clip('S03_deep-jellyfish_A'),  in: 0.0, start: 2.0,  end: 2.8,  sub: 'carbon goes deep.',          crop916: 0.40, push: {from: 1.0, to: 1.025, ox: 40, oy: 55}},
  {id: 'S04', kind: 'video', file: clip('S04_embers_A'),          in: 0.0, start: 2.8,  end: 3.5,                                     crop916: 0.50, push: {from: 1.0, to: 1.02, ox: 55, oy: 52}},
  {id: 'S05', kind: 'video', file: clip('S05_lightning_A'),       in: 0.4, start: 3.5,  end: 4.2,  sub: 'hydrogen moves fast.',       crop916: 0.40, push: {from: 1.0, to: 1.02, ox: 40, oy: 35}},
  {id: 'S06', kind: 'video', file: clip('S06_insect-damselfly_A'),in: 0.0, start: 4.2,  end: 5.0,                                     crop916: 0.50, push: {from: 1.0, to: 1.025, ox: 46, oy: 50}},
  {id: 'S07', kind: 'image', file: image('NeTube.jpg'),           in: 0.0, start: 5.0,  end: 6.6,  sub: 'and neon?',                  push: {from: 1.0, to: 1.04, ox: 50, oy: 50}, brightness: 0.15, blackBefore: 2, aiFile: ai('S07')},
  {id: 'S08', kind: 'video', file: clip('S08_smoke_A'),           in: 0.0, start: 6.6,  end: 7.4,  sub: 'neon waits.',                crop916: 0.32, push: {from: 1.0, to: 1.03, ox: 35, oy: 45}},
  {id: 'S09', kind: 'video', file: clip('S09_match-strike_A'),    in: 1.0, start: 7.4,  end: 8.4,  sub: 'until you give it a charge.', crop916: 0.45, push: {from: 1.0, to: 1.03, ox: 47, oy: 60}},
  {id: 'S10', kind: 'video', file: clip('S10_plasma_A'),          in: 0.0, start: 8.4,  end: 9.2,                                     crop916: 0.50, push: {from: 1.0, to: 1.025, ox: 50, oy: 46}},
  {id: 'S11', kind: 'video', file: clip('S11_filament-ignite_A'), in: 1.2, start: 9.2,  end: 10.8, sub: 'then it lights the room.',   crop916: 0.50, push: {from: 1.0, to: 1.04, ox: 52, oy: 54}},
  {id: 'S12', kind: 'video', file: clip('S12_code_A'),            in: 0.0, start: 10.8, end: 11.4, sub: 'code.',                      crop916: 0.58, push: {from: 1.0, to: 1.02, ox: 60, oy: 50}},
  {id: 'S13', kind: 'video', file: clip('S13_pages_A'),           in: 0.0, start: 11.4, end: 12.0, sub: 'research.',                  crop916: 0.50, push: {from: 1.0, to: 1.02, ox: 48, oy: 52}},
  {id: 'S14', kind: 'video', file: clip('S14_sun-flare_A'),       in: 0.0, start: 12.0, end: 12.6, sub: 'science.',                   crop916: 0.50, push: {from: 1.0, to: 1.02, ox: 50, oy: 48}},
  {id: 'S15', kind: 'video', file: clip('S15_crowd-slowmo_A'),    in: 0.0, start: 12.6, end: 14.4, sub: 'a million tokens. / one thought.',            crop916: 0.55, push: {from: 1.0, to: 1.04, ox: 56, oy: 45}},
  {id: 'S16', kind: 'video', file: clip('S16_murmuration_A'),     in: 0.0, start: 14.4, end: 16.2, sub: 'change course mid-task. / it turns with you.', crop916: 0.45, push: {from: 1.0, to: 1.035, ox: 44, oy: 40}},
  {id: 'S17', kind: 'video', file: clip('S17_water-drop_A'),      in: 0.3, start: 16.2, end: 17.2, sub: 'less making it up.',         crop916: 0.50, push: {from: 1.0, to: 1.03, ox: 50, oy: 52}},
  {id: 'S18', kind: 'video', file: clip('S18_typing_A'),          in: 0.0, start: 17.2, end: 18.4, sub: 'more getting it done.',      crop916: 0.42, push: {from: 1.0, to: 1.03, ox: 42, oy: 55}},
  {id: 'S19', kind: 'video', file: clip('S19_servers_A'),         in: 0.0, start: 18.4, end: 19.6, sub: 'depth used to cost time.',   crop916: 0.50, push: {from: 1.0, to: 1.03, ox: 53, oy: 50}},
  {id: 'S20', kind: 'video', file: clip('S20_light-tunnel_A'),    in: 0.0, start: 19.6, end: 20.6, sub: 'not anymore.',               crop916: 0.45, push: {from: 1.0, to: 1.04, ox: 45, oy: 45}},
  {id: 'S21', kind: 'video', file: clip('S21_fire-sparks_A'),     in: 0.0, start: 20.6, end: 21.4,                                    crop916: 0.38, push: {from: 1.0, to: 1.025, ox: 38, oy: 50}},
  {id: 'S22', kind: 'image', file: image('Neon_discharge_tube.jpg'), in: 0.0, start: 21.4, end: 23.4, sub: 'gemini 4 neon.',        push: {from: 1.0, to: 1.04, ox: 50, oy: 50}, saturation: 0.15, flickerAt: 21.55, aiFile: ai('S22')},
  // S23 · real app recording (screen/gemini-app.mp4). `in` = seconds into the recording.
  {id: 'S23a', kind: 'app', file: SCREEN, app: 'picker', in: 13.1, start: 23.4, end: 24.1, push: {from: 1.0, to: 1.12, ox: 0, oy: 0}},
  {id: 'S23b', kind: 'app', file: SCREEN, app: 'stream', in: 22.8, start: 24.1, end: 25.0, rate: 5},
  {id: 'END',  kind: 'end', file: SPARK, in: 0, start: 25.0, end: 28.6, blackBefore: 2},
];

export const sec = (s: number) => Math.round(s * FPS);
export const TOTAL_FRAMES = sec(DURATION);
