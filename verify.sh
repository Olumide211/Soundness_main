#!/usr/bin/env bash
# Verification: audio streams, frame count, black/empty frames, QA stills from the encoded videos.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p qa
FRAMES=(15 75 135 170 220 260 300 355)
for f in out/paper-plane-4x5.mp4 out/paper-plane-9x16.mp4; do
  name=$(basename "$f" .mp4)
  audio=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$f" | wc -l)
  info=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=codec_name,width,height,r_frame_rate,nb_read_frames,pix_fmt -of csv=p=0 "$f")
  black=$(ffmpeg -hide_banner -i "$f" -vf "blackdetect=d=0.03:pix_th=0.06" -an -f null - 2>&1 | grep -c black_start || true)
  # darkest / flattest frame (YAVG + YDIF variance proxy)
  stats=$(ffmpeg -hide_banner -i "$f" -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG" -an -f null - 2>&1 | grep -o "YAVG=[0-9.]*" | cut -d= -f2 | sort -n | head -1)
  echo "$name: video[$info] audio_streams=$audio black_segments=$black min_frame_luma=$stats"
  for n in "${FRAMES[@]}"; do
    ffmpeg -loglevel error -y -i "$f" -vf "select=eq(n\,$n)" -frames:v 1 "qa/${name}-f$(printf %03d "$n").png"
  done
done
