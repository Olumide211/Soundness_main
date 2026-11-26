Build a viral "oddly satisfying" physics + music video in Remotion: "ONE BALL". Work fully autonomously: install everything, fix errors yourself, render, verify, and finish every step without asking me anything.

FORMAT
- 1080x1920 (9:16), 60fps, 26 seconds (1560 frames). H.264, CRF 16, yuv420p, AAC 320kbps audio baked in.
- Also export a 1080x1080 version (same scene scaled ~0.66 and centred, same timing).

CONCEPT
A glowing ring in the centre of a black screen. Inside it, a slowly rotating chrome gear with two curved arms (an S-shaped propeller of two half-circle blades). One ball drops in. Every collision plays a real instrument note AND spawns a new ball. It snowballs from calm to chaos until the ring is completely full, then a white flash bursts everything back to a single ball so the video loops seamlessly into its own first frame.

PHYSICS (deterministic — critical)
- Write a custom fixed-timestep 2D physics sim in TypeScript (60fps x 10 substeps), PRE-SIMULATED in scripts/simulate.ts and saved to src/data/sim.json: per-frame quantised positions of every ball, per-frame ball count, radius, gear angle and screen shake, plus a collision event list [{frame, ballId, target: "ring"|"arm"|"ball", velocity}], the selected audible notes, and the burst particles. Remotion only READS this file — never simulate inside render.
- Seeded RNG only (mulberry32, seed 2026). No Math.random anywhere.
- Ring radius 430px, centred at (540, 880). Gear hub (radius ~66, 14 teeth) + two half-circle arms (arc radius 150, 28px thick) rotate clockwise at 0.35 rev/s as a kinematic body; collide analytically against the arcs and pass the surface velocity into the impulse. Gravity ~1500px/s², restitution 0.92, slight air drag, ball-ball collisions on (spatial hash, positional correction). The ring is a hard constraint applied last so no ball can ever escape.
- Spawning: each ring or arm collision above a velocity threshold spawns 1 new ball at the impact point (cooldown 6 frames per ball). Ball radius shrinks with count from 22px to 11px so the ring can visibly pack.
- Auto-tune the spawn-threshold schedule (re-simulate in a loop, adjusting per 1.5s segment) so the count follows: 1 at 0s, ~10 at 6s, ~50 at 12s, ~200 at 18s, ring ~95% visually full at 22.5s (~1100 balls). Print the count curve and the measured fill %.
- Cap audible notes at max 14 in any sliding 1-second window (strongest impacts first, min 2 frames apart). Visual collisions still all happen.

VISUALS (canvas 2D, sprite-based for hundreds of balls)
- Near-black background (#05050A) with a subtle radial vignette and fine seeded film grain.
- Ring: thin bright stroke with a soft bloom glow; pulses (brightness + 2% scale) on every audible ring hit.
- Gear: chrome look with environment-fixed highlights, bolts and centre cap.
- Arms: light brushed-steel grey with fine concentric brushed lines and bevelled edges. The word "BreezeOg" is ENGRAVED clearly along one blade, starting just past the gear (bold ~21px, dark grey with a light edge highlight), readable and rotating with the blade.
- Balls: glowing, colour cycling through #4C8DFF #7C5CFF #FF4FD8 #FF6B3D #FFD23F #3DFFB0 #3DD6FF. Inner gradient sphere + additive bloom halo + short motion trails (last 6 positions, fading). A ball flashes white for 3 frames when it triggers a note — draw flashing balls LAST so a newly spawned ball never covers the flash.
- Subtle camera push-in (1.0 → 1.08) during the build, easing back to exactly 1.0 for the loop. Tiny screen shake (2–4px, 4 frames) on the strongest impacts.

ON-SCREEN TEXT
- No captions, no watermark. The only text is a live counter below the ring: "balls: 1" counting up in real time (Geist Mono, tabular numbers, white, soft glow), clear of the ring and its bloom, inside 90px safe margins.
- During the burst the counter counts back down to 1.

THE FINALE + LOOP
- 22.5s: ring full, spawning stops. Hold 0.5s with everything vibrating tensely.
- 23.0s: white flash burst — every ball becomes light particles flying outward, ring flares. Particles must stay within ~35px of the ring (never cross the counter).
- 23.0s–26.0s: particles fade, the gear eases (smootherstep correction, full 2π turns so the engraved blade is back in place) to EXACTLY its frame-0 angle, and the single first ball fades back in at its frame-0 position, so the last frame matches the first frame (mean pixel diff < 2/255). Grain on frame 1559 reuses frame 0's tile. Audio returns to silence.

AUDIO (real recorded samples only — NO synthesized/oscillator/AI-generated sound)
- Use the CC0 Versilian Community Sample Library (VCSL, github.com/sgossner/VCSL) via a sparse git checkout in scripts/fetch-samples.sh (gitignored). Marimba (primary), Glockenspiel (sparkle layer on ball-ball hits — VCSL has no celesta), bowed Vibraphone (pad), Hand Chimes (burst chord). Credit VCSL in CREDITS.md.
- Note: VCSL file names are one octave low (C3 = middle C). Measure each sample's real pitch and correct its tuning; trim leading silence so each attack starts on the frame.
- Musical rules: D major pentatonic (D E F# A B) over 3 octaves. Slow/heavy impacts → low register, fast → high. Ring hits = marimba, arm hits = marimba one octave lower, ball-ball = glockenspiel quietly. Map to the exact pitch from the nearest recorded root (sampler-style); never detune.
- Melody: map note events through a 16-step pentatonic pattern that advances with each hit, so it sounds like a tune. As density rises, add a lower-octave marimba doubling layer.
- Velocity → volume and soft/med/loud sample layer; ±1.2 dB deterministic variation; pan from impact x.
- Pad: soft bowed vibraphone in D/A, fading in from 6s, swelling to the climax, out by 23.5s.
- 23.0s burst: a big D major chord (marimba + glockenspiel + hand chimes, all octaves) ringing out, then faded to silence by 25.8s.
- Build the full mix OFFLINE in scripts/mix.ts: place every sample at exactly frame/60 s, convolution reverb (~1.4s tail, ~20% wet), gentle compression, oversampled limiter, loop until integrated −14 LUFS and true peak ≤ −1 dBTP (aim ~−1.9 to survive AAC). Output public/audio/mix.wav, used in the composition with <Audio>.
- Also export out/one-ball.mid (MIDI of all note events).

VERIFICATION (scripts/verify.ts — fix + re-render until all pass)
1. ffprobe: both videos h264, correct size, 60fps, 1560 frames, 26s, exactly one AAC audio stream.
2. Loudness (ffmpeg ebur128) on the final mp4 audio: ~−14 LUFS, true peak ≤ −1 dBTP, no clipping.
3. Sync: pick 10 random notes (seeded); the ball's pixels must turn white exactly on the note frame (not the frame before), and the audio onset must be within 1 frame. Measure onset rigorously: isolate each note by re-mixing the dry premaster without it and subtracting, then add the cross-correlated offset of the final AAC track vs the premaster (energy-based onset detection is fooled by ringing from earlier notes).
4. Loop diff: frame 1559 vs frame 0, mean < 2/255, both formats.
5. Ball count curve within ±20% of the targets; no ball ever outside the ring.
6. Stills at 0s, 3s, 8s, 14s, 20s, 22.8s, 23.1s, 25.9s to ./qa/ for both formats; check no clipped text, the counter clears the ring + bloom, and inspect them visually.
7. Max 14 note onsets in any 1-second window; no clipping.

OUTPUTS
- out/one-ball-9x16.mp4
- out/one-ball-1x1.mp4
- out/one-ball.mid
- CREDITS.md
- qa/ stills + qa/report.json
Print a short report of the final numbers at the end.
