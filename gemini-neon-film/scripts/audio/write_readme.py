"""Writes audio/README.md (model, takes per phrase, placement, how to re-run)."""
import json
import sys
from pathlib import Path

audio = Path(sys.argv[1]).resolve()
takes = json.loads((audio / "vo" / "takes.json").read_text())
plan = json.loads((audio / "vo" / "timeline.json").read_text())
music = json.loads((audio / "music-edit.json").read_text())
extra = Path(sys.argv[2]).read_text() if len(sys.argv) > 2 else ""

rows = []
for p in sorted(takes):
    t = takes[p]
    n_pass = sum(r["pass"] for r in t["takes"])
    ch = next(r for r in t["takes"] if r["take"] == t["chosen"])
    meta = json.loads((audio / "vo" / "takes" / t["chosen"]).with_suffix(".json").read_text())
    ch = dict(ch, gen_text=meta.get("gen_text", ""))
    rejects = "; ".join(sorted({x.split(" (")[0] for r in t["takes"] if not r["pass"] for x in r["reject"]}))
    tempo = plan.get("tempo", {}).get(p)
    if ch.get("override"):
        rejects = "manual pick: " + ch["override"]
    rows.append(f"| {p} | {t['text']} | {len(t['takes'])} | {n_pass} | `{t['chosen']}` ({ch['gen_text'] if 'gen_text' in ch else ''}) "
                f"| {plan['at'][p]:.2f} → {plan['end'][p]:.2f} (window {plan['window'][p][1]:.2f}) "
                f"| {('×' + str(tempo)) if tempo else '–'} | {rejects or '–'} |")

src = music["sources"]
over_table = "\n".join(f"- {p} '{takes[p]['text']}': {pct} % faster" for p, pct in plan.get("over_limit", {}).items()) or "- none"
md = f"""# Audio · Gemini 4 Neon

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
{chr(10).join(rows)}

Each line's first word lands exactly on its start time (the file's 40 ms pad starts 40 ms earlier). Every line ends
inside its window, measured sample-accurately on the processed voice track.

**Lines compressed more than the brief's 5 %:** at the requested calm pace, these lines take longer to say than
their window allows, even at speed 1.0. The window, no-overlap and no-cut rules were kept, so they were time-compressed
with ffmpeg `atempo` (pitch-preserving). atempo was tested against rubberband settings on the hardest line and was the only
method whisper read correctly both alone and in context. All of them still transcribe correctly in the final mix:

{over_table}

Subtitles that were more than 3 frames from the voice were moved to the word start:
`then it lights the room.` 9.2 → 9.867 s, `gemini 4 neon.` 21.4 → 21.6 s. No cut moved.

## Music edit (`music-edit.wav`)

librosa analysis (`music-analysis.json`): tempo {json.loads((audio / 'music-analysis.json').read_text())['tempo']:.0f} BPM,
bass hits ranked by the low-band jump. Sections were cut from the track and shifted (**no time-stretch**) so the
track's own hits land on the picture, with 30 ms fades / crossfades on every edge:

| timeline | what | from the track |
|---|---|---|
| 0.000–4.933 | low pulse building (strict-HPSS drone + percussion rising −22 → −8 dB) | 0.0 s |
| 4.933–5.000 | hard mute (black frames) | – |
| 5.000–7.400 | drone only, no percussion | {src['small_hit']['t'] - 3.4:.2f} s |
| 7.400–9.200 | tension rises, small hit on 8.400 | hit at {src['small_hit']['t']:.2f} s |
| 9.200–9.770 | mute (filament dark) | – |
| **9.800** | **main drop** on the filament ignition (frame 294) | hit at {src['main_drop']['t']:.2f} s |
| 18.4–19.6 | thins on the servers (−12 dB percussion, low-pass, −3 dB) | – |
| 20.600 | hit on the fire-sparks burst (30 ms crossfade) | hit at {src['sparks']['t']:.2f} s |
| 21.400–21.537 | mute (hero tube dark) | – |
| **21.567** | **second, bigger hit** on the flicker-on (frame 647), +2.5 dB | hit at {src['bigger_hit']['t']:.2f} s |
| 23.4–24.933 | soft under the app (−10 dB, low-pass 1.2 kHz) | – |
| 24.933–28.6 | hard mute, silent end card | – |

## Mix (`final-mix.wav`)

- VO bus (ffmpeg): `highpass 80 Hz` → `deesser` → `acompressor` 3:1 → `equalizer` +3 dB @ 4 kHz. Dry, with no reverb.
  Line levels are matched (−18 dBFS RMS before the bus). "And neon?" sits 3 dB softer, "Neon waits." 7 dB softer
  (almost a whisper), and "Code." 3 dB louder, because its soft final "d" sits in the busiest bar.
- Music is ducked **−12 dB** under the voice (the top of the 8–12 dB range, keyed from the VO, attack 10 ms, release 250 ms) and comes back up in the gaps.
- Master: gain to −14 LUFS → 4× oversampled limiter → **2-pass loudnorm** (I −14, TP −1, linear) → 48 kHz stereo, 24-bit.
  All mute windows are forced to digital zero.
{extra}
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
"""
(audio / "README.md").write_text(md)
print("wrote", audio / "README.md")
