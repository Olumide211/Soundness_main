// §14 automated checks.  usage:
//   node scripts/check.mjs ffprobe out/*.mp4            -> review/ffprobe.txt
//   node scripts/check.mjs loop <dir with f0,f1,f1198,f1199.png>  -> review/loop.txt
//   node scripts/check.mjs pops <lowres-grainless.mp4>  -> review/pops.txt
//   node scripts/check.mjs determinism <a.png> <b.png>  -> review/determinism.txt
//   node scripts/check.mjs grep                         -> forbidden-API scan of src/
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [, , cmd, ...args] = process.argv;
fs.mkdirSync('review', {recursive: true});
const sh = (bin, a, opts = {}) => execFileSync(bin, a, {maxBuffer: 1 << 30, ...opts});

function rgb(file) {
  const probe = JSON.parse(sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]).toString()).streams[0];
  const buf = sh('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return {w: probe.width, h: probe.height, buf};
}
function meanAbs(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

if (cmd === 'ffprobe') {
  const lines = [];
  let ok = true;
  for (const f of args) {
    const j = JSON.parse(sh('ffprobe', ['-v', 'error', '-count_packets', '-show_entries', 'stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_frames,nb_read_packets,pix_fmt', '-of', 'json', f]).toString());
    const v = j.streams.filter((s) => s.codec_type === 'video');
    const a = j.streams.filter((s) => s.codec_type === 'audio');
    const audioCli = sh('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', f]).toString().trim();
    const s = v[0];
    const expectFrames = /credit/.test(f) ? 1275 : 1200;
    const expectH = /9x16/.test(f) ? 1920 : 1080;
    const pass = s.width === 1080 && s.height === expectH && s.r_frame_rate === '30/1' && Number(s.nb_frames) === expectFrames && s.codec_name === 'h264' && s.pix_fmt === 'yuv420p' && a.length === 0 && audioCli === '';
    ok &&= pass;
    lines.push(`${path.basename(f)}: ${s.width}x${s.height} ${s.r_frame_rate} nb_frames=${s.nb_frames} packets=${s.nb_read_packets} ${s.codec_name} ${s.pix_fmt} audio_streams=${a.length} audio_probe="${audioCli}" -> ${pass ? 'PASS' : 'FAIL'}`);
  }
  lines.push(ok ? 'ALL PASS' : 'FAILURES PRESENT');
  fs.writeFileSync('review/ffprobe.txt', lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  process.exit(ok ? 0 : 1);
}

if (cmd === 'loop') {
  const d = args[0];
  const F = (n) => rgb(path.join(d, `f${n}.png`)).buf;
  const f0 = F(0), f1 = F(1), f1198 = F(1198), f1199 = F(1199);
  const seam = meanAbs(f1199, f0);
  const motion = meanAbs(f1198, f1199);
  const motion01 = meanAbs(f0, f1);
  const pass1 = seam < 3;
  const pass2 = seam <= 1.5 * motion;
  const txt = [
    'Loop check (grain off), mean |diff| per channel in 0-255 units',
    `|f1199 - f0|    = ${seam.toFixed(4)}  (must be < 3.0)        -> ${pass1 ? 'PASS' : 'FAIL'}`,
    `|f1198 - f1199| = ${motion.toFixed(4)}`,
    `|f0 - f1|       = ${motion01.toFixed(4)} (reference)`,
    `seam <= 1.5 x normal motion: ${seam.toFixed(4)} <= ${(1.5 * motion).toFixed(4)} -> ${pass2 ? 'PASS' : 'FAIL'}`,
    pass1 && pass2 ? 'LOOP PASS' : 'LOOP FAIL',
  ].join('\n');
  fs.writeFileSync('review/loop.txt', txt + '\n');
  console.log(txt);
  process.exit(pass1 && pass2 ? 0 : 1);
}

if (cmd === 'pops') {
  const {w, h, buf} = rgb(args[0]);
  const fs_ = w * h * 3;
  const n = buf.length / fs_;
  const diffs = [];
  for (let i = 1; i < n; i++) diffs.push(meanAbs(buf.subarray((i - 1) * fs_, i * fs_), buf.subarray(i * fs_, (i + 1) * fs_)));
  // wrap-around diff (1199 -> 0)
  const wrap = meanAbs(buf.subarray((n - 1) * fs_, n * fs_), buf.subarray(0, fs_));
  const all = [wrap, ...diffs]; // all[k] = diff between frame k-1 and k (k=0 is the wrap)
  const flags = [];
  for (let k = 0; k < all.length; k++) {
    const nb = [];
    for (let j = -8; j <= 8; j++) if (j !== 0) nb.push(all[(k + j + all.length) % all.length]);
    nb.sort((a, b) => a - b);
    const med = (nb[7] + nb[8]) / 2;
    if (all[k] > 4 * Math.max(med, 0.05) && all[k] > 0.6) flags.push({frame: k, diff: all[k], med});
  }
  const bad = flags.filter((x) => !(x.frame >= 330 && x.frame <= 331));
  const lines = [`Pop/cut detector on ${args[0]} (${w}x${h}, ${n} frames). Rule: diff > 4x median of +-8 neighbours (and > 0.6 abs). Allowed: 330 (impact).`,
    `wrap 1199->0 diff = ${wrap.toFixed(3)}`,
    ...flags.map((x) => `frame ${x.frame}: diff ${x.diff.toFixed(3)} vs median ${x.med.toFixed(3)}${x.frame >= 330 && x.frame <= 331 ? ' (allowed: impact)' : ' <-- FLAG'}`),
    bad.length === 0 ? 'NO POPS - PASS' : `${bad.length} FLAGS - FAIL`,
    '', 'per-frame diffs:', all.map((d, k) => `${k} ${d.toFixed(3)}`).join('\n')];
  fs.writeFileSync('review/pops.txt', lines.join('\n') + '\n');
  console.log(lines.slice(0, flags.length + 3).join('\n'));
  process.exit(bad.length ? 1 : 0);
}

if (cmd === 'determinism') {
  const a = fs.readFileSync(args[0]), b = fs.readFileSync(args[1]);
  const same = a.equals(b);
  const txt = `frame 700 rendered twice in separate processes (grain on): ${a.length} vs ${b.length} bytes -> ${same ? 'BYTE-IDENTICAL PASS' : 'DIFFERENT FAIL'}`;
  fs.appendFileSync('review/determinism.txt', txt + '\n');
  console.log(txt);
  process.exit(same ? 0 : 1);
}

if (cmd === 'grep') {
  let out = '';
  try { out = sh('grep', ['-rnE', 'Math\\.random|Date\\.now|performance\\.now', 'src']).toString(); } catch { out = ''; }
  const txt = `forbidden API scan (Math.random|Date.now|performance.now) in src/: ${out.trim() ? '\n' + out : 'none found - PASS'}`;
  fs.appendFileSync('review/determinism.txt', txt + '\n');
  console.log(txt);
  process.exit(out.trim() ? 1 : 0);
}
console.log('unknown command');
process.exit(2);
