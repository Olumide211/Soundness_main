#!/usr/bin/env python3
"""Polish-pass verification (scene cuts, near-black, loop seam, audio streams).

usage: python3 scripts/qa.py report.txt loop.mp4 [other.mp4 ...]
  - scene detection: ffmpeg select='gt(scene,0.25)' on the loop file -> must be 0 hits
  - near-black: no frame with > 60 % of pixels at luma < 0.06 (Rec.709 luma of the decoded sRGB values)
  - loop seam: mean |frame1199 - frame0| over all pixels/channels, in /255 units -> must be < 2
  - ffprobe: 0 audio streams on every file given
"""
import json, subprocess, sys
import numpy as np

out, loop, others = sys.argv[1], sys.argv[2], sys.argv[3:]
lines, ok = [], True

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

# ffprobe
for v in [loop] + others:
    j = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', v]).stdout)
    vs = [s for s in j['streams'] if s['codec_type'] == 'video'][0]
    na = sum(1 for s in j['streams'] if s['codec_type'] == 'audio')
    nb = run(['ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', v]).stdout.strip()
    good = na == 0
    ok &= good
    lines.append(f"ffprobe {v.split('/')[-1]}: {vs['width']}x{vs['height']} {vs['r_frame_rate']} frames={nb} {vs['codec_name']} {vs['pix_fmt']} audio_streams={na} -> {'PASS' if good else 'FAIL'}")

# scene detection
r = run(['ffmpeg', '-hide_banner', '-i', loop, '-vf', "select='gt(scene,0.25)',metadata=print", '-an', '-f', 'null', '-'])
hits = []
for ln in r.stderr.splitlines():
    if 'pts_time:' in ln:
        t = float(ln.split('pts_time:')[1].split()[0]); hits.append(round(t * 30))
scores = []
for ln in r.stderr.splitlines():
    if 'lavfi.scene_score=' in ln: scores.append(float(ln.split('=')[1]))
ok &= len(hits) == 0
lines.append(f"scene detection gt(scene,0.25) on {loop.split('/')[-1]}: {len(hits)} hits {hits} -> {'PASS' if not hits else 'FAIL'}")
# top scene scores for the record
r2 = run(['ffmpeg', '-hide_banner', '-i', loop, '-vf', "scale=270:-2,select='gte(scene,0)',metadata=print", '-an', '-f', 'null', '-'])
sc, cur = [], None
for ln in r2.stderr.splitlines():
    if 'pts_time:' in ln: cur = round(float(ln.split('pts_time:')[1].split()[0]) * 30)
    if 'lavfi.scene_score=' in ln and cur is not None: sc.append((float(ln.split('=')[1]), cur))
sc.sort(reverse=True)
lines.append('  highest scene scores: ' + ', '.join(f'f{f}={s:.3f}' for s, f in sc[:6]))

# near-black + seam (decode once at 270 px wide for near-black; full res for the seam)
probe = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', loop]).stdout)['streams'][0]
W, H = 270, int(round(270 * probe['height'] / probe['width'] / 2) * 2)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', loop, '-vf', f'scale={W}:{H}:flags=area', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], capture_output=True).stdout
a = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32) / 255
y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
frac = (y < 0.06).mean(axis=(1, 2))
bad = [i for i, v in enumerate(frac) if v > 0.6]
ok &= not bad
lines.append(f"near-black (>60% px luma<0.06): {len(bad)} frames {bad[:40]} (max fraction {frac.max():.3f} at f{int(frac.argmax())}) -> {'PASS' if not bad else 'FAIL'}")

def frame(n):
    b = subprocess.run(['ffmpeg', '-v', 'error', '-i', loop, '-vf', f"select='eq(n,{n})'", '-vsync', '0', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], capture_output=True).stdout
    return np.frombuffer(b, np.uint8).reshape(probe['height'], probe['width'], 3).astype(np.float32)
f0, f1198, f1199 = frame(0), frame(1198), frame(1199)
seam = np.abs(f1199 - f0).mean(); prev = np.abs(f1199 - f1198).mean()
ok &= seam < 2
lines.append(f"loop seam mean|f1199-f0| = {seam:.3f}/255 (f1198->f1199 = {prev:.3f}) -> {'PASS' if seam < 2 else 'FAIL'}")
lines.append('ALL PASS' if ok else 'SOME CHECKS FAILED')
open(out, 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
