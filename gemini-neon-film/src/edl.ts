// ─────────────────────────────────────────────────────────────────────────────
// GEMINI 4 NEON · edit decision list
// Every cut, in-point, subtitle and VO cue lives here. All times are in SECONDS.
//
// SHOTS
//   start / end : where the shot sits on the timeline (gaps = pure black)
//   in          : where to start reading inside the source clip
//   rate        : playback speed (1 = normal)
//   crop916     : 9:16 crop centre as a fraction of the source width (0 = left, 1 = right)
//   push        : slow push-in inside the shot (scale from → to, origin in %)
//   blackBefore : frames of pure black taken from the END of the previous shot
//
// CUES (subtitle + voice-over line)
//   at    : subtitle in-time AND where the VO phrase starts (synced to the real word start)
//   until : subtitle out-time (hard off)
//   vo    : VO phrase id → audio/vo/<id>.wav
//
// To nudge a cut: change the `end` of one shot and the `start` of the next by the
// same amount (1 frame = 1/30 s ≈ 0.0333). Locked anchors (music + mix depend on
// them): black 8.7–9.1 (audio), hit 9.1, black 20.3–20.9, hit + hero 20.9,
// app 22.8, black 25.0–25.2, end card 25.2–28.6.
// After changing any cue/shot, re-run the audio steps (see audio/README.md).
// ─────────────────────────────────────────────────────────────────────────────

export const FPS = 30;
export const DURATION = 28.6; // seconds → 858 frames

const PACK = 'gemini-neon-pack';
export const clip = (name: string) => `${PACK}/clips/${name}.mp4`;
export const image = (name: string) => `${PACK}/images/${name}`;
export const ai = (name: string) => `${PACK}/ai/${name}.mp4`;
export const SCREEN = `${PACK}/screen/gemini-app-cfr30.mp4`; // CFR copy of screen/gemini-app.mp4 (scripts/prep.mjs)
export const SPARK = `${PACK}/brand/gemini_spark_2048.png`;

/** Locked anchors used by the music edit and the mix. */
export const ANCHORS = {
  muteA: [8.7, 9.1],
  hit1: 9.1,
  blackB: [20.3, 20.9],
  hit2: 20.9,
  app: 22.8,
  blackC: [25.0, 25.2],
  end: 25.2,
} as const;

export type Push = {from: number; to: number; ox: number; oy: number};

export type Shot = {
  id: string;
  kind: 'video' | 'image' | 'app' | 'end';
  file: string;
  in: number;
  start: number;
  end: number;
  rate?: number;
  crop916?: number;
  push?: Push;
  blackBefore?: number;
  /** S22 only: neon keeps a hint of colour. 0.025 on this pure-red source ≈ 13–14 % visible (HSV) saturation */
  saturation?: number;
  /** S07 / S22 image stand-ins */
  brightness?: number;
  /** S22: flicker-on time on the timeline (seconds) */
  flickerAt?: number;
  /** App recording part */
  app?: 'picker' | 'stream';
  /** used instead of the still if public/gemini-neon-pack/ai/<id>.mp4 exists */
  aiFile?: string;
};

export const SHOTS: Shot[] = [
  {id: 'S01', kind: 'video', file: clip('S01_eye_A'),              in: 0.0, start: 0.0,  end: 0.9,  crop916: 0.42, push: {from: 1.0, to: 1.03, ox: 44, oy: 48}},
  {id: 'S02', kind: 'video', file: clip('S02_ink_A'),              in: 0.5, start: 0.9,  end: 1.8,  crop916: 0.68, push: {from: 1.0, to: 1.03, ox: 62, oy: 40}},
  {id: 'S03', kind: 'video', file: clip('S03_deep-jellyfish_A'),   in: 0.0, start: 1.8,  end: 2.8,  crop916: 0.40, push: {from: 1.0, to: 1.025, ox: 40, oy: 55}},
  {id: 'S04', kind: 'video', file: clip('S04_embers_A'),           in: 0.0, start: 2.8,  end: 3.6,  crop916: 0.50, push: {from: 1.0, to: 1.02, ox: 55, oy: 52}},
  {id: 'S06', kind: 'video', file: clip('S06_insect-damselfly_A'), in: 0.0, start: 3.6,  end: 4.4,  crop916: 0.50, push: {from: 1.0, to: 1.025, ox: 46, oy: 50}},
  {id: 'S07', kind: 'image', file: image('NeTube.jpg'),            in: 0.0, start: 4.4,  end: 6.7,  push: {from: 1.0, to: 1.04, ox: 50, oy: 50}, brightness: 0.15, blackBefore: 2, aiFile: ai('S07')},
  {id: 'S09', kind: 'video', file: clip('S09_match-strike_A'),     in: 0.6, start: 6.7,  end: 8.7,  crop916: 0.45, push: {from: 1.0, to: 1.035, ox: 47, oy: 60}},
  {id: 'S10', kind: 'video', file: clip('S10_plasma_A'),           in: 0.0, start: 8.7,  end: 9.1,  crop916: 0.50, push: {from: 1.0, to: 1.01, ox: 50, oy: 46}},
  // filament ignites 1.84 s into the clip → in 1.8 puts the ignition on the 9.1 s hit
  {id: 'S11', kind: 'video', file: clip('S11_filament-ignite_A'),  in: 1.8, start: 9.1,  end: 10.1, crop916: 0.50, push: {from: 1.0, to: 1.03, ox: 52, oy: 54}},
  {id: 'S12', kind: 'video', file: clip('S12_code_A'),             in: 0.0, start: 10.1, end: 10.9, crop916: 0.58, push: {from: 1.0, to: 1.02, ox: 60, oy: 50}},
  {id: 'S13', kind: 'video', file: clip('S13_pages_A'),            in: 0.0, start: 10.9, end: 11.8, crop916: 0.50, push: {from: 1.0, to: 1.02, ox: 48, oy: 52}},
  {id: 'S14', kind: 'video', file: clip('S14_sun-flare_A'),        in: 0.0, start: 11.8, end: 12.7, crop916: 0.50, push: {from: 1.0, to: 1.02, ox: 50, oy: 48}},
  {id: 'S15', kind: 'video', file: clip('S15_crowd-slowmo_A'),     in: 0.0, start: 12.7, end: 14.3, crop916: 0.55, push: {from: 1.0, to: 1.035, ox: 56, oy: 45}},
  // "change course mid-task. / it turns with you." — the murmuration turning
  {id: 'S16', kind: 'video', file: clip('S16_murmuration_A'),      in: 0.0, start: 14.3, end: 16.3, crop916: 0.45, push: {from: 1.0, to: 1.035, ox: 44, oy: 40}},
  {id: 'S17', kind: 'video', file: clip('S17_water-drop_A'),       in: 0.3, start: 16.3, end: 17.3, crop916: 0.50, push: {from: 1.0, to: 1.03, ox: 50, oy: 52}},
  {id: 'S18', kind: 'video', file: clip('S18_typing_A'),           in: 0.0, start: 17.3, end: 18.3, crop916: 0.42, push: {from: 1.0, to: 1.03, ox: 42, oy: 55}},
  {id: 'S19', kind: 'video', file: clip('S19_servers_A'),          in: 0.0, start: 18.3, end: 19.5, crop916: 0.50, push: {from: 1.0, to: 1.025, ox: 53, oy: 50}},
  {id: 'S20', kind: 'video', file: clip('S20_light-tunnel_A'),     in: 0.0, start: 19.5, end: 20.3, crop916: 0.45, push: {from: 1.0, to: 1.03, ox: 45, oy: 45}},
  // 20.3–20.9: black beat (no shot)
  {id: 'S22', kind: 'image', file: image('Neon_discharge_tube.jpg'), in: 0.0, start: 20.9, end: 22.8, push: {from: 1.0, to: 1.04, ox: 50, oy: 50}, saturation: 0.025, flickerAt: 20.9, aiFile: ai('S22')},
  // S23 · real app recording (screen/gemini-app.mp4). `in` = seconds into the recording.
  {id: 'S23a', kind: 'app', file: SCREEN, app: 'picker', in: 13.1, start: 22.8, end: 23.8, push: {from: 1.0, to: 1.12, ox: 0, oy: 0}},
  {id: 'S23b', kind: 'app', file: SCREEN, app: 'stream', in: 22.8, start: 23.8, end: 25.0, rate: 4},
  // 25.0–25.2: black
  {id: 'END', kind: 'end', file: SPARK, in: 0, start: 25.2, end: 28.6},
];

export type Cue = {vo: string; text: string; at: number; until: number};

export const CUES: Cue[] = [
  {vo: 'P01', text: 'every element',               at: 0.0,  until: 0.9},
  {vo: 'P02', text: 'has a nature.',               at: 0.9,  until: 1.8},
  {vo: 'P03', text: 'carbon goes deep.',           at: 1.8,  until: 2.8},
  {vo: 'P04', text: 'hydrogen moves fast.',        at: 2.8,  until: 4.333},
  {vo: 'P05', text: 'and neon?',                   at: 4.4,  until: 5.6},
  {vo: 'P06', text: 'neon waits.',                 at: 5.6,  until: 6.7},
  {vo: 'P07', text: 'until you give it a charge.', at: 6.7,  until: 8.7},
  {vo: 'P08', text: 'then it lights the room.',    at: 9.1,  until: 10.1},
  {vo: 'P09', text: 'code.',                       at: 10.1, until: 10.9},
  {vo: 'P10', text: 'research.',                   at: 10.9, until: 11.8},
  {vo: 'P11', text: 'science.',                    at: 11.8, until: 12.7},
  {vo: 'P12', text: 'a million tokens.',           at: 12.7, until: 13.6},
  {vo: 'P13', text: 'one thought.',                at: 13.6, until: 14.3},
  {vo: 'P14', text: 'change course mid-task.',     at: 14.3, until: 15.3},
  {vo: 'P15', text: 'it turns with you.',          at: 15.3, until: 16.3},
  {vo: 'P16', text: 'less making it up.',          at: 16.3, until: 17.3},
  {vo: 'P17', text: 'more getting it done.',       at: 17.3, until: 18.3},
  {vo: 'P18', text: 'depth used to cost time.',    at: 18.3, until: 19.5},
  {vo: 'P19', text: 'not anymore.',                at: 19.5, until: 20.3},
  {vo: 'P20', text: 'gemini 4 neon.',              at: 20.9, until: 22.8},
];

export const sec = (s: number) => Math.round(s * FPS);
export const TOTAL_FRAMES = sec(DURATION);
