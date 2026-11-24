// Verifies the final MP4s with ffprobe: resolution, 30 fps, 858 frames, 28.6 s, no audio.
import {execFileSync} from 'node:child_process';

const expect = [
  ['out/gemini-neon-16x9.mp4', 1920, 1080],
  ['out/gemini-neon-9x16.mp4', 1080, 1920],
];
let ok = true;
for (const [file, w, h] of expect) {
  const j = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]).toString(),
  );
  const v = j.streams.filter((s) => s.codec_type === 'video');
  const a = j.streams.filter((s) => s.codec_type === 'audio');
  const s = v[0];
  const dur = Number(j.format.duration);
  const checks = {
    'one video stream': v.length === 1,
    'no audio stream': a.length === 0,
    [`codec h264`]: s.codec_name === 'h264',
    [`pix_fmt yuv420p`]: s.pix_fmt === 'yuv420p',
    [`size ${w}x${h}`]: s.width === w && s.height === h,
    'fps 30': s.r_frame_rate === '30/1' && s.avg_frame_rate === '30/1',
    'frames 858': Number(s.nb_read_frames) === 858,
    'duration 28.6 s': Math.abs(dur - 28.6) < 0.02,
  };
  console.log(`\n${file}  (${s.codec_name} ${s.pix_fmt} ${s.width}x${s.height} ${s.r_frame_rate} frames=${s.nb_read_frames} dur=${dur}s audio=${a.length})`);
  for (const [k, pass] of Object.entries(checks)) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${k}`);
    ok &&= pass;
  }
}
console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
