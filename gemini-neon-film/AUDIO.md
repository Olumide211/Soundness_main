# Audio · Gemini 4 Neon

Everything here was made locally: no online or paid APIs. The only sources are
`my-voice-ref.mp3` (the voice) and `music.mp3` (the licensed track). There are no
sound effects, risers or generated music.

## Voice model

- **F5-TTS** (`F5TTS_v1_Base`, pip `f5-tts`), zero-shot voice clone, 32 flow steps, CPU
  (no NVIDIA GPU in this environment: `nvidia-smi` not found → PyTorch CPU wheels).
- XTTS-v2 fallback was not needed.
- Environment: `tools/tts` (Python 3.11 venv): torch 2.11 CPU, torchaudio, torchcodec (CPU build),
  f5-tts, faster-whisper, librosa, pyloudnorm.
- Scoring: faster-whisper `medium.en` per take. Final check: `large-v3` on the whole mix (medium.en flipped words
  between near-identical mixes, so it is not used for the verdict). All int8 on CPU.

## Reference (`ref-clean.wav`, `ref-text.txt`)

`my-voice-ref.mp3` → ffmpeg mono 24 kHz, `highpass=f=80`, `afftdn=nr=10:nf=-45` → `ref-den.wav`.
The only continuous calm stretch longer than 4.5 s contains a self-correction ("um, I'm trying to… no"),
so the cleanest phrases were spliced with short natural pauses (10 ms crossfades):
0.60–2.95 s + 7.62–12.45 s + 13.05–13.95 s + 14.45–15.70 s = **9.3 s**, then 2-pass loudnorm to **−18 LUFS** (measured −18.2).
`ref-text.txt` is the faster-whisper transcript with two corrections ("cloud" → "Claude", added punctuation),
because F5 conditions on the exact words spoken.

## Takes per phrase

Each line gets 2–5 seeded takes at speed 0.9, and stops early once 2 pass. Lines too long for their window were
regenerated at speed 1.0. Every take is scored with faster-whisper `medium.en`: the transcript must match exactly
(the one exception is "weights" for "waits", which are identical sounds), with no clipping, no word cut off at an edge, and
no low word confidence (warble / mispronounced). The best passing take is trimmed to 40 ms padding (`vo/Pxx.wav`).
"Neon waits." uses the softest passing take. All takes and scores are in `vo/takes.json`, and the audio is in `vo/takes/`.

Very short lines were hard for F5 with this reference, because it crushes the words. Fixes used:
- **Natural length for one-word lines** (`--variant`, F5 `fix_duration`): "Research.", "Science.".
- **Line cut from a full sentence** (`gen_combo.py`): "Neon waits." is cut from "And neon? Neon waits.".
  "has a nature." is cut from "Every element has a nature." (cut at 1.105 s, right after the "t" of "element").
- **Manual picks** (`OVERRIDES` in `gen_vo.py`, reason in the table): P02 and P15, both verified on the final mix.

| id | line | takes | pass | chosen (model text) | placed (s) | tempo | notes / rejection reasons seen |
|---|---|---|---|---|---|---|---|
| P01 | Every element | 2 | 2 | `P01_s90_t2.wav` (Every element.) | 0.05 → 0.78 (window 1.00) | – | – |
| P02 | has a nature. | 7 | 0 | `P02_cut1105_s90_t1.wav` (Every element has a nature. (cut at 1.105 s, after the 't' of 'element')) | 1.05 → 1.82 (window 2.00) | – | manual pick: cut from 'Every element has a nature.' right after the 't' of 'element'; the 'h' of 'has' is soft, so whisper on the isolated clip hears 'as a nature' but hears 'has a nature' in context (after 'every element', as in the film). Verified on the final mix. |
| P03 | Carbon goes deep. | 2 | 2 | `P03_s90_t1.wav` (Carbon goes deep.) | 2.05 → 2.95 (window 3.40) | – | – |
| P04 | Hydrogen moves fast. | 2 | 2 | `P04_s90_t1.wav` (Hydrogen moves fast.) | 3.55 → 4.62 (window 4.90) | – | – |
| P05 | And neon? | 5 | 1 | `P05_s90_t4.wav` (And neon?) | 5.10 → 5.96 (window 6.50) | – | low word confidence 0.14; low word confidence 0.31; transcript 'A neon.'; transcript 'And noon.'; transcript 'Annun.'; transcript 'and noon.' |
| P06 | Neon waits. | 14 | 2 | `P06_combo_s90_t4.wav` (And neon? Neon waits. (cut)) | 6.65 → 7.33 (window 7.35) | ×1.3404 | cut off at edge; low word confidence 0.06; low word confidence 0.13; low word confidence 0.16; low word confidence 0.18; low word confidence 0.23; low word confidence 0.32; low word confidence 0.34; transcript 'NEOM'; transcript 'NEON WEIGHT'; transcript 'Neo'; transcript 'Neon Wait.'; transcript 'Neon wait'; transcript 'New'; transcript 'Nio'; transcript 'and neon weights'; transcript 'minimum weights.'; transcript 'neon wait'; transcript 'neon way' |
| P07 | Until you give it a charge. | 8 | 4 | `P07_s100_t1.wav` (Until you give it a charge.) | 7.45 → 8.38 (window 8.40) | ×1.4651 | cut off at edge; low word confidence 0.31; low word confidence 0.33; low word confidence 0.35; transcript 'And you give it a charge.'; transcript 'Do you give a'; transcript 'and give it a chart.'; transcript 'until you' |
| P08 | Then it lights the room. | 2 | 2 | `P08_s100_t1.wav` (Then it lights the room.) | 9.85 → 10.73 (window 10.75) | ×1.1387 | – |
| P09 | Code. | 8 | 4 | `P09_s95_t1.wav` (Code.) | 10.85 → 11.32 (window 11.35) | – | low word confidence 0.07; low word confidence 0.22; low word confidence 0.23; transcript 'Good'; transcript 'Good.' |
| P10 | Research. | 5 | 3 | `P10_v1_s90_t2.wav` (Research.) | 11.45 → 11.81 (window 11.95) | – | low word confidence 0.11; low word confidence 0.28; transcript 'Please, sir.' |
| P11 | Science. | 5 | 3 | `P11_v1_s90_t2.wav` (Science.) | 12.05 → 12.40 (window 12.55) | – | low word confidence 0.00; low word confidence 0.04; transcript ''; transcript 'sign' |
| P12 | A million tokens. | 5 | 1 | `P12_s100_t2.wav` (A million tokens.) | 12.65 → 13.43 (window 13.45) | ×1.095 | low word confidence 0.14; low word confidence 0.24; low word confidence 0.33; transcript 'A million took an'; transcript 'a million token'; transcript 'million tokens' |
| P13 | One thought. | 4 | 2 | `P13_s90_t4.wav` (One thought.) | 13.55 → 14.09 (window 14.35) | – | cut off at edge; low word confidence 0.00; transcript ''; transcript 'One third' |
| P14 | Change course mid-task. | 11 | 1 | `P14_s100_t4.wav` (Change course mid-task.) | 14.45 → 15.23 (window 15.25) | ×1.4504 | low word confidence 0.07; low word confidence 0.20; low word confidence 0.23; low word confidence 0.27; low word confidence 0.30; transcript 'Change commit task.'; transcript 'Change cosmic task.'; transcript 'Change cosmic tasks.'; transcript 'Change course mid-test.'; transcript 'Change course test'; transcript 'Change course.'; transcript 'change quintessence.' |
| P15 | It turns with you. | 2 | 2 | `P15_s100_t2.wav` (It turns with you.) | 15.35 → 16.13 (window 16.15) | ×1.1065 | manual pick: clearer 'it' than t1: with t1, whisper large-v3 heard 'returns with you' in the final mix. t2 needs 11 % compression instead of 7 %. |
| P16 | Less making it up. | 3 | 2 | `P16_s100_t3.wav` (Less making it up.) | 16.25 → 17.12 (window 17.15) | – | low word confidence 0.32 |
| P17 | More getting it done. | 2 | 2 | `P17_s100_t1.wav` (More getting it done.) | 17.25 → 18.23 (window 18.35) | – | – |
| P18 | Depth used to cost time. | 2 | 2 | `P18_s100_t2.wav` (Depth used to cost time.) | 18.45 → 19.53 (window 19.55) | ×1.0582 | – |
| P19 | Not anymore. | 2 | 2 | `P19_s90_t2.wav` (Not anymore.) | 19.65 → 20.22 (window 20.55) | – | – |
| P20 | Gemini 4 Neon. | 5 | 2 | `P20_s90_t2.wav` (Gemini four Neon.) | 21.60 → 22.55 (window 23.30) | – | transcript 'Germany for neon'; transcript 'Germany for neon.' |

Each line's first word lands exactly on its start time (the file's 40 ms pad starts 40 ms earlier). Every line ends
inside its window, measured sample-accurately on the processed voice track.

**Lines compressed more than the brief's 5 %:** at the requested calm pace, these lines take longer to say than
their window allows, even at speed 1.0. The window, no-overlap and no-cut rules were kept, so they were time-compressed
with ffmpeg `atempo` (pitch-preserving). atempo was tested against rubberband settings on the hardest line and was the only
method whisper read correctly both alone and in context. All of them still transcribe correctly in the final mix:

- P06 'Neon waits.': 33.8 % faster
- P07 'Until you give it a charge.': 46.3 % faster
- P08 'Then it lights the room.': 13.7 % faster
- P12 'A million tokens.': 9.3 % faster
- P14 'Change course mid-task.': 44.8 % faster
- P15 'It turns with you.': 10.4 % faster
- P18 'Depth used to cost time.': 5.6 % faster

Subtitles that were more than 3 frames from the voice were moved to the word start:
`then it lights the room.` 9.2 → 9.867 s, `gemini 4 neon.` 21.4 → 21.6 s. No cut moved.

## Music edit (`music-edit.wav`)

librosa analysis (`music-analysis.json`): tempo 152 BPM,
bass hits ranked by the low-band jump. Sections were cut from the track and shifted (**no time-stretch**) so the
track's own hits land on the picture, with 30 ms fades / crossfades on every edge:

| timeline | what | from the track |
|---|---|---|
| 0.000–4.933 | low pulse building (strict-HPSS drone + percussion rising −22 → −8 dB) | 0.0 s |
| 4.933–5.000 | hard mute (black frames) | – |
| 5.000–7.400 | drone only, no percussion | 27.81 s |
| 7.400–9.200 | tension rises, small hit on 8.400 | hit at 31.21 s |
| 9.200–9.770 | mute (filament dark) | – |
| **9.800** | **main drop** on the filament ignition (frame 294) | hit at 34.36 s |
| 18.4–19.6 | thins on the servers (−12 dB percussion, low-pass, −3 dB) | – |
| 20.600 | hit on the fire-sparks burst (30 ms crossfade) | hit at 23.42 s |
| 21.400–21.537 | mute (hero tube dark) | – |
| **21.567** | **second, bigger hit** on the flicker-on (frame 647), +2.5 dB | hit at 79.56 s |
| 23.4–24.933 | soft under the app (−10 dB, low-pass 1.2 kHz) | – |
| 24.933–28.6 | hard mute, silent end card | – |

## Mix (`final-mix.wav`)

- VO bus (ffmpeg): `highpass 80 Hz` → `deesser` → `acompressor` 3:1 → `equalizer` +3 dB @ 4 kHz. Dry, with no reverb.
  Line levels are matched (−18 dBFS RMS before the bus). "And neon?" sits 3 dB softer, "Neon waits." 7 dB softer
  (almost a whisper), and "Code." 3 dB louder, because its soft final "d" sits in the busiest bar.
- Music is ducked **−12 dB** under the voice (the top of the 8–12 dB range, keyed from the VO, attack 10 ms, release 250 ms) and comes back up in the gaps.
- Master: gain to −14 LUFS → 4× oversampled limiter → **2-pass loudnorm** (I −14, TP −1, linear) → 48 kHz stereo, 24-bit.
  All mute windows are forced to digital zero.

## Re-run any step

All commands run from the project folder (`gemini-neon-film/`). `A=public/gemini-neon-pack/audio`, `PY=tools/tts/bin/python`.

```bash
node --experimental-strip-types scripts/export-edl.mjs            # src/edl.ts → out/edl.json (run after editing the EDL)
$PY scripts/audio/transcribe_ref.py $A                            # ref-text.txt from ref-clean.wav
$PY scripts/audio/gen_vo.py $A                                    # all phrases (resumes; finished takes are reused)
$PY scripts/audio/gen_vo.py $A --only P10 --variant 1 --max-takes 3   # retry a line with a variant (VARIANTS)
$PY scripts/audio/gen_combo.py $A P06                             # cut a short line out of a full sentence
$PY scripts/audio/gen_vo.py $A --only P13 --speed 1.0             # retry one line faster
$PY scripts/audio/gen_vo.py $A --score-only                       # rescore every take, re-pick the best
$PY scripts/audio/fit_timeline.py $A --write                      # place lines, check windows, sync subtitles
$PY scripts/audio/analyse_music.py $A                             # librosa analysis
$PY scripts/audio/music_edit.py $A                                # music-edit.wav
$PY scripts/audio/mix.py $A                                       # final-mix.wav
npm run render:16x9 && npm run render:9x16                        # silent picture (out/gemini-neon-*.mp4)
npm run mux                                                       # → out/gemini-neon-*-final.mp4 (AAC 320 kbps)
$PY scripts/audio/check.py $A out/gemini-neon-16x9-final.mp4 out/gemini-neon-9x16-final.mp4
```

To fully re-create the voice from scratch, delete `vo/` first. Seeds are fixed, so the same takes come back.
