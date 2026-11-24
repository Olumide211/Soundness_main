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
            line_n = len(target) - nprev if nprev else nprev_keep(target)
            if len(words) < line_n:
                continue
            # cut in the pause before (or after) the line's own words, at its quietest 10 ms
            if nprev:  # keep the LAST line_n words
                first = words[-line_n]
                prev_end = words[-line_n - 1].end if len(words) > line_n else 0.0
                # tight around the first kept word's onset: lines run together with no pause
                # (e.g. "element|has"), so a wide window would catch the previous word's tail
                a = max(prev_end, first.start - 0.05)
                b = first.start + 0.03
            else:  # keep the FIRST 2 words ("and neon")
                a, b = words[1].end, (words[2].start if len(words) > 2 else words[1].end + 0.25)
            a, b = int(a * sr), int(max(b, a + 0.02) * sr)
            win = int(0.01 * sr)
            env = np.convolve(wav**2, np.ones(win) / win, mode="same")
            lo, hi = max(0, a - win), min(len(wav), b + win)
            cut = lo + int(np.argmin(env[lo:hi]))
            piece = wav[cut:] if nprev else wav[:cut]
            f = int(0.005 * sr)
            piece[:f] *= np.linspace(0, 1, f)
            piece[-f:] *= np.linspace(1, 0, f)
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


def nprev_keep(target):
    return 2


def _to16(wav, sr):
    from scipy.signal import resample_poly

    return resample_poly(wav, 16000, sr).astype(np.float32)


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve(), sys.argv[2:])
