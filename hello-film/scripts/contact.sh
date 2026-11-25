#!/usr/bin/env bash
# usage: scripts/contact.sh <video> <outdir> [width]  -> 8 era contact sheets (10 frames each, 5x2)
set -e
v=$1; o=$2; w=${3:-360}; mkdir -p "$o"
eras=("01_cave 0 120" "02_papyrus 120 240" "03_press 240 390" "04_telegraph 390 540" "05_phone 540 690" "06_post 690 840" "07_chat 840 1020" "08_return 1020 1200")
for e in "${eras[@]}"; do set -- $e; n=$1; a=$2; b=$3; s=$(( (b - a) / 10 ))
  ffmpeg -v error -y -i "$v" -vf "select='between(n,$a,$((b-1)))*not(mod(n-$a,$s))',scale=$w:-1,tile=5x2" -frames:v 1 "$o/era_$n.png"; done
