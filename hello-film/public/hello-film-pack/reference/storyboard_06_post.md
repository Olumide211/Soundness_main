# Era 06 - The post (frames 690-840, 23.0-28.0 s)

## Beats
| Frames | What happens |
|---|---|
| 690-712 | Rounded-rect light lines become phone edges; glass + aluminium body materialises; screen powers on at 712 (8 f emission ramp). |
| 720-735 | Composer visible; right thumb enters. |
| 735-783 | Thumb types "hello world" per data/social_post_ui.json typingSchedule (key popups, caret #7C5CFF). |
| 788-792 | Thumb taps "post" at 792. |
| 796-806 | Keyboard slides away; post card springs in (scale 0.96->1). |
| 804-836 | Counts spring up to 128 / 342 / 2.4K / 18K (GeistMono tabular). Reply bubbles leave the screen plane in 3D and rise 6 cm. |
| 828-860 | Camera pushes into the screen. |

## Camera keys (world metres, Y up; from data/camera_keyframes.json)
| Frame | Beat | Position | Target | vFOV deg | Lens mm (FF, vertical) | Focus m | Ease into key | Note |
|---|---|---|---|---|---|---|---|---|
| 705 | transit_ph_s | [-2.6517, 1.08, -2.6517] | [-2.1213, 1.0, -2.1213] | 30 | 44.8 | 0.754 | inOutCubic | rings flatten into rounded rects |
| 720 | smartphone_float | [-3.2701, 1.12, -1.1902] | [-2.8191, 1.1, -1.0261] | 30 | 44.8 | 0.48 | inOutSine |  |
| 828 | smartphone_pre | [-3.195, 1.11, -1.1629] | [-2.8191, 1.1, -1.0261] | 30 | 44.8 | 0.4 | inOutSine |  |

Depth of field: bokehScale 2.5 (screen pin-sharp).

## Lighting
Screen as RectAreaLight #FFFFFF 1.5 facing out; rim RectAreaLight #7C5CFF 4 behind; key RectAreaLight #FFFFFF 2 top-left; envMapIntensity 1.0; background #08080B.
