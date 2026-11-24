// Adds audio/final-mix.wav to the silent renders → out/gemini-neon-*-final.mp4
// Video stream is copied bit-for-bit (no re-encode); audio → AAC 320 kbps, 48 kHz stereo.
import {execFileSync} from 'node:child_process';

const mix = 'public/gemini-neon-pack/audio/final-mix.wav';
for (const f of ['16x9', '9x16']) {
  const out = `out/gemini-neon-${f}-final.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `out/gemini-neon-${f}.mp4`, '-i', mix,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    '-t', '28.6', '-movflags', '+faststart', out], {stdio: 'inherit'});
  console.log('wrote', out);
}
