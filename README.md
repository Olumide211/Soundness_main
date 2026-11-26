# ONE BALL

Oddly-satisfying physics + music loop, built with Remotion. 26 s, 60 fps, 1080x1920 + 1080x1080.

```
npm install
npm run samples    # fetch the CC0 VCSL samples (sparse git clone)
npm run simulate   # deterministic physics -> src/data/sim.json (auto-tunes the ball-count curve)
npm run mix        # offline mix from real samples -> public/audio/mix.wav + out/one-ball.mid
npm run render     # out/one-ball-9x16.mp4, out/one-ball-1x1.mp4 (H.264 CRF 16, AAC 320k)
npm run verify     # all QA checks + stills in ./qa, report in qa/report.json
```

Remotion only reads `src/data/sim.json`; nothing is simulated at render time. See CREDITS.md.
