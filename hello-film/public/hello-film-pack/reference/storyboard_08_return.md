# Era 08 - Back to the fire (frames 1020-1200, 34.0-40.0 s)

## Beats
| Frames | What happens |
|---|---|
| 1020-1060 | Orb colour lerps white/violet -> #FFC872/#E0A458 and starts flickering with the SAME periodic fire function. |
| 1040-1110 | Camera pulls back through the glass. Screen rounded-rect edge gets fbm-displaced into a ragged rock edge revealing the cave wall behind; phone body dissolves into 1,500 embers. |
| 1060-1120 | Orb drifts down-left and shrinks into the fire key light position (offscreen bottom-left), becoming the fire light. |
| 1110-1170 | The same 4,000 pigment particles stream back and land on their texels; pigment alpha 0->1 (exact reverse of 100-118). |
| 1170-1200 | Settle. Every animated value converges to its frame-0 value; frame 1199 eases into frame 0. |

## Camera keys (world metres, Y up; from data/camera_keyframes.json)
| Frame | Beat | Position | Target | vFOV deg | Lens mm (FF, vertical) | Focus m | Ease into key | Note |
|---|---|---|---|---|---|---|---|---|
| 1020 | chat_orb_full | [-2.7453, 1.12, 1.585] | [-2.5981, 1.12, 1.5] | 30 | 44.8 | 0.17 | inOutSine | phone+camera travel together; background is black |
| 1110 | pullback | [-1.1647, 1.21, 4.3467] | [-0.7765, 1.18, 2.8978] | 33 | 40.5 | 1.5 | inOutCubic | screen edge dissolves into rock edge |
| 1170 | cave_settle | [-0.3851, 1.25, 5.5066] | [-0.2093, 1.2, 2.9927] | 35 | 38.1 | 2.521 | inOutSine |  |
| 1200 | loop_close | [0.0, 1.25, 5.6] | [0.0, 1.2, 3.0] | 35 | 38.1 | 2.6 | inOutSine | MUST equal frame 0 |

Depth of field: bokehScale ramps 0 -> 2.0 by 1170.

## Lighting
Cave rig fades back in 1040-1150; all other rigs fade to 0 by 1150. Final values == frame 0 values.
