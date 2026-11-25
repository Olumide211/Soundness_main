# "HELLO": A 40-SECOND ONE-SHOT SEAMLESS LOOP ABOUT HOW WE TALK (v2, FULL BUILD PROMPT)

You are Claude Code running on Windows. Build this film from scratch in **Remotion 4 + @remotion/three (React Three Fiber)**, with SVG, Canvas2D and GLSL. Do **not** use AI image or video generation or stock footage. Every pixel comes from code plus the CC0/MIT/OFL assets in `public/hello-film-pack/`.

Work fully autonomously:
- Install everything you need.
- Fix every error yourself.
- Render and inspect your own stills.
- Iterate until every check in §14 passes.

**Never stop to ask me anything.** If something is ambiguous, pick the option that looks most premium and note it in `DECISIONS.md`.

**VIDEO ONLY:** add no audio anywhere (no `<Audio>`, no music, no SFX, no audio stream in the files). I add music myself.

---

## 0. THE ASSET PACK (already copied to `./public/hello-film-pack/`)
Load every file with `staticFile('hello-film-pack/<path>')`. Read `public/hello-film-pack/README.md` and the `reference/storyboard_*.md` files first. They hold the exact per-era beats, camera keys and lighting values. If this prompt and a storyboard disagree, **this prompt wins**.

```
hello-film-pack/
  textures/<set>/{albedo,normal_gl,roughness,ao,displacement,metalness}.jpg   (2K, OpenGL normals; displacement only on cave_rock, papyrus_fibre and press_wood; metalness only on the metals)
     cave_rock            (Poly Haven worn_rock_natural_01: sandstone)
     papyrus_fibre        (Poly Haven rough_linen: weave normal/rough/ao/disp ONLY; there is NO albedo on purpose)
     papyrus_paper        (ambientCG Paper006: beige paper albedo/normal/rough)
     press_wood           (Poly Haven wood_table_worn)
     brushed_steel        (ambientCG Metal012)
     brass                (ambientCG Metal048B: gold with fingerprints; tint it to brass, see §6)
     copper               (ambientCG Metal047A)
     black_gloss_plastic  (ambientCG Plastic006)
     aluminium            (ambientCG Metal051A: circular-brushed; use for buttons and camera ring only)
  hdri/studio_small_09_1k.hdr                 (reflections only; never shown as background)
  models/hand/generic-hand_right.glb, generic-hand_left.glb   (rigged, 25 joints, ~1.4k verts, MIT)
  models/vintage_radio_transceiver/vintage_radio_transceiver_1k.gltf  (CC0; use ONLY nodes
         vintage_radio_transceiver_morse_key_base + _morse_key_arm as the telegraph key)
  fonts/static/  Inter-400/500/600/700.ttf, Geist-200/300/400/500/600.ttf, GeistMono-400/500.ttf,
                 UnifrakturMaguntia-Book.ttf, CaveatBrush-Regular.ttf, NotoSansEgyptianHieroglyphs-Regular.ttf
  fonts/variable/ Inter[opsz,wght].ttf, Geist[wght].ttf, GeistMono[wght].ttf
  svg/  hand_stencil_silhouette.svg  hand_stencil_spray.svg  stick_figures_running.svg  sun.svg
        hello_primitive_strokes.svg (7 stroke paths, ids g1-h-s1 ... g5-o-s1, draw order = DOM order)
        hello_brush_centerline.svg  (one continuous cursive path, id hello-brush)
        avatar_breezeog.svg  ui_social_post_mock.svg  ui_chat_mock.svg
  data/ camera_keyframes.json  stations.json  morse_hello.json  palette.json  social_post_ui.json  chat_ui.json
  reference/storyboard_01_cave.md … storyboard_08_return.md
```

The 3D models that don't exist as CC0 (rotary phone, smartphone, printing press, type sorts, reed brush, copper wire, fire) are built procedurally to the specs in §7.

---

## 1. SPECS
| | |
|---|---|
| Main composition | `HelloSquare`: 1080×1080, 30 fps, **1200 frames** (40.0 s) |
| Vertical | `HelloVertical`: 1080×1920, 30 fps, 1200 frames (same scene, re-framed per §11) |
| Credit versions | `HelloSquareCredit` / `HelloVerticalCredit`: 1275 frames (loop + 75-frame tail, §12) |
| Look | premium cinematic 3D: PBR, soft area lights, physically based DOF, ACES Filmic tone mapping, sRGB output, subtle grain about 4%, vignette 0.28, chromatic aberration at the edges only |
| Audio | none. Render with `--muted`. Zero audio streams. |

---

## 2. PROJECT SETUP (exact)
```powershell
npx create-video@latest --blank        # name it hello-film, TypeScript, no Tailwind. If the CLI prompts block a non-interactive shell,
                                       # scaffold by hand: npm init -y; npm i remotion @remotion/cli react react-dom; src/index.ts with registerRoot(Root)
cd hello-film
npx remotion add @remotion/three        # installs the version matching remotion
npx remotion add @remotion/fonts
npm i three @react-three/fiber @react-three/drei @react-three/postprocessing postprocessing three-stdlib flubber opentype.js
npm i -D @types/three @types/flubber
# then copy the pack:  public/hello-film-pack/
```
- **Version matching rule:** check the installed `react` major.
  - React 18 → `@react-three/fiber@8`, `@react-three/drei@9`, `@react-three/postprocessing@2`.
  - React 19 → `@react-three/fiber@9`, `@react-three/drei@10`, `@react-three/postprocessing@3`.
  - Pin `three` to the version `@remotion/three` lists as a peer. All `remotion` and `@remotion/*` packages must share the exact same version (`npx remotion versions` must be clean).
- **`remotion.config.ts`:**
  ```ts
  import {Config} from '@remotion/cli/config';
  Config.setChromiumOpenGlRenderer('angle');   // Windows GPU path
  Config.setConcurrency(2);
  Config.setVideoImageFormat('png');
  Config.setPixelFormat('yuv420p');
  Config.setCodec('h264');
  Config.setCrf(14);
  Config.setDelayRenderTimeoutInMilliseconds(120000);
  ```
- **Fonts:** in `src/fonts.ts`, call `loadFont` from `@remotion/fonts` for every static TTF. For 3D text, use drei `<Text font={staticFile(...)}>` (troika) with **static** TTFs only, never the variable ones.

---

## 3. ARCHITECTURE (create exactly these files)
```
src/Root.tsx                    4 compositions (§1), inputProps {grain:boolean, debug:boolean, vertical:boolean, credit:boolean}
src/Hello.tsx                   <ThreeCanvas> + post FX + 2D credit overlay
src/lib/timeline.ts             ALL frame numbers from this prompt as named constants (single source of truth)
src/lib/ease.ts                 easeInOutSine/Cubic/Quad, easeOutCubic, easeInQuad, smoothstep, clamp01, remap(f,a,b)
src/lib/rng.ts                  mulberry32(seed), hash(i,seed), seeded per-system streams (NO Math.random anywhere)
src/lib/noise.ts                periodic value/simplex noise; flicker(f) (§8.1); curl-like drift as pure fn of (seed,t)
src/lib/camera.ts               loads data/camera_keyframes.json, closed centripetal Catmull-Rom, per-segment eases, vFOV + focus
src/lib/svgPaths.ts             parses svg/*.svg -> path data, arc-length sampling, flubber interpolators
src/lib/assets.ts               texture-set loader (all maps, colorSpace, repeat, anisotropy 8), HDRI, glTF loaders, preload
src/scene/World.tsx             station roots placed from data/stations.json, global lights, fog, carrier anchor
src/scene/Lights.tsx            ALL lights for ALL eras always mounted; only intensities/colours animate (§9)
src/scene/CameraRig.tsx         sets camera from camera.ts each frame; applies impact shake; vertical FOV rule
src/scene/eras/CaveWall.tsx     rock wall + pigment layer shader + embers
src/scene/eras/Papyrus.tsx      lectern, papyrus sheet shader, reed brush, ink ribbon, hieroglyph hand
src/scene/eras/Press.tsx        press frame, chase, sorts, brayer, platen, lever, printed page
src/scene/eras/Telegraph.tsx    morse key (from radio glTF), copper wire, pulses, morse capsules
src/scene/eras/Phone.tsx        procedural rotary phone, curly cord, sound rings, waveform line
src/scene/eras/Smartphone.tsx   procedural phone body, screen CanvasTexture (post + chat UIs)
src/scene/eras/ReturnToFire.tsx orb->fire, ragged screen-edge reveal, ember dissolve
src/scene/hands/Hand.tsx        generic-hand glb, clay material, pose system (§7.1)
src/scene/particles/PigmentParticles.tsx   4,000-instance system used at 100-150 AND 1110-1170
src/scene/particles/Dust.tsx    impact dust (300), embers (60 ambient + 1,500 dissolve)
src/scene/morph/*.ts            stroke->sort extrusion morph, glyph->morse, wire->helix, ring->superellipse, card->bubble
src/scene/ui/drawPost.ts        Canvas2D drawer for data/social_post_ui.json at 1170×2532
src/scene/ui/drawChat.ts        Canvas2D drawer for data/chat_ui.json at 1170×2532
src/fx/PostFX.tsx               Bloom, DOF, custom Grain+CA+Vignette effect (frame-seeded)
src/fx/shaders/*.glsl           rockPigment, papyrus, inkBleed, electricPulse, screenEmission, grainCA, raggedEdge, flame
src/overlay/Credit.tsx          2D credit tail (§12)
scripts/check.mjs               the automated checks in §14 (ffprobe, loop diff, pop detector)
README.md, DECISIONS.md
```
- **Stateless rule (critical):** Remotion renders frames out of order in parallel tabs, so every visual must be a pure function of `frame`. Don't accumulate state across frames and don't use `useFrame` for simulation. Particles get positions from `(seed, index, frame)` analytically.

---

## 4. WORLD LAYOUT & THE ONE CAMERA
- Units are metres, Y is up.
- Six **stations** sit on a ring of radius 3.0 m around the origin (`data/stations.json`). Each one faces **outward** along its normal (sin θ, 0, cos θ):

| Station | θ | Centre | What |
|---|---|---|---|
| cave | 0° | (0, 1.20, 3.00) | rock wall 6×4 m (cylindrically bent, radius 6 m) with the painted patch 2.4×2.4 m centred |
| papyrus | 50° | (2.298, 0.90, 1.928) | sheet 0.42×0.30 m on a dark lectern tilted 55° toward the camera |
| press | 100° | (2.954, 0.95, −0.521) | press bed 0.50×0.36 m |
| telegraph | 150° | (1.500, 0.85, −2.598) | brass key, 0.15 m base |
| phone | 200° | (−1.026, 0.88, −2.819) | rotary phone, 0.22 m wide |
| smartphone | 250° | (−2.819, 1.10, −1.026) | phone 71.5×147 mm, floating, 15° tilt |

- Every station also gets a dark backdrop:
  - a large curved cyclorama segment (radius 2.2 m, height 3 m) behind it, colour = era background, roughness 1;
  - a soft floor disc, so the 9:16 frame never shows void.
  Hide the cyclorama segments of the other stations from view with `FogExp2`, colour = current era background, density 0.18, animated.
- **The camera** follows one CLOSED spline through `data/camera_keyframes.json` (25 keys; frame 1200 = frame 0 exactly). Implement it in `camera.ts`:
  1. `positions` and `targets`: centripetal Catmull-Rom (`THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5)`).
  2. Map frame → curve parameter piecewise: find the segment [kᵢ, kᵢ₊₁], set `t = ease_{i+1}((f−fᵢ)/(fᵢ₊₁−fᵢ))`, then `u = (i + t)/N`. Use `getPoint(u)` on the closed curve (N = number of distinct keys = 24).
  3. `fovDeg` and `focusDistance`: monotone cubic (Fritsch–Carlson) over frame.
  4. Add a hand-held micro-drift: ±1.5 mm position and ±0.05° roll, built from periodic noise with integer cycles over 1200 frames, so it loops.
  5. Impact shake (press, f330): offset = 0.004·e^(−(f−330)/2.5)·sin((f−330)·2.6) along camera up and right, for f ∈ [330, 345].
- The key table is in each storyboard. Here's the summary:

| f | beat | pos | target | vFOV |
|---|---|---|---|---|
| 0 | cave_open | (0, 1.25, 5.6) | (0, 1.2, 3.0) | 35 |
| 100 | cave_lift | (0.1, 1.23, 5.2) | (0.18, 1.0, 3.0) | 34 |
| 150 | papyrus_settle | (3.10, 1.28, 2.60) | (2.30, 0.90, 1.93) | 32 |
| 270 | press_reveal | (4.63, 1.40, −0.82) | (2.95, 0.95, −0.52) | 30 |
| 330 | press_IMPACT | (4.45, 1.35, −0.68) | (2.95, 1.00, −0.52) | 30 |
| 420 | telegraph_key | (1.77, 0.97, −3.16) | (1.50, 0.85, −2.60) | 28 |
| 570 | phone_reveal | (−1.32, 1.04, −3.62) | (−1.03, 0.88, −2.82) | 30 |
| 720 | smartphone_float | (−3.27, 1.12, −1.19) | (−2.82, 1.10, −1.03) | 30 |
| 860 | chat_inside | (−3.14, 1.10, −0.44) | (−2.97, 1.10, −0.42) | 30 |
| 1020 | chat_orb_full | (−2.75, 1.12, 1.59) | (−2.60, 1.12, 1.50) | 30 |
| 1110 | pullback | (−1.16, 1.21, 4.35) | (−0.78, 1.18, 2.90) | 33 |
| 1200 | loop_close | = frame 0 | = frame 0 | 35 |

- **Carrier anchor:**
  - Elements that travel between stations (pigment dust, ink, sorts, Morse capsules, cord, rings) are parented to a `carrier` Object3D. Its transform is evaluated at the camera spline **48 frames ahead** and offset 0.6× the current focus distance along the view direction. They always travel through frame, never pop.
  - From 828 to 860, the smartphone's world transform lerps (easeInOutCubic, quaternion slerp) from its station pose to a **camera socket**: camera-local (0, 0, −0.17), facing the camera. It stays camera-parented until 1110, then is released and dissolves (§5.8).

---

## 5. TIMELINE: EVERY BEAT (frames @30 fps)
**No hard cuts anywhere.** Every transition is a morph through a shared shape. A ≤6-frame alpha blend is allowed only to hide a seam *inside* a morph.

### 5.1 CAVE 0–120 (plus the lift through 150)
- **0:** firelit rock wall fills frame. The painted patch:
  - `hand_stencil_spray.svg`, upper-left, 0.55 m tall;
  - `stick_figures_running.svg`, centre, 0.9 m wide;
  - `sun.svg`, upper-right, 0.35 m;
  - `hello_primitive_strokes.svg`, lower-right, 0.7 m wide.
  The camera starts pointed at the patch centre.
  Rasterise all four SVGs once into a single 2048² **pigment mask** CanvasTexture (R = ochre amount, G = rust amount, B = particle id region), positioned in wall UV.
- **0–100:** slow dolly in (keys 0/60/100).
- 60 ambient embers (instanced quads) rise through the bottom third: speed 0.12 m/s, sideways sine sway, life 90 f, positions pure functions of (i, frame mod 1200).
- **40–70:** wet-ochre sheen sweeps across the hand stencil. Pigment roughness dips 0.85 → 0.55 in a 0.25 m band moving left to right.
- **100–118:** **pigment lift.**
  - Sample 4,000 points from the pigment mask: 40% strokes, 30% hand, 20% runners, 10% sun. Seed `0xC0FFEE`.
  - Each particle gets `tEmit = 100 + 18·n(i)`, where n is noise ordered so strokes go first.
  - At tEmit, the wall pigment alpha at that texel drops to 0 in 4 frames: a 512² "emitted-time" texture compared to the frame in the shader.
  - The particle pops 2–6 mm off the wall with an ochre/rust colour from the mask.
- **118–150:** particles curl-drift, using analytic divergence-free drift = sum of 3 rotated sin fields of (seed, t). They then follow the carrier path (§4) to the papyrus sheet.
- The particles are instanced `PlaneGeometry(1,1)` billboards, size 1.2–3.5 mm, soft round alpha, additive at 35% plus normal blend at 65%.

### 5.2 PAPYRUS 120–240
- **135–160:** particles land on target points on the sheet. The targets are arranged in 18 horizontal and 14 vertical strips: papyrus is two crossed layers of pith strips.
  - Each landing grows the sheet's **reveal mask** radially (r 0 → 18 mm over 6 f). The sheet literally assembles from the dust.
  - By 160 the reveal is 100%.
- **150–165:** the right hand enters from the right in the pen-grip pose (§7.1), holding the reed brush (§7.5).
- **165–215:** the brush writes `hello_brush_centerline.svg`.
  - Map the SVG into the sheet at 0.30 m wide.
  - The tip follows the path's arc length, u = easeInOutSine((f−165)/50).
  - The ink is a ribbon mesh rebuilt each frame from samples [0, u]: width 2.2 mm × pressure (0.6 + 0.4·sin(u·π·7)), slight dry-brush breakup at stroke ends (alpha × noise).
  - The ink stays wet (roughness 0.25, slight raised normal) for 10 f behind the tip, then dries (roughness 0.7) and bleeds (§8.3).
- **205–220:** the hieroglyph hand `U+130A7` (NotoSansEgyptianHieroglyphs, 14 mm tall) inks in beside the word with a 10 f wipe. This is the hand motif in glyph form.
- **220–240:** lateral camera drift. Hand and brush exit right with an 18 f easeInCubic.

### 5.3 PRINTING PRESS 240–390
- **225–255:** STROKE → SORT morph.
  - Split the dried ink ribbon into its 5 letters (h, e, l, l, o) by arc-length ranges you measure once.
  - For each letter, resample its outline and the target sort's top-face letter outline (opentype.js, Inter 700, mirrored) to 256 points with flubber.
  - Build both as `ExtrudeGeometry` with identical settings: depth animates 0 → 24 mm and the outline lerps, so the vertex counts match.
  - Lift off the sheet (easeOutCubic) and morph in flight.
- **255–290:**
  - Five sorts fly into the chase (the steel frame on the press bed), mirrored, spelling HELLO reversed.
  - Each sort is a 10×10×24 mm `brushed_steel` block with a raised letter face 1.2 mm high.
  - 4 f stagger; each landing overshoots 1.5 mm, then settles in 2 f.
- **290–318:** an ink brayer (rubber roller, radius 22 mm, black_gloss_plastic roughness 0.5) rolls across. Ink sheen appears on the letter faces.
- **300–330:** the left hand grips the lever (grip pose) and pulls it 35°. The platen descends 180 mm with easeInQuad, accelerating to contact.
- **330 IMPACT:**
  - camera shake (§4);
  - 300 dust particles burst radially from the bed edge (life 24 f);
  - brass and steel specular +40% for 2 f;
  - a 1-frame lift of key-light intensity +15%.
- **330–360:**
  - The platen lifts (easeOutCubic).
  - The paper peels up from one corner: a bend deformer on a 64×64 plane with the hinge moving across.
  - It reveals **"Hello."** in UnifrakturMaguntia, ink colour #121010, with the ink bleed spreading 0 → 0.35 mm over 20 f (§8.3) and a slight emboss (normal from text SDF).
- **360–390:** the camera rises and pushes onto the page (key 372).

### 5.4 TELEGRAPH 390–540
- **375–405:** GLYPH → MORSE.
  - Each glyph of "Hello." morphs (flubber, 2D, then mapped onto the page plane) into its Morse capsules from `data/morse_hello.json`: dot = 3 mm circle, dash = 9×3 mm capsule.
  - The capsules lift 1 mm, glow #CFE8FF at 0.4 emissive, and slide off the page's right edge onto the **copper wire**.
- **405–425:** the capsules ride the wire, tangent-aligned, and get absorbed into the key base (scale 1 → 0 with an emissive spike to 3.0).
- **425–523:** the right index finger taps HELLO **exactly** per `morse_hello.json`: 2 frames per unit, first down at 425, last up at 523. For each event:
  - **Key arm:** rotates −4° about its pivot during [downFrame, upFrame], with a 1 f ease in and out.
  - **Finger:** the index tip rides the key knob; the other fingers stay curled.
  - **Contact spark:** an 8-particle burst plus a 2 f point light flash.
  - **Pulse:** an electric pulse launches along the wire (§8.4) at 1.2 m/s. Its length = duration × speed, so dashes look 3× longer.
- **Light:** goes fully cold-electric by 440.
- **523–540:** the last pulse races out of frame along the wire.

### 5.5 ROTARY PHONE 540–690
- **525–555:** WIRE → CORD.
  - The wire's curve points lerp from straight to a helix (radius 8 mm, pitch 6 mm), starting at the far end and progressing toward the camera (progress = easeInOutCubic).
  - The material lerps copper → black_gloss_plastic.
  - The cord leads to the phone's base.
- **555–585:** the phone is revealed (§7.3), with the rim lights tracing its bakelite curves.
- **585–620:** the right index finger dials two digits (holes 4 and 2):
  - dial to the finger stop: easeInOutQuad, 9 f;
  - release and return: easeOutQuad, 9 f;
  - twice.
- **620–640:** the hand lifts the handset 50 mm and tilts it 25°. The cord stretches (helix pitch 6 → 9 mm).
- **640–675:** six **sound rings** expand from the earpiece.
  - Each ring is a torus with a thin tube (0.6 mm), #CFE8FF emissive 2.0, spawning every 6 f. Radius grows 0 → 120 mm with easeOutCubic over 30 f, and opacity follows 1 → 0.
  - **646–672:** a luminous thin line draws on the word **"hello"**: the Geist-200 glyph outlines (opentype.js → polyline), 3D tube radius 0.4 mm, floating between rings 2 and 3, drawn by arc length.
- **675–705:** RINGS → SCREEN.
  - The rings flatten into rounded rectangles: a superellipse with exponent n 2 → 8, aspect 1 → 2.06 (147/71.5), size converging to the smartphone outline.
  - They travel on the carrier to the smartphone station and stack into its edge.

### 5.6 THE POST 690–840
- **690–712:** the rounded-rect light lines become the phone's edges, and the body materialises (dissolve with an edge glow, noise threshold).
- **712:** the screen powers on (emission 0 → 1.0 over 8 f, a slight overshoot to 1.08, then back).
- **720–735:** the composer is visible (`data/social_post_ui.json`). The right thumb enters from bottom-right (tap pose).
- **735–783:** the thumb types **"hello world"** on the exact `typingSchedule` frames:
  - each keystroke: thumb tip down 2 f, key highlight, key popup, character appears;
  - caret #7C5CFF blinks every 16 f while idle.
- **788–792:** the thumb moves to **post** and taps at 792.
- **796–806:** the keyboard slides down (10 f).
- **798:** the published card springs in (scale 0.96 → 1).
- **804–836:** the counts spring up to 128 / 342 / 2.4K / 18K, in GeistMono tabular. The like icon fills #FF4D6D at 808.
- **810–832:** 6 reply bubbles **leave the screen plane in 3D**: each bubble mesh lifts off and rises 6 cm with a slight rotation, fading over 18 f.
- **828–860:** the camera pushes into the screen, and the phone moves to the camera socket (§4).
- Draw the UI generically with **no real platform logos**: author BreezeOg, handle @BreezeOg1, avatar `svg/avatar_breezeog.svg`.

### 5.7 AI REPLY 840–1020
- **840–862:** CARD → BUBBLE. The published post card's rounded rect morphs (2D rect interpolation: x, y, w, h, radius) into the right-aligned user bubble "hello world" (`data/chat_ui.json`). The other post UI fades.
- **880–966:** the reply streams token by token at the `tokenFrames`: **"hello. what should we make today?"**
  - Each token fades in over 5 f with blur 6 → 0 px.
  - A soft cursor glows #7C5CFF and hides at 966.
- **880–1020:** for each token, 24 light particles arc (quadratic Bézier, 22 f) from the token centre into the **orb**.
  - Orb radius = 6 + 114·smoothstep(880, 1020, f) pt.
  - Core #FFFFFF, halo #7C5CFF ×3.2 radius.
  - The orb is drawn in the canvas AND mirrored as a 3D emissive sprite in front of the screen, so bloom catches it.
- **990–1015:** the orb's particles briefly arrange into the **hand stencil outline** (sample `hand_stencil_silhouette.svg`), then release. This is the hand motif.
- **966–1020:** the text dims to 30%, and the orb pulses at 0.5 Hz.

### 5.8 BACK TO THE FIRE 1020–1200
- **1020–1060:** the orb lerps white/violet → #FFC872 core and #E0A458 halo, and starts flickering with the **same** `flicker(f)` as the fire.
- **1040–1110:** the camera pulls back through the glass (keys 1020 → 1110 → 1170).
  - The screen's rounded-rect SDF edge is displaced by fbm noise. Amplitude grows 0 → 18% of the screen width while the screen opacity mask expands past the frame, so its edge becomes a **ragged rock edge**, revealing the real cave wall in the world behind (§8.7).
  - The phone body dissolves into 1,500 embers that rise and drift.
- **1060–1120:** the orb drifts down-left and shrinks into the fire key light's position. It *becomes* the fire light, and its intensity hands over to the cave PointLight.
- **1110–1170:** the same 4,000 pigment particles stream back from the orb/ember cloud and land on their original texels. Pigment alpha goes 0 → 1, the exact reverse of 100–118.
- **1170–1200:** settle. Every animated quantity (lights, fog, exposure, flicker phase, embers, drift) converges to its frame-0 value. **Frame 1199 must ease into frame 0.**

---

## 6. MATERIALS (MeshPhysicalMaterial unless noted; all maps from the pack, colour maps in sRGB, the rest in linear)
| Object | Maps | Params |
|---|---|---|
| Cave wall | cave_rock all 5 | displacementScale 0.06 on a 256×170-segment plane, normalScale 1.2, aoMapIntensity 1.0, albedo multiplied by #C9A27A; plus the pigment layer (§8.2) |
| Papyrus sheet | papyrus_paper albedo × #E9D8B4, papyrus_fibre normal/rough/ao | roughness ×1.0, sheen 0.4 #FFE9C4, transmission 0 (fake translucency in shader §8.3), thickness 0.4 mm |
| Lectern / press frame / platen | press_wood all | roughness ×1.05, clearcoat 0.05 |
| Sorts, chase, lever bar | brushed_steel | metalness 1, roughness map ×0.9, anisotropy 0.6 |
| Telegraph key brass parts | glTF's own maps, BUT replace the base colour tint with brass albedo × #C9A15A | metalness 1, roughness 0.35 |
| Copper wire | copper | TubeGeometry r 1.2 mm, metalness 1, roughness 0.3 |
| Rotary phone body / handset | black_gloss_plastic | color #0D0D0F, roughness 0.12, clearcoat 1, clearcoatRoughness 0.05 |
| Phone dial plate | brushed_steel | metalness 1, roughness 0.25 |
| Smartphone frame | none (procedural) | color #C9CDD2, metalness 1, roughness 0.28 (bead-blasted aluminium) |
| Smartphone buttons / camera ring | aluminium | metalness 1, roughness 0.3 |
| Smartphone glass | none | transmission 0, roughness 0.02, clearcoat 1, reflections from HDRI envMapIntensity 1.0; screen = emissive map (§8.5) |
| Hand (all eras) | none | color #C99A72, roughness 0.62, sheen 0.35 sheenColor #FFD8B0: a sculpted clay hand, not realistic skin |
| Brayer | black_gloss_plastic | roughness 0.5 |
- Use texture repeat by world size: rock 1 tile per 1.5 m; paper 1 tile per 0.30 m; wood 1 tile per 0.6 m; metals 1 tile per 0.08 m.
- `scene.environment` = the HDRI loaded with RGBELoader, through PMREM. Set `scene.background` = null and draw the background from the cyclorama/fog colour.

---

## 7. PROCEDURAL BUILD SPECS (no CC0 model available)
### 7.1 Hand poses (`generic-hand_*.glb`, 25 joints named `wrist`, `thumb-metacarpal` … `pinky-finger-tip`)
- Scale ×1.0: the model is life-size, about 0.2 m.
- On load, log each joint's local axes. Then write `curl(finger, amount 0..1)`, which rotates the proximal, intermediate and distal joints about each finger's flexion axis by amount × [70°, 95°, 60°], plus `spread(deg)` and `thumbOpp(0..1)`.

| Pose | index | middle | ring | pinky | thumb |
|---|---|---|---|---|---|
| pen-grip (papyrus) | 0.45 | 0.55 | 0.8 | 0.85 | opp 0.7, curl 0.3 |
| grip (lever) | 0.85 | 0.9 | 0.9 | 0.9 | opp 0.6, curl 0.6 |
| press-finger (telegraph, dial) | 0.15 → 0.3 on press | 0.9 | 0.95 | 0.95 | curl 0.5 |
| hold (handset) | 0.7 | 0.75 | 0.8 | 0.8 | opp 0.8 |
| tap (smartphone thumb) | 0.6 | 0.7 | 0.75 | 0.8 | thumb extended, curl 0.2 → 0.45 on each tap |
- Solve the hand placement with an IK-lite approach: position the wrist so the index tip (or thumb tip) hits the target point. Do this analytically per frame: no physics, no state.
- Add a subtle 0.3° tremor from periodic noise.

### 7.2 Telegraph key
- Load the radio glTF and keep only the nodes `vintage_radio_transceiver_morse_key_base` and `vintage_radio_transceiver_morse_key_arm`; hide everything else.
- Re-centre them. Scale them to a 0.15 m base length. Find the arm pivot as the arm's bounding-box end farthest from the knob.
- Copper wire: TubeGeometry along a CatmullRom curve from the printed page's right edge to the key's terminal, sagging 2 cm. Sample at 400 segments with 12 radial segments.

### 7.3 Rotary phone (about 1960s desk phone)
- **Body:** base width 0.22 m, depth 0.20 m, height 0.12 m. Build it as an extruded rounded trapezoid: `ExtrudeGeometry` of a rounded-rect profile, bevelEnabled, bevelSize 8 mm, bevelSegments 8, then taper the top with vertex scaling by y.
- **Cradle:** two rounded prongs.
- **Handset:** a TubeGeometry spine with a 150 mm arc, plus two LatheGeometry cups (earpiece and mouthpiece, Ø 52 mm) with perforated grille discs. The grille holes are an alpha map you draw in Canvas2D.
- **Dial:**
  - dial plate Ø 90 mm (brushed_steel);
  - finger wheel: a black disc with 10 finger holes Ø 13 mm, made with `Shape.holes`;
  - a number card under the holes (Inter 600 digits, Canvas2D texture);
  - a chrome finger stop at the 4 o'clock position.
  The dial rotation pivots on the dial centre.

### 7.4 Smartphone
- 71.5 × 147 × 7.8 mm rounded rect: `ExtrudeGeometry`, corner radius 10 mm, bevel 1 mm, 10 segments.
- Glass front inset 0.3 mm. Camera island top-left: 3 aluminium rings and black glass lenses.
- Screen plane 68.5 × 144 mm, corner radius 9 mm (alpha mask), emissive map = the UI CanvasTexture (1170×2532, redrawn per frame from `drawPost`/`drawChat`), `toneMapped=false`.

### 7.5 Reed brush & press
- **Reed:** CylinderGeometry r 3.5 mm, length 0.18 m, bamboo-tan colour #B79B6A, roughness 0.55. The tip is a cone cut at 30°, with ink-darkened albedo in the last 6 mm.
- **Press (simplified hand press):**
  - two upright wooden posts 60×60 mm, 0.6 m tall;
  - a cross-head beam;
  - a bed 0.50 × 0.36 m;
  - a steel chase frame of 6 mm bars;
  - a platen 0.40 × 0.30 × 0.05 m, brass-faced underside;
  - a lever bar r 10 mm, 0.35 m, with a turned wooden handle.
  Bevel every box edge 2 mm. Sharp CG edges look cheap.

### 7.6 Fire (offscreen light source)
- No flame is visible in frame. The fire is a PointLight below-left plus the embers.
- If the 9:16 frame ever shows the floor near the light, render a 3-quad billboard flame: a noise-scrolled gradient, additive, #FFC872 → #B5652B, flickering with `flicker(f)`.

---

## 8. SHADERS (inject with `onBeforeCompile` or custom ShaderMaterial; every time input = frame/30, never clock)
1. **Periodic fire flicker:**
   ```
   flicker(f) = 1 + 0.10·sin(2π·37f/1200 + 0.3) + 0.06·sin(2π·53f/1200 + 1.7) + 0.04·sin(2π·89f/1200 + 4.1) + 0.03·sin(2π·131f/1200 + 2.2) + 0.02·sin(2π·197f/1200 + 5.9)
   ```
   The integer cycle counts make it **exactly periodic over 1200 frames**. Fire light intensity = 40 cd × flicker(f). Its position jitters by 2 cm using the same structure with different phases. The ember sway uses the same rule.
2. **Rock pigment:**
   - Albedo = mix(rock, pigmentColour, mask × alive × grainBreakup).
   - grainBreakup = smoothstep(0.35, 0.6, rockHeight + 0.15): the pigment sits in the high points and skips the pits, like real ochre.
   - The pigment roughness is 0.85, with the sweep in §5.1.
   - alive = step(frame, emitTime(texel)) for 0–150, and step(landTime(texel), frame) for 1110–1200.
3. **Papyrus translucency + ink bleed:**
   - Fake back-scatter: add albedo × keyLightColour × 0.25 × (1 − NdotL)^2 × thickness noise.
   - Fibre strips show as slight brightness variation, both along the strips and across them.
   - Ink bleed: sample a pre-blurred ink-coverage texture (two radii); ink = max(sharp, blurred × bleedAmount × fibreNoise). The bleed creeps along the fibre direction 2× more than across it.
4. **Electric pulse (wire):** `emissive += #CFE8FF · Σ_pulses gauss((s − s_p(f))/len_p) · 3.0`, where s is arc length along the wire, plus a core #FFFFFF where the pulse value > 0.8. Bloom catches it. Up to 16 pulses go in a uniform array.
5. **Screen emission:**
   - emissive = UI texture × powerOn(f).
   - Add a very subtle 1080-line LCD pattern only when the camera is closer than 0.25 m (strength 0.04).
   - Glass reflection is added on top by the physical material.
6. **Grain + CA + vignette (one fullscreen effect, last in the chain):**
   - Grain: luminance-weighted (stronger in the mids), 4% amplitude, seeded by `frame % 1200`, 1.0 px size. Disabled when `inputProps.grain === false`, which is used by the loop check.
   - CA: radial only, 0 at the centre, 1.2 px at the corners.
   - Vignette: 0.28, smooth.
7. **Ragged edge reveal (1040–1110):**
   - mask = sdRoundRect(uv) + fbm(uv·6, seed) × amp(f).
   - The screen is visible where mask < 0; the rock world shows through where mask > 0.
   - Render the phone screen with depthWrite off, and animate the threshold so the reveal grows outward from the frame edges toward the centre.
8. **Post FX chain** (@react-three/postprocessing `EffectComposer`, multisampling 4):
   - DepthOfField(worldFocusDistance = camera focus, bokehScale per storyboard, focalLength 0.02);
   - Bloom(luminanceThreshold 0.8, intensity 0.6, mipmapBlur, radius 0.7);
   - ToneMapping ACES;
   - custom GrainCAVignette.

---

## 9. LIGHTING RIGS (all lights mounted for the whole film; animate only intensity and colour, because changing the light count recompiles shaders)
| Era | Lights (three.js physically-correct units) | Background / fog |
|---|---|---|
| Cave | Fire PointLight #FF9A3C 40 cd × flicker at wall-local (−0.9, −0.85, 0.9); fill PointLight #FFC872 12 cd at (0.7, −0.9, 0.8); Hemisphere sky #3A1F12 / ground #000 0.08; envMapIntensity 0.05 | #0A0604, FogExp2 0.12 |
| Papyrus | RectAreaLight #FFE9C4 6 (0.8×0.5 m) 0.7 m above-left at 45°; PointLight #E0A458 3 cd low-right; env 0.25 | #120C08 |
| Press | SpotLight #FFF1DC 60 cd, angle 0.45, penumbra 0.8, 1.2 m above-right, castShadow (2048 map, bias −0.0005); rim RectArea #CFE8FF 3 behind; Hemisphere 0.12; env 0.5 | #0E0C0B |
| Telegraph | RectArea #CFE8FF 4 overhead 0.6×0.3; rim RectArea #4C8DFF 8 behind-left; 3 pooled PointLights #CFE8FF 2 cd riding active pulses; env 0.6 | #0B1220 |
| Phone | RectArea #EAF4FF 5 overhead 1.2×0.6; 2 rim strips RectArea #CFE8FF 6 left/right behind; env 0.8 | #0A0E16 |
| Smartphone | RectArea #FFFFFF 1.5 at the screen facing out; rim RectArea #7C5CFF 4 behind; key RectArea #FFFFFF 2 top-left; env 1.0 | #08080B |
| Chat | screen unlit/emissive; bloom does the work | #000000 |
| Return | the cave rig fades back in 1040–1150; the others reach 0 by 1150 | lerps back to #0A0604 |
- Crossfade each rig over its transition window with smoothstep: 100–150, 225–255, 375–405, 525–555, 675–705, 828–860, 1040–1150.
- Call `RectAreaLightUniformsLib.init()` once.
- **Colour temperature arc:** warm (cave, papyrus), then cool (press, telegraph), cold (phone), screen white/violet (post, chat), and back to warm.

---

## 10. TYPOGRAPHY & EXACT STRINGS
| Era | Lettering | String (exact) |
|---|---|---|
| Cave | `hello_primitive_strokes.svg` scratched strokes | (reads as) hello |
| Papyrus | `hello_brush_centerline.svg` brush ribbon + U+130A7 glyph | hello |
| Press | sorts: Inter 700 mirrored; print: UnifrakturMaguntia | HELLO (type), **Hello.** (print) |
| Telegraph | Morse capsules | `.... . .-.. .-.. ---` |
| Phone | Geist 200 outline as a luminous line | hello |
| Post | Inter (UI), GeistMono (counts) | **hello world**, BreezeOg, @BreezeOg1 |
| Chat | Inter 400 22 pt | **hello. what should we make today?** |
| Credit | Geist 500 | **Edited by BreezeOg** |
- All UI text is lowercase except the names.
- No titles, subtitles or captions over the film.

---

## 11. 9:16 REFRAMING RULES (`HelloVertical`)
- Same scene, same camera spline. Keep the **horizontal** FOV equal to the square's: `vFOV_vertical = 2·atan(tan(vFOV_square/2) · 1920/1080)`. This shows extra headroom and floor, never a stretched or cropped image.
- Vertical-only target offsets: cave +0.10 m up (more wall above the patch); papyrus −0.04 m; press +0.06 m (keeps the platen in frame at f300–330); telegraph 0; phone +0.03 m; smartphone 0, and the phone must fill 78–85% of the frame height at f720.
- Safe area: keep every subject and all text inside the central 1080×1500 band. Check this on every era still.
- The cyclorama, floor discs and the 6×4 m wall must cover the taller frame. Verify there are no edges or void at all.

---

## 12. CREDIT TAIL (credit versions only, frames 1200–1274)
- The scene keeps rendering with the camera held at the frame-0 pose. Fire intensity eases 1 → 0.06 over 1200–1230 (easeInCubic), and the exposure dims 15%.
- **Hairline rule:** 1 px, #F4EDE4 at 70%. Width 0 → 120 px over 1218–1236 (easeOutCubic). It sits centred, 22 px above the text baseline.
- **Text:** "Edited by BreezeOg" in Geist 500.
  - Size: 26 px on 1080×1080, 32 px on 1080×1920.
  - Letter-spacing animates 0.32em → 0.28em. Colour #F4EDE4 at 92%.
  - It fades 0 → 1 with translateY 8 → 0 px over 1222–1240 (easeOutCubic), then holds to 1274.
  - It sits at the optical centre: 50% horizontally, 52% vertically.
- Grain continues over the tail.

---

## 13. RENDER COMMANDS (Windows PowerShell)
```powershell
npx remotion render HelloSquare          out/hello-loop-1x1.mp4      --gl=angle --concurrency=2 --codec=h264 --crf=14 --pixel-format=yuv420p --x264-preset=slow --muted
npx remotion render HelloSquareCredit    out/hello-1x1-credit.mp4    --gl=angle --concurrency=2 --codec=h264 --crf=14 --pixel-format=yuv420p --x264-preset=slow --muted
npx remotion render HelloVerticalCredit  out/hello-9x16-credit.mp4   --gl=angle --concurrency=2 --codec=h264 --crf=14 --pixel-format=yuv420p --x264-preset=slow --muted
npx remotion render HelloVertical        out/hello-loop-9x16.mp4     --gl=angle --concurrency=2 --codec=h264 --crf=14 --pixel-format=yuv420p --x264-preset=slow --muted
```
- If the GPU crashes or a tab times out, drop to `--concurrency=1`.
- If `angle` fails, try `--gl=angle-egl` and then `--gl=swangle` (slow but reliable).
- Drafts: add `--scale=0.5 --every-nth-frame=2` while iterating.

---

## 14. SELF-REVIEW LOOP (do this yourself; repeat until everything passes)
1. **Era stills:** `npx remotion still HelloSquare review/f{N}.png --frame={N}` for N = 0, 60, 110, 135, 165, 200, 240, 270, 315, 330, 345, 380, 400, 430, 480, 530, 560, 600, 650, 690, 700, 720, 760, 800, 830, 850, 900, 960, 1010, 1050, 1080, 1110, 1150, 1199. Do the same for HelloVertical at 0, 165, 330, 480, 650, 760, 960, 1110.
   - Open every PNG and inspect it.
   - Fix anything blank, black, clipped, z-fighting, flat-lit, unreadable or off-brand, or any text that's misspelt.
   - Fix untextured "grey box" materials, a visible cyclorama edge or void, a hand intersecting objects, or aliasing on thin lines.
2. **Contact sheets:** a 10-frame sheet per era in `review/` (`ffmpeg -i out/hello-loop-1x1.mp4 -vf "select='between(n,A,B)*not(mod(n-A,S))',scale=360:-1,tile=5x2" -frames:v 1 review/era_XX.png`). Inspect them.
3. **Loop check:** render frames 0, 1, 1198, 1199 with `--props='{"grain":false}'`.
   - mean |f1199 − f0| < 3/255 per channel;
   - and |f1199 − f0| ≤ 1.5 × |f1198 − f1199| (the seam is no bigger than normal motion).
   - Write the numbers to `review/loop.txt`.
4. **Pop/cut detector** (`scripts/check.mjs`):
   - Render HelloSquare at `--scale=0.25` with grain off. Compute the mean absolute difference between consecutive frames (ffmpeg `-vf "signalstats"` or decode to raw and diff in Node).
   - Flag any frame whose diff > 4× the median of its ±8 neighbours. Allowed exception: frame 330 (impact).
   - Every other flag is a cut or pop and must be fixed.
5. **ffprobe** every output. Each must report:
   - 1080×1080 (or 1080×1920), 30/1 fps, `nb_frames` = 1200 (or 1275), h264, yuv420p;
   - **0 audio streams** (`ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 <file>` prints nothing).
6. **Text audit:** grep the source for every exact string in §10. Then check the stills at 350, 800, 960 and 1250 visually.
7. **Determinism:** render frame 700 twice, in separate processes; the outputs must be byte-identical (with grain on, since grain is frame-seeded). `rg "Math.random|Date.now|performance.now" src` must return nothing.

---

## 15. DETERMINISM & PERFORMANCE
- **Determinism:** randomness only from `rng.ts` with fixed seeds per system: pigment 0xC0FFEE, embers 0xE1BE85, dust 0xD057, tokens 0x70C3, ribbon 0x1A55. Noise functions are pure. Time comes from `useCurrentFrame()` only.
- **Load once:** preload textures, HDRI, glTFs and fonts inside a `<Suspense>`, so the ThreeCanvas `delayRender` holds the frame until everything has loaded. If a still renders before its textures appear, wrap the loaders in an explicit `delayRender`/`continueRender`.
- **GPU budget:**
  - Use InstancedMesh for every particle system: 4,000 pigment, 1,500 dissolve embers, 300 dust, 60 ambient embers, token particles from a pool of 192.
  - Update instance matrices only for active systems, with `frustumCulled = false` on the particle meshes.
  - Unmount an era's heavy meshes outside [eraStart − 40, eraEnd + 40], but **keep the lights**.
  - Texture anisotropy 8, mipmaps on.
  - The cave plane gets 256×170 segments (no more).
  - Shadows only on the press SpotLight.
- Set renderer `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmic`, exposure 1.0, `antialias` on, plus the composer's multisampling 4.

---

## 16. DELIVERABLES
1. `out/hello-loop-1x1.mp4`: the pure seamless loop, no credit (1200 f).
2. `out/hello-1x1-credit.mp4`: loop + 2.5 s credit tail (1275 f).
3. `out/hello-9x16-credit.mp4`: vertical + credit tail (1275 f).
4. `out/hello-loop-9x16.mp4`: vertical pure loop (1200 f).
5. `review/`: era stills, 8 contact sheets, `loop.txt`, the pop-detector report and the ffprobe report.
6. `README.md` (scene files and how to re-render) and `DECISIONS.md`.

There must be no audio track in any file. Don't stop until every check in §14 passes. Fix errors yourself and never ask me.
