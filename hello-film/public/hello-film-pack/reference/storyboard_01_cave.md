# Era 01 - Cave (frames 0-120, 0.0-4.0 s)

## Beats
| Frames | What happens |
|---|---|
| 0 | Open. Firelit rock wall fills frame. Spray hand stencil upper-left of the painted patch, three runners centre, sun upper-right, primitive "hello" strokes lower-right. Embers (60 instanced quads) drift up through bottom third. |
| 0-100 | Slow dolly in toward the strokes (keys 0/60/100). Fire flicker drives light intensity + 2 cm position jitter (periodic, see PROMPT). |
| 40-70 | Wet-ochre highlight sweeps across the hand stencil (roughness dips 0.85 -> 0.55 in a 0.25 m band moving left->right). |
| 100-118 | Pigment lifts: 4,000 particles spawn at pigment texels (40% strokes, 30% hand, 20% runners, 10% sun); wall pigment alpha decays per-texel at the moment its particle leaves (noise-staggered, strokes first). |
| 118-135 | Particles curl-drift (analytic, stateless) then stream along the carrier path toward the papyrus station. |

## Camera keys (world metres, Y up; from data/camera_keyframes.json)
| Frame | Beat | Position | Target | vFOV deg | Lens mm (FF, vertical) | Focus m | Ease into key | Note |
|---|---|---|---|---|---|---|---|---|
| 0 | cave_open | [0.0, 1.25, 5.6] | [0.0, 1.2, 3.0] | 35 | 38.1 | 2.6 | inOutSine | == frame 1200. strokes + stencil framed, fire glow from below-left |
| 60 | cave_dolly | [0.05, 1.24, 5.4] | [0.1, 1.1, 3.0] | 35 | 38.1 | 2.405 | inOutSine |  |
| 100 | cave_lift | [0.1, 1.23, 5.2] | [0.18, 1.0, 3.0] | 34 | 39.3 | 2.213 | inOutSine | pigment begins to lift |

Depth of field: bokehScale 2.0 (deep focus, wall fully readable).

## Lighting
Fire key PointLight #FF9A3C 40 cd at wall-local (-0.9,-0.85,0.9) i.e. below-left & in front; fill PointLight #FFC872 12 cd at (0.7,-0.9,0.8); Hemisphere sky #3A1F12 / ground #000000 0.08; envMapIntensity 0.05; FogExp2 #0A0604 density 0.12; exposure 1.0 (ACES).
