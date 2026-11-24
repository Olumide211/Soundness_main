"""
Fit the VO to the edit and write the result back into src/edl.ts.

  tools/tts/bin/python scripts/audio/fit_timeline.py public/gemini-neon-pack/audio [--write]

- Each phrase file (audio/vo/Pxx.wav) starts with exactly 40 ms of padding, so the
  first word starts at file + 0.040 s. A phrase is placed so its first word lands
  on its cue time (= subtitle in-time).
- Fixed cues (from the brief) stay put. If a phrase would run into the next cue
  or a locked boundary, it is time-compressed (≤ 5 %, atempo); if that is not
  enough the script reports it so the phrase can be regenerated at speed 1.0.
- P15–P19 ("it turns with you" → "not anymore") are laid out after P14 with even
  gaps up to 20.3 s; their shot cuts follow the phrases: murmuration keeps "it
  turns with you" ≥ 0.8 s, water drop / typing / servers (~1.2 s) / light tunnel.
- All times are snapped to whole frames (1/30 s).
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
GAP = 0.10  # min silence between phrases
MAX_COMPRESS = 0.05


def snap(t):
    return round(t * FPS) / FPS


def main(audio: Path, write: bool):
    root = audio.parents[2]
    edl = load_edl(root)
    A = edl["ANCHORS"]
    cues = {c["vo"]: dict(c) for c in edl["CUES"]}
    dur = {}
    for pid in cues:
        y, sr = sf.read(audio / "vo" / f"{pid}.wav")
        dur[pid] = len(y) / sr - 2 * PAD  # speech length
    # hard right-hand limits for each section
    limit = {"A": A["muteA"][0], "B": A["blackB"][0], "C": A["app"]}
    section = {p: ("A" if p <= "P07" else "C" if p == "P20" else "B") for p in cues}
    order = sorted(cues)

    # ── fixed cues from the brief ──
    fixed = {"P01": 0.0, "P02": 0.9, "P03": 1.8, "P04": 2.8, "P05": 4.4, "P06": 5.6, "P07": 6.7,
             "P08": 9.1, "P09": 10.1, "P10": 10.9, "P11": 11.8, "P12": 12.7, "P13": 13.6, "P14": 14.3,
             "P20": 20.9}
    at = dict(fixed)

    # ── P15–P19: lay out between end of P14 and 20.3 ──
    free = ["P15", "P16", "P17", "P18", "P19"]
    start = at["P14"] + dur["P14"] + GAP
    end = limit["B"] - 0.12  # keep a breath before the black beat
    total = sum(dur[p] for p in free)
    slack = end - start - total
    gap = max(GAP, slack / len(free))
    t = start
    for p in free:
        at[p] = snap(t)
        t = at[p] + dur[p] + gap

    # ── tempo fixes: phrase must end GAP before the next cue / section limit ──
    tempo = {}
    problems = []
    for i, p in enumerate(order):
        nxt = order[i + 1] if i + 1 < len(order) else None
        room = limit[section[p]] - at[p] - 0.05
        if nxt and section[nxt] == section[p]:
            room = min(room, at[nxt] - at[p] - GAP)
        if dur[p] > room:
            need = dur[p] / room - 1
            if need <= MAX_COMPRESS:
                tempo[p] = round(1 + need + 0.003, 4)
            else:
                problems.append(f"{p} needs {need*100:.1f}% compression (dur {dur[p]:.2f}s, room {room:.2f}s)")

    # ── shots follow P15–P19 ──
    shots = {
        "S16": (14.3, at["P16"]),
        "S17": (at["P16"], at["P17"]),
        "S18": (at["P17"], at["P18"]),
        "S19": (at["P18"], at["P19"]),
        "S20": (at["P19"], A["blackB"][0]),
    }
    shots = {k: (snap(a), snap(b)) for k, (a, b) in shots.items()}
    if at["P16"] - at["P15"] < 0.8:
        problems.append("'it turns with you.' shows < 0.8 s")

    # ── subtitles: on at the word start, off at the next cue / hard stop ──
    hard = {"P04": 4.333, "P07": A["muteA"][0], "P19": A["blackB"][0], "P20": A["app"]}
    for i, p in enumerate(order):
        cues[p]["at"] = round(at[p], 3)
        nxt = order[i + 1] if i + 1 < len(order) else None
        cues[p]["until"] = round(hard.get(p, at[nxt] if nxt else A["app"]), 3)

    plan = {"at": at, "dur": dur, "tempo": tempo, "shots": shots, "problems": problems}
    (audio / "vo" / "timeline.json").write_text(json.dumps(plan, indent=1))
    for p in order:
        tt = f" tempo ×{tempo[p]}" if p in tempo else ""
        print(f"{p} at {at[p]:6.3f}  dur {dur[p]:.2f}  ends {at[p] + dur[p] / tempo.get(p, 1):6.3f}{tt}   {cues[p]['text']}")
    for k, (a, b) in shots.items():
        print(f"{k} {a:.3f}–{b:.3f} ({b - a:.2f}s)")
    for pr in problems:
        print("PROBLEM:", pr)

    if write and not problems:
        src = (root / "src" / "edl.ts").read_text()
        for p, c in cues.items():
            src = re.sub(rf"(\{{vo: '{p}',[^}}]*?at: )[\d.]+(,\s*until: )[\d.]+",
                         lambda m: f"{m.group(1)}{c['at']}{m.group(2)}{c['until']}", src)
        for k, (a, b) in shots.items():
            src = re.sub(rf"(\{{id: '{k}',[^}}]*?start: )[\d.]+(,\s*end: )[\d.]+",
                         lambda m: f"{m.group(1)}{a:.3f}{m.group(2)}{b:.3f}", src)
        (root / "src" / "edl.ts").write_text(src)
        print("updated src/edl.ts")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]).resolve(), "--write" in sys.argv))
