# hello-film-pack

This pack holds the assets for the 40 s "hello" one-shot loop, a film about the evolution of communication that is built entirely in code with Remotion 4 and React Three Fiber. It has no audio.

## Use
1. Copy this folder to `<your-remotion-project>/public/hello-film-pack/`.
2. Paste `PROMPT.md` into Claude Code. It references these exact paths through `staticFile('hello-film-pack/...')`.

## Contents
| Folder | What |
|---|---|
| textures/ | 9 PBR sets: cave_rock, papyrus_fibre (weave maps only), papyrus_paper, press_wood, brushed_steel, brass, copper, black_gloss_plastic, aluminium. 2K JPG with OpenGL normals (`normal_gl.jpg`). Metals include `metalness.jpg`. Displacement is included only for cave_rock, papyrus_fibre and press_wood, the surfaces that need relief. |
| hdri/ | studio_small_09_1k.hdr (reflections only) |
| models/ | rigged generic hands (left/right glb, MIT) and the vintage radio glTF (CC0; use only its `morse_key_base` and `morse_key_arm` nodes) |
| fonts/ | static/ (what you load) and variable/ hold Inter, Geist, Geist Mono, UnifrakturMaguntia, Caveat Brush and Noto Sans Egyptian Hieroglyphs. OFL licences are in licenses/. |
| svg/ | hand stencils, stick figures, sun, hello strokes (primitive and brush), avatar, UI mocks |
| data/ | camera_keyframes.json (25 keys, closed loop), stations.json, morse_hello.json (frame-exact), palette.json, social_post_ui.json, chat_ui.json |
| reference/ | storyboard_01..08_*.md: beats, camera position, target, FOV, lens, focus and lighting for each era |
| tools/ | Python generators for svg/, data/ and reference/. Rerun them to retime. |

Licences are listed in CREDITS.md.

## Not available as CC0 (built procedurally to the specs in PROMPT.md §7)
- rotary phone
- smartphone
- printing press
- type sorts
- reed brush
- copper wire
- fire
