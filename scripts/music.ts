// Shared musical rules for ONE BALL. Used by simulate.ts (note selection, written into sim.json)
// and mix.ts (rendering the notes with real VCSL samples). Pure + deterministic.

export const FPS = 60;
export const MAX_NOTES_PER_SEC = 14;
export const MIN_NOTE_GAP_FRAMES = 2;

// D major pentatonic: D E F# A B
export const PENTA = [0, 2, 4, 7, 9];
export const degreeToSemis = (d: number) => PENTA[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);

// 16-step melody (pentatonic degrees, 0 = D). A rising/falling arch that reads as a tune.
export const MELODY = [0, 2, 3, 2, 1, 3, 4, 3, 2, 4, 5, 4, 3, 2, 1, 0];

export type Target = 'ring' | 'arm' | 'ball';

export interface CollisionEvent {
  frame: number;
  ballId: number;
  target: Target;
  velocity: number; // normal impact speed, px/s
  x: number;
  y: number;
}

export interface NoteEvent {
  frame: number;
  ballId: number;
  target: Target;
  velocity: number;
  x: number;
  y: number;
  step: number; // melody step 0..15
  midi: number[]; // one or more simultaneous pitches (layers)
  instrument: 'marimba' | 'glockenspiel';
  gain: number; // linear 0..1
  layerGain: number; // gain of the low-octave doubling layer (if any)
}

const D3 = 50;

// Register from impact speed: heavy/slow -> low, fast -> high (3 octaves: D3, D4, D5 bases)
export function registerBase(v: number): number {
  if (v < 520) return D3;
  if (v < 1050) return D3 + 12;
  return D3 + 24;
}

export function velocityGain(v: number, target: Target): number {
  const n = Math.min(1, Math.max(0, (v - 80) / 1500));
  const g = 0.12 + 0.88 * Math.pow(n, 0.75);
  return target === 'ball' ? g * 0.32 : g;
}

// Deterministic hash -> [0,1)
export function hash01(a: number, b = 0): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Pick the audible notes: strongest impacts first, never more than MAX_NOTES_PER_SEC inside any
 * sliding 1-second window, and at least MIN_NOTE_GAP_FRAMES between onsets.
 */
export function selectNotes(
  events: CollisionEvent[],
  countAt: (frame: number) => number,
  lastFrame: number,
): NoteEvent[] {
  const cands = events
    .filter((e) => e.frame <= lastFrame)
    .filter((e) => (e.target === 'ball' ? e.velocity >= 260 : e.velocity >= 140))
    .map((e) => ({ e, pri: e.velocity * (e.target === 'ball' ? 0.55 : e.target === 'ring' ? 1.0 : 0.95) }))
    .sort((a, b) => b.pri - a.pri || a.e.frame - b.e.frame || a.e.ballId - b.e.ballId);

  const taken = new Uint8Array(lastFrame + 2);
  const accepted: CollisionEvent[] = [];
  const W = FPS;
  for (const { e } of cands) {
    const f = e.frame;
    if (taken[f]) continue;
    let ok = true;
    for (let g = Math.max(0, f - MIN_NOTE_GAP_FRAMES + 1); g <= Math.min(lastFrame, f + MIN_NOTE_GAP_FRAMES - 1); g++) {
      if (taken[g]) { ok = false; break; }
    }
    if (!ok) continue;
    // every 60-frame window containing f must have < MAX notes already
    for (let s = Math.max(0, f - W + 1); s <= f && ok; s++) {
      let c = 0;
      for (let g = s; g < s + W && g <= lastFrame; g++) c += taken[g];
      if (c >= MAX_NOTES_PER_SEC) ok = false;
    }
    if (!ok) continue;
    taken[f] = 1;
    accepted.push(e);
  }
  accepted.sort((a, b) => a.frame - b.frame);

  return accepted.map((e, i) => {
    const step = i % MELODY.length;
    const semis = degreeToSemis(MELODY[step]);
    const count = countAt(e.frame);
    let midi: number[];
    let instrument: NoteEvent['instrument'];
    if (e.target === 'ball') {
      instrument = 'glockenspiel';
      midi = [D3 + 36 + semis]; // D6 register sparkle
    } else {
      instrument = 'marimba';
      const base = registerBase(e.velocity) - (e.target === 'arm' ? 12 : 0);
      midi = [base + semis];
    }
    // lower-octave layer that grows in as density rises
    let layerGain = 0;
    if (e.target !== 'ball') {
      const dense = count >= 150 ? step % 2 === 0 : count >= 40 ? step % 4 === 0 : false;
      if (dense) {
        midi.push(Math.max(38, midi[0] - 12));
        layerGain = count >= 150 ? 0.55 : 0.4;
      }
    }
    // slight pitch-free volume variation (+-1.2 dB), deterministic
    const varDb = (hash01(e.frame, e.ballId) - 0.5) * 2.4;
    const gain = velocityGain(e.velocity, e.target) * Math.pow(10, varDb / 20);
    return { ...e, step, midi, instrument, gain, layerGain };
  });
}
