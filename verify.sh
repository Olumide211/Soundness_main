#!/usr/bin/env bash
# QA: audio streams, frame count, scene cuts, black frames, QA stills and edge-check strips.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out/qa/edge
FRAMES=(15 90 170 200 230 265 300 340 355)
for f in out/paper-plane-4x5.mp4 out/paper-plane-9x16.mp4; do
  name=$(basename "$f" .mp4)
  audio=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$f" | wc -l)
  info=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=codec_name,width,height,r_frame_rate,nb_read_frames,pix_fmt -of csv=p=0 "$f")
  cuts=$(ffmpeg -hide_banner -i "$f" -vf "select='gt(scene,0.25)',showinfo" -an -f null - 2>&1 | grep -c "pts_time" || true)
  maxscene=$(ffmpeg -hide_banner -i "$f" -vf "select='gte(scene,0)',metadata=print" -an -f null - 2>&1 | grep -o "scene_score=[0-9.]*" | cut -d= -f2 | sort -g | tail -1)
  black=$(ffmpeg -hide_banner -i "$f" -vf "blackdetect=d=0.03:pix_th=0.06" -an -f null - 2>&1 | grep -c black_start || true)
  luma=$(ffmpeg -hide_banner -i "$f" -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG" -an -f null - 2>&1 | grep -o "YAVG=[0-9.]*" | cut -d= -f2 | sort -n | head -1)
  echo "$name: video[$info] audio_streams=$audio scene_cuts(gt 0.25)=$cuts max_scene_score=$maxscene black_segments=$black min_frame_luma=$luma"
  for n in "${FRAMES[@]}"; do
    ffmpeg -loglevel error -y -i "$f" -vf "select=eq(n\,$n)" -frames:v 1 "out/qa/${name}-f$(printf %03d "$n").png"
  done
  # edge check strip: every 10th frame from 200 to 300 with the 72px safe margin drawn in red
  ffmpeg -loglevel error -y -i "$f" -vf "select='between(n\,200\,300)*not(mod(n\,10))',drawbox=x=72:y=72:w=iw-144:h=ih-144:color=red@0.8:t=3,scale=270:-2,tile=11x1" -frames:v 1 "out/qa/edge/${name}-f200-300.png"
done
