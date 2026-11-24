"""
Very short lines generated inside a natural longer sentence, then cut out.

  tools/tts/bin/python scripts/audio/gen_combo.py public/gemini-neon-pack/audio P06 [P02 ...]

F5 crushes very short texts ("Neon waits." came out ~0.48 s and garbled), but paces a
full sentence naturally. So the line is spoken after its neighbour line ("And neon?
Neon waits.") and the second part is cut at the pause between them (whisper word
timestamps + the quietest 10 ms in that gap). The cut piece is saved as a normal take
(Pxx_combo_s90_tK.wav) and scored exactly like any other take by gen_vo.py.
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
from gen_vo import PHRASES, load_models, norm, score_take  # noqa: E402

COMBOS = {  # pid: (full sentence fed to the model, words that belong to the previous line)
    "P06": ("And neon? Neon waits.", 2),
    "P02": ("Every element has a nature.", 2),
    "P05": ("And neon? Neon waits.", 0),  # first part: keep "And neon?"
}
TAKES = 4


def recut(audio: Path, pids):
    """Re-cut saved full sentences (takes/raw) without regenerating."""
    _, model = load_models()
    takes_dir = audio / "vo" / "takes"
    heard = {p: h for p, h, _ in PHRASES}
    for pid in pids:
        text, nprev = COMBOS[pid]
        for raw in sorted((takes_dir / "raw").glob(f"{pid}_combo_*.wav")):
            wav, sr = sf.read(raw)
            segs, _ = model.transcribe(_to16(wav, sr), beam_size=5, language="en", word_timestamps=True,
                                       condition_on_previous_text=False)
            words = [w for s_ in segs for w in s_.words]
            piece = best_cut(model, wav, sr, words, norm(text).split(), nprev, heard[pid])
            if piece is None:
                print(f"  {pid} {raw.name}: no clean cut", flush=True)
                continue
            write_take(takes_dir / raw.name, piece, sr, json.loads((takes_dir / raw.name).with_suffix(".json").read_text())
                       if (takes_dir / raw.name).with_suffix(".json").exists() else {"seed": None}, text)
            r = score_take(model, takes_dir / raw.name, heard[pid], pid)
            print(f"  {pid} take {raw.name} (recut): {r['transcript']!r} conf={r['conf']} "
                  f"{'PASS' if r['pass'] else r['reject']}", flush=True)


def write_take(out, piece, sr, meta, text):
    pk = float(np.max(np.abs(piece)))
    gain = min(1.0, 0.891 / max(pk, 1e-9))
    sf.write(out, piece * gain, sr, subtype="FLOAT")
    meta.update({"speed": 0.9, "gen_text": f"{text} (cut)", "fix_duration": None, "raw_peak": round(pk, 4),
                 "raw_rms": round(float(np.sqrt(np.mean(piece**2))), 4), "gain_db": round(-20 * np.log10(gain), 2)})
    out.with_suffix(".json").write_text(json.dumps(meta))


def main(audio: Path, pids):
    tts, model = load_models()
    ref = str(audio / "ref-clean.wav")
    ref_text = (audio / "ref-text.txt").read_text(encoding="utf-8").strip()
    takes_dir = audio / "vo" / "takes"
    heard = {p: h for p, h, _ in PHRASES}
    for pid in pids:
        text, nprev = COMBOS[pid]
        for k in range(TAKES):
            out = takes_dir / f"{pid}_combo_s90_t{k + 1}.wav"
            if out.exists():
                continue
            seed = 5000 + int(pid[1:]) * 10 + k
            wav, sr, _ = tts.infer(ref, ref_text, text, speed=0.9, nfe_step=32, seed=seed,
                                   show_info=lambda *a: None, progress=None)
            wav = np.asarray(wav, dtype=np.float64)
            (takes_dir / "raw").mkdir(exist_ok=True)
            sf.write(takes_dir / "raw" / out.name, wav, sr, subtype="FLOAT")  # full sentence, for re-cutting
            segs, _ = model.transcribe(wav.astype(np.float32) if sr == 16000 else _to16(wav, sr), beam_size=5,
                                       language="en", word_timestamps=True, condition_on_previous_text=False)
            words = [w for s in segs for w in s.words]
            target = norm(text).split()
            got = [norm(w.word) for w in words]
            print(f"  {pid} combo take {k + 1}: {' '.join(got)!r}", flush=True)
            piece = best_cut(model, wav, sr, words, target, nprev, heard[pid])
            if piece is None:
                continue
            pk = float(np.max(np.abs(piece)))
            gain = min(1.0, 0.891 / max(pk, 1e-9))
            sf.write(out, piece * gain, sr, subtype="FLOAT")
            meta = {"seed": seed, "speed": 0.9, "gen_text": f"{text} (cut)", "fix_duration": None,
                    "raw_peak": round(pk, 4), "raw_rms": round(float(np.sqrt(np.mean(piece**2))), 4),
                    "gain_db": round(-20 * np.log10(gain), 2)}
            out.with_suffix(".json").write_text(json.dumps(meta))
            r = score_take(model, out, heard[pid], pid)
            print(f"  {pid} take {out.name}: {r['transcript']!r} conf={r['conf']} {'PASS' if r['pass'] else r['reject']}",
                  flush=True)


def best_cut(model, wav, sr, words, target, nprev, expected):
    """Lines often run together with no pause, and whisper's word timestamps are only
    ~±50 ms, so try cut points every 10 ms around the boundary and let whisper judge:
    keep the cut whose piece transcribes exactly as the line, with the best confidence."""
    if nprev:
        line_n = len(target) - nprev
        if len(words) < line_n:
            return None
        t0 = words[-line_n].start
        cands = np.arange(t0 - 0.06, t0 + 0.12, 0.01)
    else:
        if len(words) < 2:
            return None
        t0 = words[1].end
        cands = np.arange(t0 - 0.06, t0 + 0.14, 0.01)
    best, best_score = None, -1
    win = int(0.004 * sr)
    env = np.convolve(wav**2, np.ones(win) / win, mode="same")
    for c in cands:
        i = int(c * sr)
        lo, hi = max(0, i - int(0.008 * sr)), min(len(wav), i + int(0.008 * sr))
        i = lo + int(np.argmin(env[lo:hi]))  # nearest quiet sample
        piece = (wav[i:] if nprev else wav[:i]).copy()
        if len(piece) < int(0.15 * sr):
            continue
        f = int(0.005 * sr)
        piece[:f] *= np.linspace(0, 1, f)
        piece[-f:] *= np.linspace(1, 0, f)
        segs, _ = model.transcribe(_to16(piece, sr), beam_size=5, language="en", word_timestamps=True,
                                   condition_on_previous_text=False)
        ws = [w for s_ in segs for w in s_.words]
        if not ws or norm(" ".join(w.word for w in ws)) != norm(expected):
            continue
        score = min(w.probability for w in ws) + np.mean([w.probability for w in ws])
        if score > best_score:
            best, best_score = piece, score
    return best


def _to16(wav, sr):
    from scipy.signal import resample_poly

    return resample_poly(wav, 16000, sr).astype(np.float32)


if __name__ == "__main__":
    args = sys.argv[2:]
    if args and args[0] == "--recut":
        recut(Path(sys.argv[1]).resolve(), args[1:])
    else:
        main(Path(sys.argv[1]).resolve(), args)
