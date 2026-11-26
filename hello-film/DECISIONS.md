# DECISIONS

Every place where the prompt was ambiguous, contradicted itself or the storyboards, or could not be met on this
build machine, with the choice made and why. "Prompt" = `PROMPT.md` (the v2 build prompt).

## Build environment
- **Linux, no GPU.** The prompt targets Windows + `--gl=angle`. This container is a GPU-less Linux box, so every
  still and video here was rendered with `--gl=swangle` (SwiftShader, the prompt's own documented fallback).
  `remotion.config.ts` still defaults to `angle`; set `REMOTION_GL=swangle` (or pass `--gl=swangle`) on machines
  without a GPU. Output is pixel-identical in intent; only speed differs.
- **Versions.** React 18 → `@react-three/fiber@8`, `@react-three/drei@9`, `@react-three/postprocessing@2`
  (+ `postprocessing@6.36`), `three@0.169`. All `remotion`/`@remotion/*` are `4.0.547` (`npx remotion versions` clean).
- **Render pipeline.** To halve render time on a CPU renderer the loop compositions and credit compositions are
  rendered once each as a lossless PNG sequence and encoded with ffmpeg (`libx264 -crf 14 -preset slow -pix_fmt yuv420p`,
  no audio stream). The credit file = the loop's 1200 PNGs + the 75 tail PNGs of the `*Credit` composition, which
  are identical to what `npx remotion render HelloSquareCredit` would produce because frames < 1200 of the credit
  composition are the same pure function. See README for both the exact Remotion commands and the script used.

## Look / units
- **Light calibration (`CAL = 0.12`).** The prompt's punctual-light values (fire 40 cd, fill 12 cd, press spot 60 cd)
  at the given distances (≈1 m) blow the wall out to white under ACES at exposure 1.0 (first test render was clipped).
  All punctual lights (fire, fills, spot, pulse and spark lights) are multiplied by a single calibration constant so
  the *ratios* between lights stay exactly as specified. The press spot gets a further ×0.6 (paper was clipping).
  RectAreaLights use the prompt's values unchanged.
- **Tone mapping.** ACES is implemented inside the final custom effect (same fitted ACES curve three.js uses) instead
  of a separate `ToneMapping` pass, so that while the phone screen fills the frame (≈846–1050) the UI is shown
  un-tonemapped (`uScreenMix`) – otherwise ACES greys out the UI whites and shifts #7C5CFF. Chain order is unchanged:
  DOF → Bloom → (ACES + CA + vignette + grain).
- **Camera timing.** Using the per-segment ease of each key literally makes the camera stop dead at *every* key,
  including the mid-transit keys (135, 255, 405, 555, 705) – a visible stop-start judder. Frame→curve-parameter
  is instead a periodic Fritsch–Carlson monotone cubic through (keyFrame, keyIndex): it still hits every key exactly
  on its frame (positions, targets, FOV and focus are unchanged) but carries momentum through transit keys. It is
  periodic over 1200 so velocity is continuous across the loop point.
- **Carrier lead.** The carrier is the camera spline 48 f ahead (as specified) for the pigment dust. For the flying
  letters/sorts and the rings a 12–14 f lead is used: with 48 f the travelling elements sit at the *next* station
  while the camera is still mid-transit, so transit frames were empty black.

## Scale changes (readability at 1080p)
- **Ink ribbon width** 2.2 mm × pressure × 1.6. At the papyrus key (≈1 m, vFOV 32) 2.2 mm is ~4 px – hairline.
- **Sorts** 36 × 36 mm face (24 mm height kept) instead of 10 × 10. 10 mm type would print a 5 cm word on the page
  and read as ~90 px at the page key. Poster ("wood") type proportions keep the press beat legible.
- **Camera socket** distance 0.123 m instead of 0.17 m and a vertical focus point that pans the UI (262 pt →
  468 pt between 950 and 1012). At 0.17 m / 30° the 68.5 mm-wide screen does *not* fill a square frame (frame is
  91 mm wide) so bezel and world would show, contradicting "screen fills >100 % of frame".
- **Vertical smartphone framing.** Keeping the horizontal FOV equal to the square's (§11) makes the phone only 32 %
  of the 9:16 frame height at f720; to meet "78–85 %" the vertical cut dollies toward the target by ×0.4 between
  690 and 852 (vertical only).

## Behaviour choices
- **Ember life** is 1200/13 ≈ 92.3 f instead of 90 f so the ambient-ember cycle divides the loop exactly
  (90 does not divide 1200 → embers would pop at the loop point).
- **Sound rings** fade 1 → 0.4 (not → 0) while expanding, because §5.5 also needs them alive to flatten into
  rounded rectangles at 675–705.
- **Page peel** is a curl about the far edge (corner leads), ending tilted 116° so the printed underside faces the
  372 camera; the page then floats 13 cm toward camera so the glyph→Morse morph stays in the push-in frame.
- **Lever** rotates about the screw axis, pulled 35° toward camera; its collar sits at 0.335 m so it is in frame.
- **Morse "."** – the period of "Hello." has no Morse event in `morse_hello.json`; it fades while HELLO morphs.
- **Token particles** (24 × 8 = 192) are drawn into the screen canvas (they live on the screen plane); the orb is
  also mirrored as a 3D additive sprite so bloom catches it, as specified.
- **Phone → camera socket** is interpolated in *camera space* (from its pose relative to the 828 camera) so it never
  swings edge-on while the camera arcs 0.66 m sideways at 828–860.
- **Credit tail camera** eases to a stop over ~5 frames after 1200 instead of an instant freeze (a hard stop is a
  visible jolt); world time restarts at frame 0, so embers/flicker continue seamlessly.
- **Credit grain:** the 2D credit text sits above the WebGL canvas, so grain runs over the scene underneath it.
- **Loop point velocity.** The camera's time-mapping has zero velocity exactly at the loop key (frame 0 == 1200),
  matching the storyboard's `inOutSine` into `loop_close`. With momentum through frame 0 the rock texture moved
  ~4.8/255 per frame, so the seam failed the absolute < 3/255 check even though it equalled normal motion.
- **Rings → smartphone (675–720).** The flattened rings are interpolated in camera space and held near the view axis
  until ~712, then stack into the phone as it enters frame at ~716 (the phone materialises 700–722 and powers on at
  716 instead of 712). With the literal station-space path both were off-screen and 696–714 was black.
- **Backdrop clipping.** Any cyclorama surface within 0.65 m of the camera is hidden; during the chat the camera
  (with the phone 12 cm in front of it) crosses the smartphone cyclorama, which otherwise cut across the screen
  for two frames (caught by the pop detector review at f966–967).
- **Telegraph pulse lights** fade in over 5 f and only light pulses within 0.5 m of the key; the finger press is
  smoothed over ±2 f. The pop detector flagged the first key-down of each letter (445/453/477/501) because a pooled
  light switched on at full strength in one frame.
- **Smartphone glass** loses its clearcoat/specular while it fills the frame: the near-mirror LTC area-light
  specular aliased into a visible checker pattern under SwiftShader.
- **Cyclorama fade.** Cycloramas fade out smoothly as the camera nears their surface (0 within 0.45 m, full at 1.6 m)
  instead of a hard on/off toggle; the toggle popped in the pop detector on transits (f250/260, 404/407, 554/557).

## Polish pass (v3)
- **Era hand-offs (bridges).** Each hand-off that used to rush the lens into a dark shape is covered by a camera-locked
  material surface (`src/scene/Bridge.tsx`) that dissolves in over the departing station with a noise threshold,
  morphs its material (rock → papyrus fibre at ~120, papyrus → white paper at ~240, warm dark → studio blue at ~390,
  blue → slate at ~540) with a glowing morph front, and dissolves out over the arriving station. The camera stays on
  its spline; the surface drifts and slowly zooms with the camera's travel. The carrier of each morph draws on top:
  the pigment cloud (now a camera-space cloud so it is always framed, then lands as ink on the sheet), the
  stroke→sort letters (camera-space carrier → press bed), the impact's light line (a white-hot front runs along the
  telegraph wire from the f330 flash and cools to copper as the camera rides it to the key), and the wire coiling into
  the handset cord. DOF is relaxed while a bridge covers the frame so the carriers stay crisp. Phone → smartphone
  (rings → rounded rectangles) and smartphone → chat (screen push-in, same UI pixels) are unchanged.
- **Return (1036–1104).** The phone body now dissolves together with the ragged screen reveal, and the smartphone
  backdrop clears with it. A far, depth-tested fire-lit rock fill sits behind everything while the camera is still
  behind the cave wall's plane, so the void around the ragged screen is never black and the cave never pops in.
- **Hands.** One procedural skin shader with per-era looks (`HandLook`): ochre pigment clay (cave look; no 3D hand
  appears in the cave era itself), terracotta with ink-stained fingertips (papyrus), ink-smudged with a strong rim
  (press), cool skin with sheen 0.3 / roughness 0.55 and a warm thickness tint (telegraph, phone, smartphone).
  Knuckle creases and pores are a bump function evaluated per fragment from the nearest joint (bind space), the
  fingertip mask comes from the skin weights. Rim light is a fresnel term; a soft contact-shadow blob sits on the
  surface under the palm. Fingers settle from a relaxed pose with a Remotion spring (damping 12) on entry and follow
  pose blends with the same spring.
- **Papyrus.** The lectern is replaced by a heavy dark-wood slab on a stone plinth; the sheet rests between two rolled
  scroll ends (papyrus-textured cylinders with spiral end rings). Reed brush: tapered reed with nodes and a frayed,
  ink-soaked fibre tip. Ink is glossy and lighter while wet and dries darker and matte over 20 frames.
- **Press.** Warm key moved to the upper left (+40 %), stronger rim and a warm fill, more hemisphere/env light; threaded
  iron screw (helix) riding the platen and turning with the lever; the forme sits in a bed of 114 instanced spacer
  blocks with per-block height and rotation variation. The brayer pass, f330 flash and the "Hello." page are kept.
- **Phone UI.** Lifted dark background (#17161E + violet glow) so the screen never reads as black; composer is a lit
  card with larger type (name 23 pt, handle 20 pt, input/body 34 pt), audience chip and toolbar; the "..." reply
  indicators are drawn inside the screen UI (the floating 3D bubbles were removed).
- **Chat safe area.** The socket camera shows UI x ≈ 7–384 pt; every text element now sits in 34–356 pt (≥ 72 px at
  1080), reply text 25 pt (≈ 72 px), header/bubble moved down inside the frame; the status bar fades before the push-in.
- **Loop seam with grain.** Within 16 frames of the loop point the grain rotates (variance-preserving) into frame 0's
  grain pattern, so the seam carries no grain change.
- **Credit.** End card "Breeze × Opus 5.6" (U+00D7), Inter Medium, +2 % tracking, fades in 1208–1228 and out 1256–1272,
  over the warm cave (the fire is no longer dimmed in the tail). Only the `*Credit` compositions have it.
- **Vertical loop file.** Not requested in this pass; `out/hello-loop-9x16.mp4` is still produced from the vertical
  credit render's first 1200 frames.

### Loop seam encoding
The rendered PNGs close the loop at 0.82/255 (f1199 vs f0), but CRF 14 compression noise on the film grain pushed the encoded seam to ~2.6/255. The loop files are encoded with x264 zones `q=6` on frames 0–24 and 1172–1199 (see `scripts/render.sh`), which brings the encoded seam to ~1.1/255 for a ~30 MB larger file. Final QA reports: `qa/report_sq.txt`, `qa/report_v.txt`.
