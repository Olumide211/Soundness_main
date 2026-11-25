#!/usr/bin/env bash
# Renders the 4 deliverables. Each loop is rendered once as a lossless PNG sequence; the credit versions reuse
# those 1200 frames + the 75 tail frames rendered from the *Credit composition (frames < 1200 are identical).
# usage: REMOTION_GL=swangle CONC=3 bash scripts/render.sh [square|vertical|all]
set -euo pipefail
cd "$(dirname "$0")/.."
GL=${REMOTION_GL:-angle}; CONC=${CONC:-2}; WHAT=${1:-all}
enc() { # in_pattern out start
  ffmpeg -v error -y -framerate 30 -start_number "$3" -i "$1" -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -r 30 -an -movflags +faststart "$2"
}
one() { # comp tag
  local comp=$1 tag=$2
  mkdir -p out/seq_$tag out/seq_${tag}_credit out/seq_${tag}_all
  npx remotion render "$comp" out/seq_$tag --sequence --image-format=png --image-sequence-pattern='f[frame].[ext]' --gl=$GL --concurrency=$CONC --log=error
  npx remotion render "${comp}Credit" out/seq_${tag}_credit --sequence --frames=1200-1274 --image-format=png --image-sequence-pattern='f[frame].[ext]' --gl=$GL --concurrency=$CONC --log=error
  for f in out/seq_$tag/*.png out/seq_${tag}_credit/*.png; do ln -sf "$(realpath "$f")" out/seq_${tag}_all/; done
}
if [[ $WHAT == square || $WHAT == all ]]; then
  one HelloSquare sq
  enc 'out/seq_sq/f%04d.png' out/hello-loop-1x1.mp4 0
  enc 'out/seq_sq_all/f%04d.png' out/hello-1x1-credit.mp4 0
fi
if [[ $WHAT == vertical || $WHAT == all ]]; then
  one HelloVertical v
  enc 'out/seq_v/f%04d.png' out/hello-loop-9x16.mp4 0
  enc 'out/seq_v_all/f%04d.png' out/hello-9x16-credit.mp4 0
fi
ls -la out/*.mp4
