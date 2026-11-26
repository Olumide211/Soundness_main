#!/usr/bin/env bash
# Fetch the subset of the CC0 Versilian Community Sample Library (VCSL) used by ONE BALL.
# https://github.com/sgossner/VCSL  (CC0 1.0)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLONE="${VCSL_CLONE:-$ROOT/.cache/vcsl}"
DEST="$ROOT/assets/vcsl"
if [ ! -d "$CLONE/.git" ]; then
  mkdir -p "$(dirname "$CLONE")"
  git clone --filter=blob:none --no-checkout --depth 1 https://github.com/sgossner/VCSL.git "$CLONE"
fi
cd "$CLONE"
git sparse-checkout set --no-cone \
  "/LICENSE" "/README.md" \
  "/Idiophones/Struck Idiophones/Marimba/" \
  "/Idiophones/Struck Idiophones/Glockenspiel/" \
  "/Idiophones/Struck Idiophones/Vibraphone/Bowed/Vibes_bowed_D4*" \
  "/Idiophones/Struck Idiophones/Vibraphone/Bowed/Vibes_bowed_A2*" \
  "/Idiophones/Struck Idiophones/Vibraphone/Bowed/Vibes_bowed_A4*" \
  "/Idiophones/Struck Idiophones/Hand Chimes/sus_D*" \
  "/Idiophones/Struck Idiophones/Hand Chimes/sus_A4*"
git checkout -q
mkdir -p "$DEST"/{marimba,glockenspiel,bowed_vibes,hand_chimes}
cp "Idiophones/Struck Idiophones/Marimba/"*.wav "$DEST/marimba/"
cp "Idiophones/Struck Idiophones/Glockenspiel/"*.wav "$DEST/glockenspiel/"
cp "Idiophones/Struck Idiophones/Vibraphone/Bowed/"*.wav "$DEST/bowed_vibes/"
cp "Idiophones/Struck Idiophones/Hand Chimes/"*.wav "$DEST/hand_chimes/"
cp LICENSE "$DEST/LICENSE-VCSL.txt"
echo "VCSL samples ready in $DEST"; find "$DEST" -name '*.wav' | wc -l
