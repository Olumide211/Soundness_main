"""
Fit the VO to the locked picture and sync the subtitles to the voice.

  tools/tts/bin/python scripts/audio/fit_timeline.py public/gemini-neon-pack/audio [--write]

- Each phrase file (audio/vo/Pxx.wav) has exactly 40 ms of padding, so the first
  word starts at file + 0.040 s. Each phrase is placed so its first word lands on
  its start time below, and must end before its window closes (never crossing a cut).
- Too long → time-compress (rubberband, formant-preserved). ≤ 5 % is the brief's limit; lines that
  still don't fit at speed 1.0 are compressed further to keep the window/cut rule, and listed as
  `over_limit` in timeline.json and in audio/README.md.
- Subtitles: if a cue's in-time differs from its word start by more than 3 frames,
  the subtitle moves to the word start (snapped to a frame). Cuts never move.
- --write updates the CUES in src/edl.ts; the plan goes to audio/vo/timeline.json.
"""
import json
import re
import sys
from pathlib import Path

import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
from audio_common import load_edl  # noqa: E402

PAD = 0.040
FPS = 30
MAX_COMPRESS = 0.05  # the brief's limit
MAX_HARD = 0.45  # beyond this, refuse (speech would be unusable)

# phrase: (start of the first word, window end) — from the brief, on the locked cut
WINDOWS = {
    "P01": (0.05, 1.00), "P02": (1.05, 2.00), "P03": (2.05, 3.40), "P04": (3.55, 4.90),
    "P05": (5.10, 6.50), "P06": (6.65, 7.35), "P07": (7.45, 8.40), "P08": (9.85, 10.75),
    "P09": (10.85, 11.35), "P10": (11.45, 11.95), "P11": (12.05, 12.55), "P12": (12.65, 13.45),
    "P13": (13.55, 14.35), "P14": (14.45, 15.25), "P15": (15.35, 16.15), "P16": (16.25, 17.15),
    "P17": (17.25, 18.35), "P18": (18.45, 19.55), "P19": (19.65, 20.55), "P20": (21.60, 23.30),
}


def snap(t):
    return round(t * FPS) / FPS


def main(audio: Path, write: bool):
    root = audio.parents[2]
    edl = load_edl(root)
    cues = {c["vo"]: dict(c) for c in edl["CUES"]}
    plan = {"at": {}, "end": {}, "dur": {}, "tempo": {}, "window": WINDOWS, "subs": {}, "problems": []}
    for p, (start, wend) in WINDOWS.items():
        y, sr = sf.read(audio / "vo" / f"{p}.wav")
        speech = len(y) / sr - 2 * PAD
        room = wend - start - 0.02  # keep ≥ 20 ms before the window closes
        tempo = 1.0
        if speech > room:
            need = speech / room - 1
            tempo = round(1 + need + 0.002, 4)
            if need > MAX_COMPRESS:
                # the window is shorter than the voice can say the line cleanly even at
                # speed 1.0: compress it to fit (the window/cut rule wins), and report it
                plan.setdefault("over_limit", {})[p] = round(need * 100, 1)
                if need > MAX_HARD:
                    plan["problems"].append(f"{p} '{cues[p]['text']}' is {speech:.2f}s, window {room:.2f}s "
                                            f"(needs {need * 100:.1f}% compression)")
        plan["at"][p] = start
        plan["dur"][p] = round(speech, 3)
        plan["end"][p] = round(start + speech / tempo, 3)
        if tempo != 1.0:
            plan["tempo"][p] = tempo
        # subtitle sync: move only if the word start is more than 3 frames away
        off = (start - cues[p]["at"]) * FPS
        if abs(off) > 3.0 + 1e-6:
            plan["subs"][p] = {"from": cues[p]["at"], "to": snap(start)}
    (audio / "vo" / "timeline.json").write_text(json.dumps(plan, indent=1))

    for p, (start, wend) in WINDOWS.items():
        tt = f"  tempo ×{plan['tempo'][p]}" if p in plan["tempo"] else ""
        mv = f"  subtitle {plan['subs'][p]['from']} → {plan['subs'][p]['to']:.3f}" if p in plan["subs"] else ""
        print(f"{p} {start:6.2f} → {plan['end'][p]:6.3f}  (window ends {wend:5.2f}, speech {plan['dur'][p]:.2f}s){tt}{mv}"
              f"   {cues[p]['text']}")
    for p, pct in plan.get("over_limit", {}).items():
        print(f"OVER 5% LIMIT: {p} compressed {pct}% to fit its window")
    for pr in plan["problems"]:
        print("PROBLEM:", pr)

    if write and not plan["problems"]:
        src = (root / "src" / "edl.ts").read_text()
        for p, mv in plan["subs"].items():
            src, n = re.subn(rf"(\{{vo: '{p}',[^}}]*?at: )[\d.]+", lambda m: f"{m.group(1)}{mv['to']:.3f}", src)
            assert n == 1, p
        (root / "src" / "edl.ts").write_text(src)
        print("updated subtitle in-times in src/edl.ts:", {p: round(m["to"], 3) for p, m in plan["subs"].items()})
    return 1 if plan["problems"] else 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]).resolve(), "--write" in sys.argv))
