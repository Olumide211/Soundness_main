# Era 05 - Rotary telephone (frames 540-690, 18.0-23.0 s)

## Beats
| Frames | What happens |
|---|---|
| 525-555 | Wire coils into a curly cord from its far end (helix r 8 mm, pitch 6 mm) as the camera follows it to the phone. |
| 555-585 | Black bakelite rotary phone revealed, chrome-ish rim light lines. |
| 585-620 | Finger dials two digits: dial rotates to the finger stop (easeInOutQuad, 9 f) then returns (easeOutQuad, 9 f), twice. |
| 620-640 | Hand lifts handset 50 mm, tilts 25 deg. |
| 640-675 | Six expanding ring waves from the earpiece (spawn every 6 f). A thin luminous line (Geist 200 outline of "hello") draws on 646-672. |
| 675-705 | Rings flatten into rounded rectangles (superellipse n 2->8, aspect 1->2.06) converging on the smartphone outline. |

## Camera keys (world metres, Y up; from data/camera_keyframes.json)
| Frame | Beat | Position | Target | vFOV deg | Lens mm (FF, vertical) | Focus m | Ease into key | Note |
|---|---|---|---|---|---|---|---|---|
| 555 | transit_t_ph | [0.3443, 1.04, -3.935] | [0.2615, 0.86, -2.9886] | 29 | 46.4 | 0.967 | inOutCubic | wire coils into cord |
| 570 | phone_reveal | [-1.3168, 1.04, -3.6178] | [-1.0261, 0.88, -2.8191] | 30 | 44.8 | 0.865 | inOutSine |  |
| 672 | phone_rings | [-1.3099, 1.02, -3.482] | [-1.0261, 0.9, -2.8191] | 30 | 44.8 | 0.731 | inOutSine |  |

Depth of field: bokehScale 4.0.

## Lighting
Overhead softbox RectAreaLight #EAF4FF 5, 1.2x0.6 m; two rim strip RectAreaLights #CFE8FF 6 left/right behind; envMapIntensity 0.8; background #0A0E16.
