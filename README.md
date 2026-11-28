# PAPER PLANE

A 12-second cinematic 3D piece built with Remotion + `@remotion/three` (React Three Fiber).
A printed A4 sheet folds itself into a dart plane with real crease geometry, launches off a
rooftop, glides over a procedural golden-hour city, lands on a ledge and unfolds again.

## Outputs

| File | Format |
| --- | --- |
| `out/paper-plane-4x5.mp4` | 1080×1350, 30 fps, 360 frames, H.264 CRF 16, no audio |
| `out/paper-plane-9x16.mp4` | 1080×1920, 30 fps, 360 frames, H.264 CRF 16, no audio |

## Render

```bash
npm install
BX=/path/to/chrome-headless-shell   # optional, any Chromium works
npx remotion render src/index.ts PaperPlane4x5  out/paper-plane-4x5.mp4  --muted --crf=16 --gl=swangle
npx remotion render src/index.ts PaperPlane9x16 out/paper-plane-9x16.mp4 --muted --crf=16 --gl=swangle
node scripts-stills.mjs PaperPlane4x5 qa 15 75 135 170 220 260 300 355   # QA stills
```

The front print is `public/paper.jpg` (cover-cropped). Fonts: Inter (bundled in `public/fonts`).

## How it works

- `src/paper/folding.ts` – the sheet is a 96×136-segment plane (front + back face 0.6 mm apart,
  plus an edge strip). Each fold is a crease line; vertices on the moving side are bent around a
  small crease cylinder and then follow a curl, composed in folding order (center crease → corners →
  edges → wings → half fold). No morph targets. Crease maps accumulate per fold and darken the print.
- `src/timeline.ts` – fold timing (overshoot/settle easing), flight path (time-based Hermite
  spline), banking from yaw rate, and a single continuous spherical camera rig with smoothing.
- `src/world/*` – instanced procedural city (~15k buildings, procedural window shader with
  random lit windows and sky reflections), landmark towers with blinking aviation lights, moving
  car light trails, sky gradient + sun, noise-billboard clouds, height haze, and a procedural HDRI
  (PMREM of the sky) for reflections.
- `src/Scene.tsx` – lights, DOF, bloom, ACES tone mapping, vignette, film grain, end title.
