# hello-film

A 40-second, one-shot, seamlessly looping film about how we say "hello": cave pigment → papyrus → printing
press → telegraph → rotary phone → social post → AI chat → back to the fire. It's built entirely in code with
Remotion 4, @remotion/three (React Three Fiber), SVG, Canvas2D and GLSL, plus the CC0/MIT/OFL assets in
`public/hello-film-pack/`. There's no audio anywhere.

## Compositions
| id | size | frames |
|---|---|---|
| `HelloSquare` | 1080×1080 | 1200 (pure loop) |
| `HelloVertical` | 1080×1920 | 1200 (pure loop) |
| `HelloSquareCredit` | 1080×1080 | 1275 (loop + 75-frame credit tail) |
| `HelloVerticalCredit` | 1080×1920 | 1275 |

Input props: `{grain: boolean, debug: boolean, vertical: boolean, credit: boolean}`. `grain:false` is used by
the loop and pop checks. `debug:true` skips post-processing.

## Scene files
| file | what |
|---|---|
| `src/Root.tsx` | the 4 compositions |
| `src/Hello.tsx` | asset preload (`delayRender`), `<ThreeCanvas>` |
| `src/scene/Scene.tsx` | mounts every era by frame window, feeds the post chain |
| `src/lib/timeline.ts` | every frame number as named constants |
| `src/lib/camera.ts` | closed centripetal Catmull-Rom camera, monotone timing, FOV/focus, micro-drift, impact shake, carrier, vertical rules |
| `src/lib/{ease,rng,noise,eras,stations,svgPaths,assets,shot}.ts` | eases; seeded RNG; periodic noise and `flicker(f)`; era weights; station frames; SVG/glyph tools; loaders |
| `src/scene/World.tsx` | station roots, cycloramas, floor discs, fog, HDRI environment |
| `src/scene/Lights.tsx` | all lights for all eras, always mounted; only intensity and colour animate |
| `src/scene/CameraRig.tsx` | applies the camera each frame |
| `src/scene/eras/*` | `CaveWall`, `Papyrus`, `Press`, `Telegraph`, `Phone`, `Smartphone` (post + chat + ragged reveal), `ReturnToFire` |
| `src/scene/hands/Hand.tsx` | WebXR generic-hand glb, clay material, FK curl/spread/opposition, analytic IK-lite placement |
| `src/scene/particles/*` | 4,000 pigment particles, embers, impact dust (instanced billboards, stateless) |
| `src/scene/morph/*` | stroke→sort, glyph→Morse, wire→helix, ring→superellipse |
| `src/scene/ui/*` | Canvas2D drawers for the social post and chat UIs (1170×2532) |
| `src/fx/PostFX.tsx`, `src/fx/shaders/*.glsl` | DOF, bloom, ACES + grain + CA + vignette; screen, flame shaders |
| `src/overlay/Credit.tsx` | "Breeze × Opus 5.6" end-card text (painted onto the cave rock by `CaveWall.tsx`) |
| `src/scene/Bridge.tsx` | era hand-off bridges (material dissolve surfaces) |
| `scripts/check.mjs` | §14 checks: ffprobe, loop seam, pop/cut detector, determinism, forbidden-API scan |
| `scripts/qa.py` | polish-pass checks: scene cuts, near-black frames, seam with grain, audio streams |
| `scripts/stills.mjs` | fast multi-frame still renderer (one bundle, one browser) |
| `scripts/render.sh` | renders all 4 deliverables + the checks |

Every visual is a pure function of the frame. There's no `useFrame` simulation, no `Math.random`, `Date.now` or
`performance.now`, and every particle position is analytic in `(seed, index, frame)`.

## Re-render
```bash
npm install
# Windows with a GPU, exactly as in the prompt:
npx remotion render HelloSquare          out/hello-loop-1x1.mp4    --gl=angle --concurrency=2 --codec=h264 --crf=14 --pixel-format=yuv420p --x264-preset=slow --muted
npx remotion render HelloSquareCredit    out/hello-1x1-credit.mp4  --gl=angle --concurrency=2 --codec=h264 --crf=14 --pixel-format=yuv420p --x264-preset=slow --muted
npx remotion render HelloVerticalCredit  out/hello-9x16-credit.mp4 --gl=angle --concurrency=2 --codec=h264 --crf=14 --pixel-format=yuv420p --x264-preset=slow --muted
npx remotion render HelloVertical        out/hello-loop-9x16.mp4   --gl=angle --concurrency=2 --codec=h264 --crf=14 --pixel-format=yuv420p --x264-preset=slow --muted

# GPU-less Linux (how the delivered files were made): software GL, each loop rendered once as PNGs,
# with the credit tails appended, then encoded with ffmpeg (no audio stream)
REMOTION_GL=swangle bash scripts/render.sh
```
For drafts, add `--scale=0.5 --every-nth-frame=2`. For stills, use
`node scripts/stills.mjs HelloSquare review 0,330,960`.

See `DECISIONS.md` for every interpretation and deviation.
