# Era 07 - AI reply (frames 840-1020, 28.0-34.0 s)

## Beats
| Frames | What happens |
|---|---|
| 840-862 | The published post card morphs into the right-aligned user bubble "hello world" (shared rounded-rect). |
| 880-966 | Reply streams token by token at the tokenFrames in data/chat_ui.json; each token fades 5 f with blur 6->0 px; cursor glow #7C5CFF. |
| 880-1020 | 24 light particles per token arc into the orb; orb radius 6 -> 120 pt (smoothstep). |
| 990-1015 | Orb particles briefly arrange into the hand-stencil outline (svg/hand_stencil_silhouette.svg) - hand motif - then release. |
| 966-1020 | Text dims to 30%; orb pulses slowly (0.5 Hz). |

## Camera keys (world metres, Y up; from data/camera_keyframes.json)
| Frame | Beat | Position | Target | vFOV deg | Lens mm (FF, vertical) | Focus m | Ease into key | Note |
|---|---|---|---|---|---|---|---|---|
| 828 | smartphone_pre | [-3.195, 1.11, -1.1629] | [-2.8191, 1.1, -1.0261] | 30 | 44.8 | 0.4 | inOutSine |  |
| 860 | chat_inside | [-3.1391, 1.1, -0.4412] | [-2.9708, 1.1, -0.4175] | 30 | 44.8 | 0.17 | inOutCubic | screen fills >100% of frame; phone becomes carrier-parented from here |
| 1020 | chat_orb_full | [-2.7453, 1.12, 1.585] | [-2.5981, 1.12, 1.5] | 30 | 44.8 | 0.17 | inOutSine | phone+camera travel together; background is black |

Depth of field: DOF off (screen fills frame).

## Lighting
Screen content unlit (emissive canvas texture, toneMapped=false); Bloom threshold 0.8 intensity 0.6 drives the orb glow.
