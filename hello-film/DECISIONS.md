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
