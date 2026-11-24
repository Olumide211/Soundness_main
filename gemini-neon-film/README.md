# Gemini 4 Neon · concept film (Remotion)

28.6 s · 858 frames · 30 fps · two formats from one edit:

| file | size | composition id |
|---|---|---|
| `out/gemini-neon-16x9.mp4` | 1920×1080 | `GeminiNeon16x9` |
| `out/gemini-neon-9x16.mp4` | 1080×1920 | `GeminiNeon9x16` |

H.264, yuv420p, CRF 16. Silent masters above; the finals with the mixed soundtrack (cloned VO + licensed track, AAC 320 kbps, −14 LUFS) are:

| file | size |
|---|---|
| `out/gemini-neon-16x9-final.mp4` | 1920×1080 |
| `out/gemini-neon-9x16-final.mp4` | 1080×1920 |

The audio pipeline (local voice clone with F5-TTS, music edit, mix, checks) is documented in
[`AUDIO.md`](AUDIO.md) (copy of `public/gemini-neon-pack/audio/README.md`); logs are in `audio-log/`.

## Setup (once)

```bash
npm install
# unzip all gemini-neon-pack_0X zips into public/  →  public/gemini-neon-pack/...
# the app recording goes to public/gemini-neon-pack/screen/gemini-app.mp4
npm run prep      # fonts → public/fonts, CFR copy of the phone recording, detects ai/S07.mp4 + ai/S22.mp4
```

Remotion only serves files from `public/`, so the pack lives at `public/gemini-neon-pack`.
If you later drop AI shots in `public/gemini-neon-pack/ai/S07.mp4` or `ai/S22.mp4`, re-run `npm run prep` and they replace the still-image stand-ins automatically.

## Nudging the cuts to your music: `src/edl.ts`

All timing lives in one table, in **seconds**:

```ts
{id: 'S09', file: clip('S09_match-strike_A'), in: 1.0, start: 7.4, end: 8.4, sub: 'until you give it a charge.', ...},
{id: 'S10', file: clip('S10_plasma_A'),       in: 0.0, start: 8.4, end: 9.2, ...},
```

- **Move a cut**: change the `end` of one shot and the `start` of the next by the same amount.
  1 frame = 1/30 s ≈ `0.0333`, 2 frames ≈ `0.0667`.
- **Slip a shot's content** (same cut, different moment of the clip): change `in`.
- **Subtitles** follow their shot automatically. `"a / b"` splits the shot into two halves.
- `blackBefore: 2` on S07 and END inserts 2 black frames, taken from the end of the previous shot.
- `crop916` is the 9:16 crop centre for each clip (0 = left edge of the source, 1 = right).
- `push` is the slow in-shot push-in (`from` → `to`, origin `ox`/`oy` in %).
- Keep the last shot's `end` at `28.6` (or change `DURATION` too).
- S23 uses the real app recording: `in` is seconds into the recording, and `rate: 5` is the 5× answer stream.

Preview live while you tweak: `npm run studio`.

## Re-render

```bash
npm run stills    # check stills of both formats → out/stills/ (0.5, 5.8, 9.9, 15, 22.3, 24.5, 26.5 s)
npm run render    # both MP4s (or render:16x9 / render:9x16)
npm run verify    # ffprobe the silent masters: size, 30 fps, 858 frames, 28.6 s, no audio
npm run mux       # add audio/final-mix.wav → out/*-final.mp4 (see AUDIO.md for the audio steps)
```

The grain, weave and flicker are seeded, so every render is identical frame for frame.

## Project layout

```
src/edl.ts            ← every cut, in-point, subtitle, crop, push-in
src/Film.tsx          ← assembles shots, grade, subtitles, end card
src/shots/            ← VideoShot, ImageShot (S07/S22 stand-ins + flicker), AppShot (S23), Subtitles, EndCard, ShotFrame (push-in + weave)
src/fx/               ← Grade (B&W, crushed blacks, S-curve, hot highlights, 8 % sepia), Grain (seeded per frame), Vignette (25 %), weave (1 px)
scripts/              ← prep / stills / verify
out/                  ← renders
```

## Look notes

- One shared SVG grade filter on every shot, including the app recording. S22 alone keeps 15 % saturation (red-orange neon teaser).
- Grain: new seed every frame, overlay blend (blacks stay at 0), about 6 % in the midtones.
- The end-card spark (`brand/gemini_spark_2048.png`) sits outside the grade, grain and vignette. It is shown unmodified, with an opacity fade only, and is the only colour in the film.
- "Gemini 4 Neon" is plain Geist Medium text, not Google's wordmark.
- The phone recording is cropped (status bar off, top 4 %). Only its upper part is used, so the keyboard never shows. Part 1 is the model picker at 0:13.1 with a 1.00 → 1.12 push toward "4 Neon ✓". Part 2 is 0:22.8 → 0:27.3 at 5×.
- Credits: paste `CREDITS.txt` into the post caption (S05 lightning, NeTube, Neon discharge tube need attribution).
