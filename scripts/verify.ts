/*
 * ONE BALL — verification. Checks both rendered videos and the data they were built from.
 * Writes stills to ./qa/ and a machine-readable report to qa/report.json. Exit code 1 on failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LayoutName, toScreen, cameraZoom } from '../src/layout.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const QA = path.join(ROOT, 'qa');
fs.mkdirSync(QA, { recursive: true });
const sim = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'sim.json'), 'utf8'));
const VIDEOS: Record<LayoutName, string> = {
  '9x16': path.join(ROOT, 'out', 'one-ball-9x16.mp4'),
  '1x1': path.join(ROOT, 'out', 'one-ball-1x1.mp4'),
};

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail: string) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
};

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

function frameRGB(file: string, n: number, w: number, h: number): Buffer {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${n})`, '-vsync', '0', '-frames:v', '1',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
}

// ------------------------------------------------------------------ 1. container / streams
for (const lay of ['9x16', '1x1'] as LayoutName[]) {
  const L = LAYOUTS[lay];
  const file = VIDEOS[lay];
  if (!fs.existsSync(file)) { check(`probe ${lay}`, false, 'missing ' + file); continue; }
  const pj = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = pj.streams.filter((s: any) => s.codec_type === 'video');
  const a = pj.streams.filter((s: any) => s.codec_type === 'audio');
  const dur = Number(pj.format.duration);
  const ok = v.length === 1 && v[0].codec_name === 'h264' && v[0].width === L.width && v[0].height === L.height &&
    v[0].r_frame_rate === '60/1' && Number(v[0].nb_read_frames) === 1560 && Math.abs(dur - 26) < 0.05 &&
    a.length === 1 && a[0].codec_name === 'aac';
  check(`ffprobe ${lay}`, ok,
    `${v[0]?.codec_name} ${v[0]?.width}x${v[0]?.height} @${v[0]?.r_frame_rate} frames=${v[0]?.nb_read_frames} dur=${dur.toFixed(3)}s; ` +
    `audio streams=${a.length} ${a[0]?.codec_name} ${a[0]?.sample_rate}Hz ${a[0]?.channels}ch ${Math.round(Number(a[0]?.bit_rate) / 1000)}kbps`);

  // ---------------------------------------------------------------- 2. loudness (+7 clipping)
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a', '-af', 'ebur128=peak=true,astats=metadata=0', '-f', 'null', '-'], { encoding: 'utf8' });
  const I = Number(r.stderr.match(/Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS/)![1]);
  const TP = Number(r.stderr.match(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/)![1]);
  const peakDb = Number([...r.stderr.matchAll(/Peak level dB:\s+(-?[\d.inf]+)/g)].pop()![1]);
  check(`loudness ${lay}`, Math.abs(I + 14) <= 0.5 && TP <= -1.0, `integrated ${I.toFixed(2)} LUFS, true peak ${TP.toFixed(2)} dBTP`);
  check(`no clipping ${lay}`, peakDb < -0.5, `sample peak ${peakDb.toFixed(2)} dBFS`);

  // ---------------------------------------------------------------- 4. loop diff
  const f0 = frameRGB(file, 0, L.width, L.height);
  const fl = frameRGB(file, 1559, L.width, L.height);
  let sum = 0;
  for (let i = 0; i < f0.length; i++) sum += Math.abs(f0[i] - fl[i]);
  const mad = sum / f0.length;
  check(`loop diff ${lay}`, mad < 2, `mean |frame1559 - frame0| = ${mad.toFixed(3)}/255`);

  // ---------------------------------------------------------------- 6. stills
  const times = [0, 3, 8, 14, 20, 22.8, 23.1, 25.9];
  for (const t of times) {
    const n = Math.min(1559, Math.round(t * 60));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `select=eq(n\\,${n})`, '-vsync', '0', '-frames:v', '1',
      path.join(QA, `${lay}_${t.toFixed(1).padStart(4, '0')}s.png`)]);
  }
  // text never touches the frame edges: the outer 40 px border must stay free of bright pixels in every still
  let edgeMax = 0;
  for (const t of times) {
    const n = Math.min(1559, Math.round(t * 60));
    const buf = frameRGB(file, n, L.width, L.height);
    const B = 40;
    for (let y = 0; y < L.height; y++) for (let x = 0; x < L.width; x++) {
      if (x >= B && x < L.width - B && y >= B && y < L.height - B) continue;
      const i = (y * L.width + x) * 3;
      if (n >= 1378 && n <= 1400) continue; // white flash frames
      edgeMax = Math.max(edgeMax, Math.min(buf[i], buf[i + 1], buf[i + 2]));
    }
  }
  check(`no clipped text ${lay}`, edgeMax < 120, `brightest pixel in 40px frame border across QA stills: ${edgeMax}`);
  // counter clearance: ring + bloom at max zoom and pulse stays above the counter box
  const zMax = Math.max(...Array.from({ length: 1560 }, (_, f) => cameraZoom(f)));
  const ringBottom = L.cy + (430 * 1.045 + 30) * zMax * L.sceneScale + 4;
  check(`counter clear of ring ${lay}`, ringBottom < L.counter.top && L.counter.top + L.counter.size * 1.2 <= L.height - L.safe,
    `ring+bloom bottom y=${ringBottom.toFixed(0)} < counter top y=${L.counter.top}; counter bottom ${Math.round(L.counter.top + L.counter.size * 1.2)} <= ${L.height - L.safe}`);
}

// ------------------------------------------------------------------ 3. A/V sync (9x16)
{
  const lay: LayoutName = '9x16';
  const L = LAYOUTS[lay];
  const file = VIDEOS[lay];
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const audio = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const notes = sim.notes as any[];
  const TPL = Math.round(0.12 * 48000);
  const tbuf = fs.readFileSync(path.join(ROOT, '.cache', 'mix', 'templates.f32'));
  const templates = new Float32Array(tbuf.buffer, tbuf.byteOffset, tbuf.byteLength / 4);
  const candidates = notes.map((n, idx) => ({ ...n, idx })).filter((n) => {
    for (const m of notes) if (m.ballId === n.ballId && m.frame < n.frame && m.frame >= n.frame - 3) return false;
    return n.frame < 1340;
  });
  const rng = mulberry32(7);
  const picks: any[] = [];
  const pool = candidates.slice();
  while (picks.length < 10 && pool.length) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  picks.sort((a, b) => a.frame - b.frame);
  // (a) global offset of the final AAC track vs the dry premaster (encoder delay / muxing), by cross-correlation
  const readMono = (f: string) => {
    const b = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
    return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  };
  const PRE = path.join(ROOT, '.cache', 'verify');
  fs.mkdirSync(PRE, { recursive: true });
  const env = { ...process.env };
  execFileSync('npx', ['tsx', 'scripts/mix.ts'], { cwd: ROOT, env: { ...env, MIX_PREMASTER_ONLY: path.join(PRE, 'full.wav') }, stdio: 'ignore' });
  const full = readMono(path.join(PRE, 'full.wav'));
  let gBest = -Infinity, gLag = 0;
  {
    const c0 = 20 * 48000, N = 2 * 48000;
    for (let lag = -2400; lag <= 2400; lag++) {
      let dot = 0;
      for (let i = 0; i < N; i += 2) dot += full[c0 + i] * audio[c0 + i + lag];
      if (dot > gBest) { gBest = dot; gLag = lag; }
    }
  }
  console.log(`  final AAC audio vs premaster offset: ${gLag} samples (${(gLag / 800).toFixed(3)} frames)`);
  let okCount = 0;
  const rows: string[] = [];
  for (const n of picks) {
    // (b) isolate this note exactly: dry mix minus dry mix without it -> first non-zero sample
    const without = path.join(PRE, `minus_${n.frame}_${n.ballId}.wav`);
    execFileSync('npx', ['tsx', 'scripts/mix.ts'], { cwd: ROOT, env: { ...env, MIX_PREMASTER_ONLY: without, MIX_EXCLUDE: `${n.frame}:${n.ballId}` }, stdio: 'ignore' });
    const minus = readMono(without);
    let s0 = -1;
    for (let i = 0; i < full.length; i++) if (Math.abs(full[i] - minus[i]) > 1e-6) { s0 = i; break; }
    fs.rmSync(without);
    // (c) independent matched filter against the final AAC audio (+-4 frames), informational
    const tpl = templates.subarray(n.idx * TPL, (n.idx + 1) * TPL);
    const c = Math.round((n.frame / 60) * 48000);
    let best = -Infinity, bestLag = 0;
    for (let lag = -3200; lag <= 3200; lag++) {
      let dot = 0;
      for (let i = 0; i < TPL; i += 2) dot += audio[c + lag + i] * tpl[i];
      if (dot > best) { best = dot; bestLag = lag; }
    }
    const dAudio = (s0 + gLag) / 800 - n.frame; // onset in the final file, in frames, relative to the note frame
    const mf = bestLag / 800;
    // video: ball patch must be white on the note frame and not white on the frame before
    const patch = (f: number) => {
      const buf = frameRGB(file, f, L.width, L.height);
      const p = sim.pos[f];
      const s = toScreen(L, f, p[2 * n.ballId] / 4, p[2 * n.ballId + 1] / 4, sim.shake[f]);
      let m = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((Math.round(s.y) + dy) * L.width + Math.round(s.x) + dx) * 3;
        m += Math.min(buf[i], buf[i + 1], buf[i + 2]); k++;
      }
      return m / k;
    };
    const on = patch(n.frame), before = patch(n.frame - 1);
    const flashOnset = on >= 200 && before < 200;
    const pass = flashOnset && Math.abs(dAudio) <= 1;
    if (pass) okCount++;
    rows.push(`f${n.frame}(${n.target},ball ${n.ballId}): flash ${before.toFixed(0)}->${on.toFixed(0)}, audio onset ${dAudio >= 0 ? '+' : ''}${dAudio.toFixed(3)} frames (matched filter on AAC: ${mf >= 0 ? '+' : ''}${mf.toFixed(2)})`);
  }
  console.log('  ' + rows.join('\n  '));
  check('A/V sync (10 random notes)', okCount === picks.length && picks.length === 10, `${okCount}/${picks.length} notes: white flash starts on the note frame and audio onset within 1 frame`);
}

// ------------------------------------------------------------------ 5. ball count curve
{
  const target: [number, number][] = [[6, 10], [12, 50], [18, 200], [22.5, sim.meta.nFull]];
  const rows = target.map(([t, c]) => {
    const got = sim.counts[Math.round(t * 60)];
    return { t, c, got, err: (got - c) / c };
  });
  check('ball count curve', rows.every((r) => Math.abs(r.err) <= 0.2),
    rows.map((r) => `${r.t}s: ${r.got} vs ${Math.round(r.c)} (${(r.err * 100).toFixed(1)}%)`).join(', ') +
    `; visual fill @22.5s ${(sim.meta.fill.visual * 100).toFixed(1)}%`);
  check('balls stay inside ring', sim.meta.maxExtent <= sim.meta.ring.inner + 0.5,
    `max centre distance + radius = ${sim.meta.maxExtent.toFixed(2)}px, ring inner edge ${sim.meta.ring.inner}px`);
}

// ------------------------------------------------------------------ 7. note density
{
  const fr = (sim.notes as any[]).map((n) => n.frame);
  let maxWin = 0;
  for (let s = 0; s < 1560; s++) maxWin = Math.max(maxWin, fr.filter((f) => f >= s && f < s + 60).length);
  check('note onsets per second', maxWin <= 14, `max ${maxWin} onsets in any 1-second window (${fr.length} notes total)`);
}

const failed = results.filter((r) => !r.pass);
fs.writeFileSync(path.join(QA, 'report.json'), JSON.stringify({ results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
