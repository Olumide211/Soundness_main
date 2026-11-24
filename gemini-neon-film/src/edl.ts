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
// same amount (1 frame = 1/30 s ≈ 0.0333). The music and mix are built on the
// ANCHORS below (filament ignition 9.800 s, hero flicker-on 21.567 s, black
// frames 4.933–5.0 and 24.933–25.0, silent end card 25.0–28.6).
// The picture edit is LOCKED. After changing any cue/shot, re-run the audio steps
// (see public/gemini-neon-pack/audio/README.md).
// ─────────────────────────────────────────────────────────────────────────────

export const FPS = 30;
export const DURATION = 28.6; // seconds → 858 frames

const PACK = 'gemini-neon-pack';
export const clip = (name: string) => `${PACK}/clips/${name}.mp4`;
export const image = (name: string) => `${PACK}/images/${name}`;
export const ai = (name: string) => `${PACK}/ai/${name}.mp4`;
export const SCREEN = `${PACK}/screen/gemini-app-cfr30.mp4`; // CFR copy of screen/gemini-app.mp4 (scripts/prep.mjs)
export const SPARK = `${PACK}/brand/gemini_spark_2048.png`;

/** Locked anchors (measured on the reference render), used by the music edit, mix and checks. */
export const ANCHORS = {
  muteA: [4.933, 5.0], // 2 black frames before S07
  smallHit: 8.4, // plasma (optional small hit)
  dropOut: [9.2, 9.8], // filament dark → music near-silent
  hit1: 9.8, // MAIN DROP: filament ignition, frame 294
  thin: [18.4, 19.6], // servers
  sparks: 20.6, // hit on the fire-sparks burst
  dropOut2: [21.4, 21.567], // hero tube dark
  hit2: 21.567, // SECOND, BIGGER HIT: hero tube flicker-on, frame 647
  app: [23.4, 24.933],
  mute: 24.933, // 2 black frames + silent end card
  end: 25.0,
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
  {id: 'S01', kind: 'video', file: clip('S01_eye_A'),              in: 0.0, start: 0.0,  end: 1.0,  crop916: 0.42, push: {from: 1.0, to: 1.03, ox: 44, oy: 48}},
  {id: 'S02', kind: 'video', file: clip('S02_ink_A'),              in: 0.5, start: 1.0,  end: 2.0,  crop916: 0.68, push: {from: 1.0, to: 1.03, ox: 62, oy: 40}},
  {id: 'S03', kind: 'video', file: clip('S03_deep-jellyfish_A'),   in: 0.0, start: 2.0,  end: 2.8,  crop916: 0.40, push: {from: 1.0, to: 1.025, ox: 40, oy: 55}},
  {id: 'S04', kind: 'video', file: clip('S04_embers_A'),           in: 0.0, start: 2.8,  end: 3.5,  crop916: 0.50, push: {from: 1.0, to: 1.02, ox: 55, oy: 52}},
  {id: 'S05', kind: 'video', file: clip('S05_lightning_A'),        in: 0.4, start: 3.5,  end: 4.2,  crop916: 0.40, push: {from: 1.0, to: 1.02, ox: 40, oy: 35}},
  {id: 'S06', kind: 'video', file: clip('S06_insect-damselfly_A'), in: 0.0, start: 4.2,  end: 5.0,  crop916: 0.50, push: {from: 1.0, to: 1.025, ox: 46, oy: 50}},
  {id: 'S07', kind: 'image', file: image('NeTube.jpg'),            in: 0.0, start: 5.0,  end: 6.6,  push: {from: 1.0, to: 1.04, ox: 50, oy: 50}, brightness: 0.15, blackBefore: 2, aiFile: ai('S07')},
  {id: 'S08', kind: 'video', file: clip('S08_smoke_A'),            in: 0.0, start: 6.6,  end: 7.4,  crop916: 0.32, push: {from: 1.0, to: 1.03, ox: 35, oy: 45}},
  {id: 'S09', kind: 'video', file: clip('S09_match-strike_A'),     in: 1.0, start: 7.4,  end: 8.4,  crop916: 0.45, push: {from: 1.0, to: 1.03, ox: 47, oy: 60}},
  {id: 'S10', kind: 'video', file: clip('S10_plasma_A'),           in: 0.0, start: 8.4,  end: 9.2,  crop916: 0.50, push: {from: 1.0, to: 1.025, ox: 50, oy: 46}},
  // filament: dark 9.2–9.8, ignites on frame 294 (9.800 s)
  {id: 'S11', kind: 'video', file: clip('S11_filament-ignite_A'),  in: 1.2, start: 9.2,  end: 10.8, crop916: 0.50, push: {from: 1.0, to: 1.04, ox: 52, oy: 54}},
  {id: 'S12', kind: 'video', file: clip('S12_code_A'),             in: 0.0, start: 10.8, end: 11.4, crop916: 0.58, push: {from: 1.0, to: 1.02, ox: 60, oy: 50}},
  {id: 'S13', kind: 'video', file: clip('S13_pages_A'),            in: 0.0, start: 11.4, end: 12.0, crop916: 0.50, push: {from: 1.0, to: 1.02, ox: 48, oy: 52}},
  {id: 'S14', kind: 'video', file: clip('S14_sun-flare_A'),        in: 0.0, start: 12.0, end: 12.6, crop916: 0.50, push: {from: 1.0, to: 1.02, ox: 50, oy: 48}},
  {id: 'S15', kind: 'video', file: clip('S15_crowd-slowmo_A'),     in: 0.0, start: 12.6, end: 14.4, crop916: 0.55, push: {from: 1.0, to: 1.04, ox: 56, oy: 45}},
  {id: 'S16', kind: 'video', file: clip('S16_murmuration_A'),      in: 0.0, start: 14.4, end: 16.2, crop916: 0.45, push: {from: 1.0, to: 1.035, ox: 44, oy: 40}},
  {id: 'S17', kind: 'video', file: clip('S17_water-drop_A'),       in: 0.3, start: 16.2, end: 17.2, crop916: 0.50, push: {from: 1.0, to: 1.03, ox: 50, oy: 52}},
  {id: 'S18', kind: 'video', file: clip('S18_typing_A'),           in: 0.0, start: 17.2, end: 18.4, crop916: 0.42, push: {from: 1.0, to: 1.03, ox: 42, oy: 55}},
  {id: 'S19', kind: 'video', file: clip('S19_servers_A'),          in: 0.0, start: 18.4, end: 19.6, crop916: 0.50, push: {from: 1.0, to: 1.03, ox: 53, oy: 50}},
  {id: 'S20', kind: 'video', file: clip('S20_light-tunnel_A'),     in: 0.0, start: 19.6, end: 20.6, crop916: 0.45, push: {from: 1.0, to: 1.04, ox: 45, oy: 45}},
  {id: 'S21', kind: 'video', file: clip('S21_fire-sparks_A'),      in: 0.0, start: 20.6, end: 21.4, crop916: 0.38, push: {from: 1.0, to: 1.025, ox: 38, oy: 50}},
  // hero tube: dark 21.4–21.567, flickers on at frame 647 (21.567 s)
  {id: 'S22', kind: 'image', file: image('Neon_discharge_tube.jpg'), in: 0.0, start: 21.4, end: 23.4, push: {from: 1.0, to: 1.04, ox: 50, oy: 50}, saturation: 0.15, flickerAt: 21.55, aiFile: ai('S22')},
  // S23 · real app recording (screen/gemini-app.mp4). `in` = seconds into the recording.
  {id: 'S23a', kind: 'app', file: SCREEN, app: 'picker', in: 13.1, start: 23.4, end: 24.1, push: {from: 1.0, to: 1.12, ox: 0, oy: 0}},
  {id: 'S23b', kind: 'app', file: SCREEN, app: 'stream', in: 22.8, start: 24.1, end: 25.0, rate: 5},
  {id: 'END', kind: 'end', file: SPARK, in: 0, start: 25.0, end: 28.6, blackBefore: 2},
];

export type Cue = {vo: string; text: string; at: number; until: number};

// Subtitle in/out times are the frames of the locked render; `at` is also where the
// VO phrase's first word lands. Lines whose voice starts more than 3 frames after the
// cut have their subtitle moved to the word start (scripts/audio/fit_timeline.py).
export const CUES: Cue[] = [
  {vo: 'P01', text: 'every element',               at: 0.0,   until: 1.0},
  {vo: 'P02', text: 'has a nature.',               at: 1.0,   until: 2.0},
  {vo: 'P03', text: 'carbon goes deep.',           at: 2.0,   until: 2.8},
  {vo: 'P04', text: 'hydrogen moves fast.',        at: 3.5,   until: 4.2},
  {vo: 'P05', text: 'and neon?',                   at: 5.0,   until: 6.6},
  {vo: 'P06', text: 'neon waits.',                 at: 6.6,   until: 7.4},
  {vo: 'P07', text: 'until you give it a charge.', at: 7.4,   until: 8.4},
  {vo: 'P08', text: 'then it lights the room.',    at: 9.867,  until: 10.8},
  {vo: 'P09', text: 'code.',                       at: 10.8,  until: 11.4},
  {vo: 'P10', text: 'research.',                   at: 11.4,  until: 12.0},
  {vo: 'P11', text: 'science.',                    at: 12.0,  until: 12.6},
  {vo: 'P12', text: 'a million tokens.',           at: 12.6,  until: 13.5},
  {vo: 'P13', text: 'one thought.',                at: 13.5,  until: 14.4},
  {vo: 'P14', text: 'change course mid-task.',     at: 14.4,  until: 15.3},
  {vo: 'P15', text: 'it turns with you.',          at: 15.3,  until: 16.2},
  {vo: 'P16', text: 'less making it up.',          at: 16.2,  until: 17.2},
  {vo: 'P17', text: 'more getting it done.',       at: 17.2,  until: 18.4},
  {vo: 'P18', text: 'depth used to cost time.',    at: 18.4,  until: 19.6},
  {vo: 'P19', text: 'not anymore.',                at: 19.6,  until: 20.6},
  {vo: 'P20', text: 'gemini 4 neon.',              at: 21.6,  until: 23.4},
];

export const sec = (s: number) => Math.round(s * FPS);
export const TOTAL_FRAMES = sec(DURATION);
