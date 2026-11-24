"""
Local voice clone → one WAV per VO phrase (F5-TTS, CPU or CUDA).

  tools/tts/bin/python scripts/audio/gen_vo.py public/gemini-neon-pack/audio            # all phrases
  tools/tts/bin/python scripts/audio/gen_vo.py public/gemini-neon-pack/audio --only P13,P15 --speed 1.0
  tools/tts/bin/python scripts/audio/gen_vo.py public/gemini-neon-pack/audio --score-only

For every phrase: 2–5 seeded takes (stops once 2 pass; up to 5 if they don't) → faster-whisper scoring (exact transcript,
no clipping, not cut off at the edges, word confidence) → best take trimmed to
40 ms of padding → audio/vo/<id>.wav. Every take and its score is logged in
audio/vo/takes.json.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

# id, text as it should be heard (for scoring), text fed to the model
PHRASES = [
    ("P01", "Every element", "Every element."),
    ("P02", "has a nature.", "Has a nature."),
    ("P03", "Carbon goes deep.", "Carbon goes deep."),
    ("P04", "Hydrogen moves fast.", "Hydrogen moves fast."),
    ("P05", "And neon?", "And neon?"),
    ("P06", "Neon waits.", "Neon waits."),
    ("P07", "Until you give it a charge.", "Until you give it a charge."),
    ("P08", "Then it lights the room.", "Then it lights the room."),
    ("P09", "Code.", "Code."),
    ("P10", "Research.", "Research."),
    ("P11", "Science.", "Science."),
    ("P12", "A million tokens.", "A million tokens."),
    ("P13", "One thought.", "One thought."),
    ("P14", "Change course mid-task.", "Change course mid-task."),
    ("P15", "It turns with you.", "It turns with you."),
    ("P16", "Less making it up.", "Less making it up."),
    ("P17", "More getting it done.", "More getting it done."),
    ("P18", "Depth used to cost time.", "Depth used to cost time."),
    ("P19", "Not anymore.", "Not anymore."),
    # the model reads digits badly, so "4" is written out
    ("P20", "Gemini 4 Neon.", "Gemini four Neon."),
]
# Alternative model inputs (same spoken words) for phrases whose takes all fail;
# use with --variant N (takes are then saved as Pxx_vN_sYY_tK.wav)
VARIANTS = {
    "P02": ["Haz a nature.", "Has, a nature.", "Hhas a nature."],  # same sound /hæz/, stronger h
}
SOFTEST = {"P06"}  # "Neon waits." → softest/quietest passing take
TAKES = 5  # max takes per phrase
MIN_TAKES = 2  # stop early once this many takes pass
PAD = 0.040

NUM = {"4": "four", "1": "one"}


def norm(t: str) -> str:
    t = t.lower().replace("-", " ")
    t = re.sub(r"[^a-z0-9' ]", " ", t)
    words = [NUM.get(w, w) for w in t.split()]
    return " ".join(words)


def trim(y: np.ndarray, sr: int, pad=PAD, thresh_db=-42.0):
    """Trim leading/trailing silence (relative to peak) to `pad` seconds."""
    hop = int(sr * 0.005)
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(y, (0, hop)), hop)[::hop]
    rms = np.sqrt((frames**2).mean(1) + 1e-12)
    db = 20 * np.log10(rms / (rms.max() + 1e-12))
    on = np.where(db > thresh_db)[0]
    if len(on) == 0:
        return y, 0.0, 0.0
    a = max(0, on[0] * hop - int(pad * sr))
    b = min(len(y), (on[-1] + 1) * hop + int(pad * sr))
    out = y[a:b].copy()
    f = int(0.005 * sr)  # 5 ms micro-fades against clicks
    out[:f] *= np.linspace(0, 1, f)
    out[-f:] *= np.linspace(1, 0, f)
    return out, a / sr, (len(y) - b) / sr


def edge_energy(y, sr):
    """Energy in the first/last 15 ms vs peak RMS (high = word cut off by the model)."""
    n = int(0.015 * sr)
    pk = np.sqrt(np.mean(y**2)) + 1e-9
    return float(np.sqrt(np.mean(y[:n] ** 2)) / pk), float(np.sqrt(np.mean(y[-n:] ** 2)) / pk)


def lufs(y, sr):
    import pyloudnorm as pyln

    m = pyln.Meter(sr, block_size=min(0.4, len(y) / sr - 0.01))
    try:
        return float(m.integrated_loudness(y))
    except Exception:
        return float(20 * np.log10(np.sqrt(np.mean(y**2)) + 1e-9))


def load_models():
    import torch
    from f5_tts.api import F5TTS
    from faster_whisper import WhisperModel

    return F5TTS(model="F5TTS_v1_Base"), WhisperModel("medium.en", device="cpu", compute_type="int8")


def score_take(model, f: Path, heard: str):
    y, sr = sf.read(f)
    meta = json.loads(f.with_suffix(".json").read_text())
    peak = float(np.max(np.abs(y)))
    yt, _, _ = trim(y, sr)
    e_in, e_out = edge_energy(y, sr)
    segs, _ = model.transcribe(f.as_posix(), beam_size=5, language="en", word_timestamps=True,
                               condition_on_previous_text=False)
    segs = list(segs)
    text = " ".join(s.text.strip() for s in segs)
    words = [w for s in segs for w in s.words]
    conf = float(np.mean([w.probability for w in words])) if words else 0.0
    minconf = float(np.min([w.probability for w in words])) if words else 0.0
    exact = norm(text) == norm(heard)
    reasons = []
    if not exact:
        reasons.append(f"transcript '{text}'")
    # takes are written at -1 dBFS peak, so a sample at the rail means real clipping
    if peak >= 0.995:
        reasons.append("clipping")
    if e_in > 0.35 or e_out > 0.35:
        reasons.append("cut off at edge")
    if minconf < 0.35:
        reasons.append(f"low word confidence {minconf:.2f} (warble/mispronounced)")
    if len(yt) / sr > 0.9 * len(norm(heard).split()) + 1.0:
        reasons.append("too long / dragging")
    return {
        "take": f.name, "seed": meta["seed"], "speed": meta["speed"], "transcript": text,
        "exact": exact, "conf": round(conf, 3), "min_conf": round(minconf, 3),
        "raw_peak": meta.get("raw_peak"), "raw_rms": meta.get("raw_rms"),
        "dur_trimmed": round(len(yt) / sr, 3), "lufs_raw": round(lufs(yt, sr) + meta.get("gain_db", 0.0), 2),
        "pass": not reasons, "reject": reasons,
    }


def run(audio: Path, only, speed: float, score_only: bool, variant: int = 0):
    tts, model = load_models()
    ref = str(audio / "ref-clean.wav")
    ref_text = (audio / "ref-text.txt").read_text(encoding="utf-8").strip()
    vo = audio / "vo"
    takes_dir = vo / "takes"
    takes_dir.mkdir(parents=True, exist_ok=True)
    log_path = vo / "takes.json"
    log = json.loads(log_path.read_text()) if log_path.exists() else {}
    for pid, heard, gen in PHRASES:
        tag = f"_s{int(round(speed * 100))}_"
        if variant:
            if only and pid not in only:
                continue
            gen = VARIANTS[pid][variant - 1]
            tag = f"_v{variant}_s{int(round(speed * 100))}_"
        if only and pid not in only:
            continue
        rows = []
        if score_only:
            for f in sorted(takes_dir.glob(f"{pid}_*t*.wav")):
                rows.append(score_take(model, f, heard))
        else:
            # earlier takes at other speeds stay in the pool
            for f in sorted(takes_dir.glob(f"{pid}_*t*.wav")):
                if tag not in f.name:
                    rows.append(score_take(model, f, heard))
            for k in range(TAKES):
                seed = 1000 + int(pid[1:]) * 10 + k + (0 if abs(speed - 0.9) < 1e-6 else int(speed * 1000)) + variant * 100
                out = takes_dir / f"{pid}{tag}t{k+1}.wav"
                if out.exists() and out.with_suffix(".json").exists():  # resume: reuse finished takes
                    r = score_take(model, out, heard)
                    rows.append(r)
                    print(f"  {pid} take {k+1} (cached): {r['transcript']!r} {'PASS' if r['pass'] else r['reject']}", flush=True)
                    fresh = [x for x in rows if x["pass"] and tag in x["take"]]
                    if k + 1 >= MIN_TAKES and len(fresh) >= MIN_TAKES:
                        break
                    continue
                wav, sr, _ = tts.infer(ref, ref_text, gen, speed=speed, nfe_step=32, seed=seed,
                                       show_info=lambda *a: None, progress=None)
                wav = np.asarray(wav, dtype=np.float64)
                raw_peak = float(np.max(np.abs(wav)))
                gain = min(1.0, 0.891 / max(raw_peak, 1e-9))  # → -1 dBFS peak, never boost
                sf.write(out, wav * gain, sr, subtype="FLOAT")
                meta = {"seed": seed, "speed": speed, "gen_text": gen, "raw_peak": round(raw_peak, 4),
                        "raw_rms": round(float(np.sqrt(np.mean(wav**2))), 4), "gain_db": round(-20 * np.log10(gain), 2)}
                out.with_suffix(".json").write_text(json.dumps(meta))
                r = score_take(model, out, heard)
                rows.append(r)
                print(f"  {pid} take {k+1}: {r['transcript']!r} conf={r['conf']} {'PASS' if r['pass'] else r['reject']}", flush=True)
                fresh = [x for x in rows if x["pass"] and tag in x["take"]]
                if k + 1 >= MIN_TAKES and len(fresh) >= MIN_TAKES:
                    break
        passing = [r for r in rows if r["pass"]]
        pool = passing or [r for r in rows if r["exact"]] or rows
        if pid in SOFTEST:
            best = min(pool, key=lambda r: (r["lufs_raw"], -r["conf"]))
        else:
            best = max(pool, key=lambda r: (r["conf"] + 0.5 * r["min_conf"]))
        y, sr = sf.read(takes_dir / best["take"])
        yt, _, _ = trim(y, sr)
        sf.write(vo / f"{pid}.wav", yt, sr, subtype="FLOAT")
        log[pid] = {"text": heard, "chosen": best["take"], "chosen_pass": best["pass"],
                    "duration": best["dur_trimmed"], "takes": rows}
        status = "OK " if best["pass"] else "WARN"
        print(f"{status} {pid} {heard!r:32} -> {best['take']} {best['dur_trimmed']:.2f}s "
              f"conf={best['conf']:.2f} ({len(passing)}/{len(rows)} takes pass)", flush=True)
        log_path.write_text(json.dumps(log, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", type=Path)
    ap.add_argument("--only", default="")
    ap.add_argument("--speed", type=float, default=0.9)
    ap.add_argument("--score-only", action="store_true")
    ap.add_argument("--variant", type=int, default=0, help="use VARIANTS[pid][N-1] as the model text")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    run(a.audio, only, a.speed, a.score_only, a.variant)
    sys.exit(0)
