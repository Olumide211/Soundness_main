# Era 02 - Papyrus (frames 120-240, 4.0-8.0 s)

## Beats
| Frames | What happens |
|---|---|
| 120-150 | Dust stream arrives; particles flatten into alternating horizontal/vertical strips (papyrus is two crossed fibre layers). Each landing point grows the sheet reveal mask radially (r 0->18 mm over 6 f). |
| 150-165 | Sheet complete; right hand (generic-hand_right.glb, pen-grip pose) enters from right holding a reed brush (spec in PROMPT). |
| 165-215 | Brush writes svg/hello_brush_centerline.svg: tip follows path arc-length u = easeInOutSine((f-165)/50). Ink ribbon width 2.2 mm modulated by pressure 0.6 + 0.4*sin(u*pi*7). Wet sheen fades 10 f after each segment. |
| 205-220 | Hieroglyph hand U+130A7 (Noto Sans Egyptian Hieroglyphs) inks in beside the word, 14 mm tall - the hand motif. |
| 220-240 | Camera lateral drift; hand + brush exit right. Light warms to parchment. |

## Camera keys (world metres, Y up; from data/camera_keyframes.json)
| Frame | Beat | Position | Target | vFOV deg | Lens mm (FF, vertical) | Focus m | Ease into key | Note |
|---|---|---|---|---|---|---|---|---|
| 135 | transit_c_p | [2.0286, 1.25, 4.3503] | [1.2679, 1.05, 2.7189] | 33 | 40.5 | 1.811 | inOutCubic | dust stream rides the carrier |
| 150 | papyrus_settle | [3.1025, 1.28, 2.6033] | [2.2981, 0.9, 1.9284] | 32 | 41.8 | 1.117 | inOutSine |  |
| 220 | papyrus_drift | [3.0672, 1.24, 2.4431] | [2.3496, 0.9, 1.8671] | 32 | 41.8 | 0.981 | inOutSine | lateral drift across the sheet |

Depth of field: bokehScale 3.5 (sheet sharp, lectern edges soft).

## Lighting
Key RectAreaLight #FFE9C4 intensity 6, 0.8x0.5 m, 0.7 m above-left at 45 deg; fill PointLight #E0A458 3 cd low-right; HDRI studio_small_09 envMapIntensity 0.25; background #120C08; fire key fades 1.0->0.15 over 100-150.
