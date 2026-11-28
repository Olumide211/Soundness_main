# PAPER PLANE

A 12-second cinematic 3D piece built with Remotion + `@remotion/three` (React Three Fiber).
A printed A4 sheet folds itself into a dart on a walnut table at the edge of a rooftop, launches
off the table into a dusk city, swoops past the skyline, lands on a stone ledge, skids, unfolds and
flips photo-side up while the camera rises to top-down.

## Outputs

| File | Format |
| --- | --- |
| `out/paper-plane-4x5.mp4` | 1080×1350, 30 fps, 360 frames, H.264 CRF 16, no audio |
| `out/paper-plane-9x16.mp4` | 1080×1920, 30 fps, 360 frames, H.264 CRF 16, no audio |
| `out/qa/` | QA stills (f15, 90, 170, 200, 230, 265, 300, 340, 355) + edge-check strips |

## Render + QA

```bash
npm install
npx remotion render src/index.ts PaperPlane4x5  out/paper-plane-4x5.mp4  --muted --crf=16 --gl=swangle
npx remotion render src/index.ts PaperPlane9x16 out/paper-plane-9x16.mp4 --muted --crf=16 --gl=swangle
npx tsx scripts/check-margins.ts            # paper vs 72 px safe margin, every frame, both formats
npx tsx scripts/check-margins.ts 220        # + on-screen size of the BreezeOg wordmark
./verify.sh                                 # audio, scene cuts, black frames, stills -> out/qa
```

## How it works

- `src/paper/folding.ts`: the sheet is a 96×136-segment plane (front + back face 0.25 mm apart,
  plus an edge strip). Each fold is a crease line; vertices on the moving side bend around a small
  crease cylinder and follow a curl, composed in folding order (center crease → [sheet turns over]
  → corners → edges → half fold → wings). A ±1.5 mm micro-bend field is applied to the *folded*
  positions so stacked layers never intersect. Crease maps add a thin AO line + highlight ridge.
- `src/paper/textures.ts`: photo multiplied into the paper albedo at 92 % (grain shows through,
  desaturated edges); back with the 4 % "BreezeOg" wordmark placed on the outer face of one wing.
- `src/timeline.ts`: fold timing (ease-in-out + 2-frame overshoot), flight path, banking, landing
  skid, end flip, and one continuous camera rig (35 mm lens) with smoothing.
- `src/world/*`: instanced dusk city (districts, downtown skyline, window grids with flicker, river,
  car-light points), sky gradient, far-only haze, walnut table / concrete decks / limestone ledge.
- `src/Scene.tsx`: shadowed warm key light, DOF, bloom (windows + afterglow only), ACES, grain,
  vignette, end titles.
