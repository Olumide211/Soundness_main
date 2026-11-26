/*
 * ONE BALL — offline audio mix from real recorded VCSL samples (CC0).
 * Reads src/data/sim.json (note events), places each sample at exactly frame/60 s,
 * adds a bowed-vibraphone pad in D, the D major burst chord, convolution reverb (~1.4 s),
 * gentle compression, an oversampled limiter and loudness normalisation to -14 LUFS / <= -1 dBTP.
 * Outputs public/audio/mix.wav and out/one-ball.mid.
 *
 * No oscillators / synthesis: every audible sound is a VCSL recording. Notes are mapped to pitch the
 * way any sampler does (nearest recorded root, resampled to the exact equal-tempered pitch). No detune.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeMidi, MidiNote } from './midi.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SAMPLES = path.join(ROOT, 'assets', 'vcsl');
const TMP = path.join(ROOT, '.cache', 'mix');
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'public', 'audio'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });

const SR = 48000;
const FPS = 60;
const DURATION = 26;
const LEN = SR * DURATION;
const BURST_T = 23.0;
const TARGET_LUFS = -14;
const TP_CEIL = -1.0;

const sim = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'sim.json'), 'utf8'));

// ------------------------------------------------------------------ helpers
const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// VCSL file names use the "C3 = middle C" convention; verified by pitch analysis (+12 semitones).
function vcslNameToMidi(name: string): number {
  const m = name.match(/_([A-G]#?)(\d)_/);
  if (!m) throw new Error('no pitch in ' + name);
  return PCS.indexOf(m[1]) + 12 * (Number(m[2]) + 2);
}
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function decode(file: string): Float32Array {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
}

interface Sample {
  file: string;
  root: number; // fractional midi (measured)
  layer: string;
  data: Float32Array; // interleaved stereo, trimmed to onset, peak-normalised
  frames: number;
}

function goertzelMag(x: Float32Array, start: number, n: number, freq: number): number {
  const w = (2 * Math.PI * freq) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const v = (x[2 * (start + i)] + x[2 * (start + i) + 1]) * 0.5 * hann;
    const s0 = v + c * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

function loadSample(file: string, layer: string): Sample {
  const raw = decode(file);
  const frames = raw.length / 2;
  let peak = 0;
  for (let i = 0; i < raw.length; i++) peak = Math.max(peak, Math.abs(raw[i]));
  let onset = 0;
  for (let i = 0; i < frames; i++) {
    if (Math.max(Math.abs(raw[2 * i]), Math.abs(raw[2 * i + 1])) > peak * 0.04) { onset = i; break; }
  }
  const start = Math.max(0, onset - Math.round(SR * 0.0015));
  const data = raw.slice(start * 2);
  for (let i = 0; i < data.length; i++) data[i] /= peak;
  // short fade-in on the pre-onset slice so trimming never clicks
  const fin = Math.min(onset - start, data.length / 2);
  for (let i = 0; i < fin; i++) { const g = i / Math.max(1, fin); data[2 * i] *= g; data[2 * i + 1] *= g; }
  // fine tuning: find the spectral peak within +-70 cents of the nominal pitch
  const nominal = vcslNameToMidi(path.basename(file));
  const a0 = Math.round(SR * 0.03);
  const n = Math.min(Math.round(SR * 0.4), data.length / 2 - a0 - 1);
  let best = nominal, bestMag = -1, bestIdx = 0;
  for (let c = -70, k = 0; c <= 70; c += 1, k++) {
    const m = goertzelMag(data, a0, n, mtof(nominal + c / 100));
    if (m > bestMag) { bestMag = m; best = nominal + c / 100; bestIdx = c; }
  }
  const root = Math.abs(bestIdx) >= 69 ? nominal : best;
  return { file, root, layer, data, frames: data.length / 2 };
}

function listWav(dir: string) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.wav')).map((f) => path.join(dir, f)).sort();
}

console.log('loading VCSL samples…');
const marimba = listWav(path.join(SAMPLES, 'marimba')).map((f) => loadSample(f, f.match(/_(loud|med|soft)_/)![1]));
const glock = listWav(path.join(SAMPLES, 'glockenspiel')).map((f) => loadSample(f, f.match(/_(loud|medium|soft)_/)![1]));
const bowed = listWav(path.join(SAMPLES, 'bowed_vibes')).map((f) => loadSample(f, 'bowed'));
const chimes = listWav(path.join(SAMPLES, 'hand_chimes')).map((f) => loadSample(f, 'sus'));
for (const s of [...marimba, ...glock, ...bowed, ...chimes]) {
  console.log(`  ${path.basename(s.file).padEnd(42)} root=${s.root.toFixed(2)}  ${(s.frames / SR).toFixed(2)}s`);
}

function pick(bank: Sample[], midi: number, layer?: string): Sample {
  const pool = layer ? bank.filter((s) => s.layer === layer) : bank;
  let best = pool[0];
  let bd = 1e9;
  for (const s of pool) {
    // prefer slight downward transposition (sounds more natural) on ties
    const d = Math.abs(midi - s.root) + (midi > s.root ? 0.01 : 0);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ------------------------------------------------------------------ voice renderer
const L = new Float64Array(LEN);
const R = new Float64Array(LEN);

function addVoice(s: Sample, startSec: number, midi: number, gain: number, pan = 0, maxDur = 4, fadeDur = 0.4,
  env?: (t: number) => number, outL: Float64Array = L, outR: Float64Array = R, offset = 0) {
  const ratio = Math.pow(2, (midi - s.root) / 12); // exact equal-tempered pitch
  const start = Math.round(startSec * SR);
  const outFrames = Math.min(Math.floor((s.frames - 3) / ratio), Math.round(maxDur * SR), outL.length - (start - offset));
  const fadeN = Math.round(fadeDur * SR);
  const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
  const gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  const d = s.data;
  for (let i = 0; i < outFrames; i++) {
    const pos = i * ratio;
    const k = Math.floor(pos);
    const t = pos - k;
    let g = gain;
    if (i > outFrames - fadeN) g *= (outFrames - i) / fadeN;
    if (env) g *= env(startSec + i / SR);
    if (g === 0) continue;
    for (let ch = 0; ch < 2; ch++) {
      const y0 = k > 0 ? d[2 * (k - 1) + ch] : 0;
      const y1 = d[2 * k + ch], y2 = d[2 * (k + 1) + ch], y3 = d[2 * (k + 2) + ch];
      // Catmull-Rom cubic interpolation
      const v = y1 + 0.5 * t * (y2 - y0 + t * (2 * y0 - 5 * y1 + 4 * y2 - y3 + t * (3 * (y1 - y2) + y3 - y0)));
      if (ch === 0) outL[start - offset + i] += v * g * gl; else outR[start - offset + i] += v * g * gr;
    }
  }
}

const midiNotes: MidiNote[] = [];

// ------------------------------------------------------------------ collision notes
const marLayer = (g: number) => (g < 0.33 ? 'soft' : g < 0.66 ? 'med' : 'loud');
const glkLayer = (g: number) => (g < 0.2 ? 'soft' : 'medium');
// sync-check templates: each note's own dry waveform (first 120 ms, mono) for matched filtering in verify.ts
const TPL = Math.round(0.12 * SR);
const templates = new Float32Array(sim.notes.length * TPL);
if (!process.env.MIX_PREMASTER_ONLY) sim.notes.forEach((n: any, idx: number) => {
  const tl = new Float64Array(TPL), tr = new Float64Array(TPL);
  const st = Math.round((n.frame / FPS) * SR);
  const smp = n.instrument === 'marimba' ? pick(marimba, n.midi[0], marLayer(n.gain)) : pick(glock, n.midi[0], glkLayer(n.gain));
  addVoice(smp, n.frame / FPS, n.midi[0], 1, 0, 0.2, 0.01, undefined, tl, tr, st);
  for (let i = 0; i < TPL; i++) templates[idx * TPL + i] = (tl[i] + tr[i]) / 2;
});
if (!process.env.MIX_PREMASTER_ONLY) fs.writeFileSync(path.join(TMP, 'templates.f32'), Buffer.from(templates.buffer));

// verification hook: MIX_EXCLUDE="frame:ballId" drops one note, MIX_PREMASTER_ONLY=<file> stops after the dry premaster
const EXCLUDE = process.env.MIX_EXCLUDE;
const PREMASTER_ONLY = process.env.MIX_PREMASTER_ONLY;
for (const n of sim.notes) {
  if (EXCLUDE && EXCLUDE === `${n.frame}:${n.ballId}`) continue;
  const t = n.frame / FPS;
  const pan = Math.max(-0.6, Math.min(0.6, ((n.x - 540) / 430) * 0.6));
  if (n.instrument === 'marimba') {
    addVoice(pick(marimba, n.midi[0], marLayer(n.gain)), t, n.midi[0], n.gain * 0.55, pan, 3.2, 0.6);
    midiNotes.push({ time: t, dur: 0.5, midi: n.midi[0], vel: 20 + n.gain * 107, channel: n.target === 'ring' ? 0 : 1, track: n.target === 'ring' ? 'Marimba (ring)' : 'Marimba (arms)' });
    if (n.midi.length > 1) {
      addVoice(pick(marimba, n.midi[1], 'med'), t, n.midi[1], n.gain * n.layerGain * 0.55, pan * 0.5, 3.2, 0.6);
      midiNotes.push({ time: t, dur: 0.6, midi: n.midi[1], vel: 20 + n.gain * n.layerGain * 107, channel: 2, track: 'Marimba (low layer)' });
    }
  } else {
    addVoice(pick(glock, n.midi[0], glkLayer(n.gain)), t, n.midi[0], n.gain * 0.5, pan, 2.5, 0.8);
    midiNotes.push({ time: t, dur: 0.3, midi: n.midi[0], vel: 15 + n.gain * 200, channel: 3, track: 'Glockenspiel (ball-ball)' });
  }
}

// ------------------------------------------------------------------ pad: bowed vibraphone in D (fades in from 6 s, swells to the climax)
const padEnv = (t: number) => {
  if (t < 6) return 0;
  if (t < 10) { const u = (t - 6) / 4; return 0.05 * u * u; }
  if (t < 22.9) { const u = (t - 10) / 12.9; return 0.05 + 0.19 * Math.pow(u, 1.6); }
  if (t < 23.5) { const u = (t - 22.9) / 0.6; return 0.24 * (1 - u) * (1 - u); }
  return 0;
};
const bowedBy = (nameStart: string) => bowed.find((s) => path.basename(s.file).includes(nameStart))!;
const D5bow = bowedBy('_D4_'); // sounding D5
const A3bow = bowedBy('_A2_'); // sounding A3
const A5bow = bowedBy('_A4_'); // sounding A5
const padVoices: [Sample, number, number, number][] = [
  // sample, start, target midi, gain
  [D5bow, 6.0, 62, 1.0], // D4 (octave down)
  [A3bow, 10.5, 57, 0.8], // A3
  [D5bow, 14.5, 62, 0.9], // D4 again (layered for the swell)
  [A5bow, 17.0, 69, 0.55], // A4
  [D5bow, 18.5, 74, 0.35], // D5 shimmer near the climax
];
for (const [s, st, m, g] of padVoices) {
  addVoice(s, st, m, g, 0, 40, 1.5, padEnv);
  midiNotes.push({ time: st, dur: Math.min(23.4 - st, 17), midi: m, vel: 50, channel: 4, track: 'Bowed vibraphone pad' });
}

// ------------------------------------------------------------------ 23.0 s burst: big D major chord, all octaves
const chordMar = [38, 45, 50, 54, 57, 62, 66, 69, 74, 78, 81, 86];
chordMar.forEach((m, i) => {
  addVoice(pick(marimba, m, 'loud'), BURST_T + i * 0.004, m, 0.42 - i * 0.012, ((i % 3) - 1) * 0.35, 3.2, 1.2);
  midiNotes.push({ time: BURST_T, dur: 2.6, midi: m, vel: 110, channel: 0, track: 'Burst chord' });
});
[86, 90, 93, 98].forEach((m, i) => {
  addVoice(pick(glock, m, 'medium'), BURST_T + 0.01 + i * 0.006, m, 0.26, (i % 2 ? 0.4 : -0.4), 2.8, 1.2);
  midiNotes.push({ time: BURST_T, dur: 2.6, midi: m, vel: 90, channel: 3, track: 'Burst chord' });
});
for (const nm of ['_D3_', '_D4_', '_A4_', '_D5_']) {
  const s = chimes.find((c) => path.basename(c.file).includes(nm))!;
  const m = Math.round(s.root);
  addVoice(s, BURST_T, m, 0.3, 0, 2.9, 1.4);
  midiNotes.push({ time: BURST_T, dur: 2.6, midi: m, vel: 80, channel: 5, track: 'Burst chord' });
}

// ------------------------------------------------------------------ convolution reverb (~1.4 s RT60)
function fft(re: Float64Array, im: Float64Array, inv: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Impulse response: exponentially decaying, decorrelated stereo diffuse tail (a processing kernel, not a sound source)
function makeIR(seed: number): Float64Array {
  const rt60 = 1.4, pre = 0.014, len = Math.round(SR * 1.9);
  const rng = mulberry32(seed);
  const ir = new Float64Array(len);
  let lp = 0;
  for (let i = Math.round(pre * SR); i < len; i++) {
    const t = i / SR - pre;
    const decay = Math.exp((-6.907755 * t) / rt60);
    const damp = 0.35 + 0.5 * Math.exp(-t * 2.5); // high frequencies die faster
    lp += damp * ((rng() * 2 - 1) - lp);
    const attack = Math.min(1, t / 0.02);
    ir[i] = lp * decay * attack;
  }
  let e = 0;
  for (const v of ir) e += v * v;
  const k = 1 / Math.sqrt(e);
  for (let i = 0; i < len; i++) ir[i] *= k;
  return ir;
}
function convolve(x: Float64Array, ir: Float64Array): Float64Array {
  let n = 1;
  while (n < x.length + ir.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(x); br.set(ir);
  fft(ar, ai, false); fft(br, bi, false);
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    const im = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r; ai[i] = im;
  }
  fft(ar, ai, true);
  return ar.subarray(0, x.length);
}
console.log('convolution reverb…');
const WET = 0.2;
const wetL = convolve(L, makeIR(2026));
const wetR = convolve(R, makeIR(2027));

// master fade: everything back to silence by 25.8 s so the loop point is invisible
const masterEnv = (t: number) => {
  if (t < 24.3) return 1;
  if (t < 25.8) { const u = (t - 24.3) / 1.5; return 0.5 + 0.5 * Math.cos(Math.PI * u); }
  return 0;
};
const pre = new Float32Array(LEN * 2);
for (let i = 0; i < LEN; i++) {
  const g = masterEnv(i / SR);
  pre[2 * i] = (L[i] + wetL[i] * WET) * g;
  pre[2 * i + 1] = (R[i] + wetR[i] * WET) * g;
}

function writeWavFloat(file: string, data: Float32Array) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.byteLength, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34);
  h.write('data', 36); h.writeUInt32LE(data.byteLength, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(data.buffer)]));
}
const preFile = PREMASTER_ONLY ?? path.join(TMP, 'premaster.wav');
writeWavFloat(preFile, pre);
if (PREMASTER_ONLY) process.exit(0);

// ------------------------------------------------------------------ mastering loop: compression -> gain -> oversampled limiter -> LUFS
function measureLoud(file: string) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const txt = r.stderr as string;
  const I = Number(txt.match(/Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS/)![1]);
  const tp = Number(txt.match(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/)![1]);
  return { I, tp };
}

const outFile = path.join(ROOT, 'public', 'audio', 'mix.wav');
let gainDb = 0;
{
  const m = measureLoud(preFile);
  gainDb = TARGET_LUFS - m.I + 1.5; // compression lowers level a little; start slightly hot
  console.log(`premaster: ${m.I.toFixed(2)} LUFS, TP ${m.tp.toFixed(2)} dBTP`);
}
let final = { I: 0, tp: 0 };
for (let it = 0; it < 8; it++) {
  const limit = Math.pow(10, -1.6 / 20);
  const af = [
    'acompressor=threshold=-18dB:ratio=2:attack=12:release=180:knee=6:makeup=1',
    `volume=${gainDb.toFixed(3)}dB`,
    'aresample=192000:resampler=soxr',
    `alimiter=limit=${limit.toFixed(4)}:attack=0.8:release=60:level=disabled:asc=1`,
    'aresample=48000:resampler=soxr',
    `atrim=end_sample=${LEN}`,
    `apad=whole_len=${LEN}`,
  ].join(',');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', preFile, '-af', af, '-ar', String(SR), '-c:a', 'pcm_s24le', outFile]);
  final = measureLoud(outFile);
  console.log(`  master pass ${it}: gain ${gainDb.toFixed(2)} dB -> ${final.I.toFixed(2)} LUFS, TP ${final.tp.toFixed(2)} dBTP`);
  if (Math.abs(final.I - TARGET_LUFS) <= 0.2 && final.tp <= TP_CEIL - 0.3) break;
  gainDb += TARGET_LUFS - final.I;
}
console.log(`mix: ${outFile}  integrated ${final.I.toFixed(2)} LUFS, true peak ${final.tp.toFixed(2)} dBTP`);

// ------------------------------------------------------------------ MIDI backup
const mid = writeMidi(midiNotes, {
  'Marimba (ring)': 12, 'Marimba (arms)': 12, 'Marimba (low layer)': 12,
  'Glockenspiel (ball-ball)': 9, 'Bowed vibraphone pad': 11, 'Burst chord': 12,
});
fs.writeFileSync(path.join(ROOT, 'out', 'one-ball.mid'), mid);
console.log(`midi: out/one-ball.mid (${midiNotes.length} notes)`);
fs.writeFileSync(path.join(TMP, 'master.json'), JSON.stringify({ gainDb, ...final }, null, 2));
