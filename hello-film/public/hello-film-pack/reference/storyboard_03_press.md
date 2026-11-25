# Era 03 - Printing press (frames 240-390, 8.0-13.0 s)

## Beats
| Frames | What happens |
|---|---|
| 225-255 | Each letter of the ink stroke extrudes up (depth 0->24 mm) and its outline morphs into a sort (type block) footprint - identical vertex counts via resampled outlines. |
| 255-290 | Five sorts fly into the chase, mirrored, spelling HELLO reversed; 4 f stagger; each lands with a 2-frame settle (overshoot 1.5 mm). |
| 290-318 | Ink brayer rolls across the type (ink sheen appears on faces). |
| 300-330 | Left hand grips the lever, pulls; platen descends 180 mm with easeInQuad (accelerating). |
| 330 | IMPACT: 3-frame camera shake amp 4 mm decaying, 300 dust particles, brass specular flash +40% for 2 f. |
| 330-360 | Platen lifts (easeOutCubic), sheet peels revealing "Hello." in UnifrakturMaguntia, ink-bleed shader spreads 0->0.35 mm over 20 f. |
| 360-390 | Camera rises & pushes onto page. |

## Camera keys (world metres, Y up; from data/camera_keyframes.json)
| Frame | Beat | Position | Target | vFOV deg | Lens mm (FF, vertical) | Focus m | Ease into key | Note |
|---|---|---|---|---|---|---|---|---|
| 255 | transit_p_pr | [4.3467, 1.35, 1.1647] | [2.8978, 0.95, 0.7765] | 31 | 43.3 | 1.552 | inOutCubic |  |
| 270 | press_reveal | [4.6286, 1.4, -0.8161] | [2.9544, 0.95, -0.5209] | 30 | 44.8 | 1.759 | inOutSine |  |
| 318 | press_lever | [4.4982, 1.35, -0.6916] | [2.9544, 1.0, -0.5209] | 30 | 44.8 | 1.592 | inOutSine |  |
| 330 | press_IMPACT | [4.449, 1.35, -0.6829] | [2.9544, 1.0, -0.5209] | 30 | 44.8 | 1.544 | inOutSine | 3-frame shake amp 0.004 m, decays |
| 372 | press_page | [4.0377, 1.5, -0.712] | [2.9544, 0.9, -0.5209] | 29 | 46.4 | 1.253 | inOutSine | looking down on printed page |

Depth of field: bokehScale 3.0; focus pulls from type (f270) to page (f372).

## Lighting
Key SpotLight #FFF1DC 60 cd, angle 0.45, penumbra 0.8, from above-right 1.2 m; rim RectAreaLight #CFE8FF 3 behind (temperature starts cooling); fill Hemisphere 0.12; envMapIntensity 0.5; background #0E0C0B.
