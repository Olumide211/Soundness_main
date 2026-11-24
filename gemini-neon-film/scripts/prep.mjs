// Prepares derived assets. Safe to re-run; skips work that is already done.
//  1. copies Geist Medium into public/fonts
//  2. converts the VFR phone recording to a CFR 30 fps, silent working copy
//     (frame-accurate seeking with <OffthreadVideo>)
//  3. writes src/available.json: which optional AI shots exist (ai/S07.mp4, ai/S22.mp4)
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const pub = path.join(root, 'public');
const pack = path.join(pub, 'gemini-neon-pack');

if (!fs.existsSync(pack)) {
  console.error(`Missing ${pack}. Unzip the pack into public/ first (see README).`);
  process.exit(1);
}

// 1. fonts
const fontDir = path.join(pub, 'fonts');
fs.mkdirSync(fontDir, {recursive: true});
const fontSrc = path.join(root, 'node_modules/geist/dist/fonts/geist-sans/Geist-Medium.woff2');
const fontDst = path.join(fontDir, 'Geist-Medium.woff2');
if (!fs.existsSync(fontDst)) fs.copyFileSync(fontSrc, fontDst);

// 2. CFR copy of the screen recording
const scrIn = path.join(pack, 'screen/gemini-app.mp4');
const scrOut = path.join(pack, 'screen/gemini-app-cfr30.mp4');
if (!fs.existsSync(scrOut) || fs.statSync(scrOut).mtimeMs < fs.statSync(scrIn).mtimeMs) {
  console.log('Converting screen recording to CFR 30 fps …');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', scrIn, '-an', '-vf', 'fps=30',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p',
    '-g', '15', scrOut], {stdio: 'inherit'});
}

// 3. optional AI shots
const available = {
  S07: fs.existsSync(path.join(pack, 'ai/S07.mp4')),
  S22: fs.existsSync(path.join(pack, 'ai/S22.mp4')),
};
fs.writeFileSync(path.join(root, 'src/available.json'), JSON.stringify(available, null, 2) + '\n');
console.log('prep done', available);
