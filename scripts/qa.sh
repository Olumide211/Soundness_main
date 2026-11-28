#!/usr/bin/env bash
# QA: audio streams, black frames, scene cuts, mid-reaction stills.
set -u
for f in out/orb-test-9x16.mp4 out/orb-test-4x5.mp4; do
  [ -f "$f" ] || { echo "MISSING $f"; continue; }
  echo "=== $f"
  ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_frames -show_entries format=duration -of compact "$f"
  na=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$f" | wc -l)
  echo "audio streams: $na"
  echo "-- blackdetect:"
  ffmpeg -hide_banner -nostats -i "$f" -vf blackdetect=d=0.01:pix_th=0.10 -an -f null - 2>&1 | grep -c black_start | sed 's/^/black segments: /'
  echo "-- scene cuts gt(scene,0.3) (frame@30fps):"
  ffmpeg -hide_banner -nostats -i "$f" -vf "select='gt(scene,0.3)',metadata=print" -an -f null - 2>&1 | grep -o "pts_time:[0-9.]*" | while read l; do t=${l#pts_time:}; fr=$(python3 -c "print(round($t*30))"); python3 -c "
f=$fr
if f<60: print(f'  frame {f}: INTRO')
elif f>=924: print(f'  frame {f}: OUTRO')
else:
  i=(f-60)//108; t=(f-60)%108
  tag='WHIP' if (t>=100 or t<12) else 'MID-SEGMENT'
  print(f'  frame {f}: seg {i+1} t={t} -> {tag}')
"; done
done
