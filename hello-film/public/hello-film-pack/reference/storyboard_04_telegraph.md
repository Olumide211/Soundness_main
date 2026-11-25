# Era 04 - Telegraph (frames 390-540, 13.0-18.0 s)

## Beats
| Frames | What happens |
|---|---|
| 375-405 | Glyphs of "Hello." collapse into their Morse capsules (H ...., e ., l .-.., l .-.., o ---) and slide off the page edge onto the copper wire. |
| 405-425 | Capsules ride the wire to the brass key and are absorbed (scale 1->0, emissive spike). |
| 425-523 | Index finger taps HELLO exactly per data/morse_hello.json (2 f/unit). Key arm rotates -4 deg on each down; contact spark; each down launches an electric pulse along the wire at 1.2 m/s. |
| 523-540 | Last pulse races away along the wire; light fully cold-electric. |

## Camera keys (world metres, Y up; from data/camera_keyframes.json)
| Frame | Beat | Position | Target | vFOV deg | Lens mm (FF, vertical) | Focus m | Ease into key | Note |
|---|---|---|---|---|---|---|---|---|
| 405 | transit_pr_t | [3.2357, 1.1, -2.2656] | [2.4575, 0.9, -1.7207] | 29 | 46.4 | 0.971 | inOutCubic | follow the copper wire |
| 420 | telegraph_key | [1.7667, 0.97, -3.16] | [1.5, 0.85, -2.5981] | 28 | 48.1 | 0.633 | inOutSine |  |
| 522 | telegraph_last | [1.7057, 0.95, -3.1144] | [1.474, 0.85, -2.6131] | 28 | 48.1 | 0.561 | inOutSine | last pulse launches |

Depth of field: bokehScale 6.0 macro (shallow; key arm sharp).

## Lighting
Key RectAreaLight #CFE8FF 4 overhead 0.6x0.3 m; rim RectAreaLight #4C8DFF 8 behind-left; 3 pooled PointLights #CFE8FF 2 cd riding active pulses; envMapIntensity 0.6; background #0B1220.
