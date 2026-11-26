#!/usr/bin/env bash
# Render both formats: H.264 CRF 16, AAC 320 kbps (mix.wav baked in).
set -euo pipefail
cd "$(dirname "$0")/.."
BE="${REMOTION_BROWSER:-/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell}"
BROWSER_ARGS=()
[ -x "$BE" ] && BROWSER_ARGS=(--browser-executable="$BE")
COMMON=(--codec=h264 --crf=16 --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=320k --x264-preset=slow "${BROWSER_ARGS[@]}")
ONLY="${1:-all}"
if [ "$ONLY" = all ] || [ "$ONLY" = 9x16 ]; then
  npx remotion render src/index.ts OneBall9x16 out/one-ball-9x16.mp4 "${COMMON[@]}"
fi
if [ "$ONLY" = all ] || [ "$ONLY" = 1x1 ]; then
  npx remotion render src/index.ts OneBall1x1 out/one-ball-1x1.mp4 "${COMMON[@]}"
fi
