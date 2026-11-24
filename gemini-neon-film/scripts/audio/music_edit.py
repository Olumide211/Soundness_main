"""
Music edit: audio/music.mp3 → audio/music-edit.wav (48 kHz stereo, 28.6 s).

  tools/tts/bin/python scripts/audio/music_edit.py public/gemini-neon-pack/audio

Built only from the licensed track, with no time-stretch: sections are cut from the
track, shifted so its own bass hits land on the locked anchors, and shaped with
the track's harmonic/percussive stems (librosa HPSS, soft masks → H + P = original).

  0.0 – 8.7   A  harmonic stem, low-passed (dark drone) + a faint percussive pulse,
                  percussion fully out 4.4 – 6.7 (strict HPSS drone, margin 4) ("and neon? / neon waits.")
  8.7 – 9.1      hard mute
  9.1 – 20.3  B  full track from a strong hit placed exactly on 9.1 s; thins on the
                  server shot (percussion −12 dB, harmonics low-passed), back up after
  20.3 – 20.9    hard mute (black beat)
  20.9 – 25.0 C  the biggest hit in the track placed exactly on 20.9 s (+2.5 dB);
                  soft under the app UI from 22.8 (−10 dB, low-passed)
  25.0 – 28.6    silence (end card)
All section edges use 30 ms fades.
"""
import json
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt

sys.path.insert(0, str(Path(__file__).parent))
from audio_common import SR, db, hit_onset, hit_strength, load_edl  # noqa: E402

FADE = 0.030


def lpf(x, fc):
    sos = butter(4, fc, btype="low", fs=SR, output="sos")
    return sosfiltfilt(sos, x, axis=-1)


def curve(n, pts):
    t = np.arange(n) / SR
    ts, gs = zip(*pts)
    return np.interp(t, ts, gs)


def hpss(x, margin=1.0):
    """margin 1: soft masks, H + P reconstructs the original exactly.
    margin > 1: stricter harmonic stem (drums/bass transients pushed out)."""
    H = np.stack([librosa.effects.hpss(c, margin=margin)[0] for c in x])
    return H, x - H


def main(audio: Path):
    root = audio.parents[2]
    edl = load_edl(root)
    A = edl["ANCHORS"]
    shots = {s["id"]: s for s in edl["SHOTS"]}
    srv = shots["S19"]
    total = int(round(edl["DURATION"] * SR))
    y, _ = librosa.load(audio / "music.mp3", sr=SR, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    ana = json.loads((audio / "music-analysis.json").read_text())
    usable_end = 104.0  # the track fades out after ~105 s

    # ── rank the track's bass hits (refined to the attack) ──
    cands = []
    for t, _ in ana["low_hits"]:
        if t < 2.0:
            continue
        a = max(0, int((t - 1.0) * SR))
        seg = y[:, a: int((t + 1.0) * SR)]
        on, peak_db = hit_onset(seg, t - a / SR)
        on += a / SR
        jump = hit_strength(y[:, int((on - 1) * SR): int((on + 1) * SR)], 1.0)
        cands.append({"t": on, "peak_db": peak_db, "jump": jump, "score": jump + 0.5 * peak_db})
    cands.sort(key=lambda c: -c["score"])
    lenB = A["blackB"][0] - A["hit1"]  # 11.2 s
    lenC = A["blackC"][0] - A["hit2"]  # 4.1 s
    hC = next(c for c in cands if c["t"] + lenC < usable_end and c["t"] > 9)
    hB = next(c for c in cands if c is not hC and c["t"] + lenB < usable_end and c["t"] > 9
              and (c["t"] + lenB < hC["t"] - 0.5 or c["t"] > hC["t"] + lenC + 0.5))
    print(f"hit for 9.1 s : track {hB['t']:.3f}s  jump {hB['jump']:+.1f} dB  peak {hB['peak_db']:.1f} dB")
    print(f"hit for 20.9 s: track {hC['t']:.3f}s  jump {hC['jump']:+.1f} dB  peak {hC['peak_db']:.1f} dB")

    out = np.zeros((2, total))

    def place(src_start, out_start, out_end):
        """Cut track[src_start …] into out[out_start … out_end]; returns (segment, offset)."""
        n = int(round((out_end - out_start) * SR))
        a = int(round(src_start * SR))
        return y[:, a: a + n].copy(), int(round(out_start * SR))

    # ── A · 0 – 8.7: dark drone + faint pulse, no percussion 4.4 – 6.7 ──
    segA, oA = place(0.0, 0.0, A["muteA"][0])
    _, P = hpss(segA)                # pulse layer (soft-mask percussive stem)
    H, _ = hpss(segA, margin=4.0)    # strict harmonic stem → a drone with ~13 dB less transient content
    H = lpf(H, 1500) * db(6)         # dark, with make-up gain for the strict split
    nA = segA.shape[1]
    gP = curve(nA, [(0, db(-15)), (4.25, db(-15)), (4.4, 0), (6.7, 0), (6.85, db(-15)), (8.55, db(-9)), (9, db(-9))])
    segA = H + P * gP
    segA *= curve(nA, [(0, 0), (0.25, 1), (A["muteA"][0] - FADE, 1), (A["muteA"][0], 0)])
    out[:, oA: oA + nA] += segA * db(-2)

    # ── B · 9.1 – 20.3: full drive from a hit on 9.1, thins on the server shot ──
    pre = FADE
    segB, oB = place(hB["t"] - pre, A["hit1"] - pre, A["blackB"][0])
    H, P = hpss(segB)
    nB = segB.shape[1]
    t0 = A["hit1"] - pre  # timeline time of segB[0]
    s0, s1 = srv["start"] - t0, srv["end"] - t0
    r = 0.12
    thin = curve(nB, [(0, 0), (s0 - r, 0), (s0, 1), (s1 - r, 1), (s1, 0), (nB / SR, 0)])  # 0 → 1 on servers
    Hl = lpf(H, 700)
    segB = H * (1 - thin) + Hl * thin + P * (1 - thin * (1 - db(-12)))
    segB *= 1 - thin * (1 - db(-3))  # and a −3 dB dip
    segB *= curve(nB, [(0, 0), (pre, 1), (nB / SR - FADE, 1), (nB / SR, 0)])
    out[:, oB: oB + nB] += segB

    # ── C · 20.9 – 25.0: the biggest hit on 20.9, soft under the app UI ──
    segC, oC = place(hC["t"] - pre, A["hit2"] - pre, A["blackC"][0])
    nC = segC.shape[1]
    t0 = A["hit2"] - pre
    app = A["app"] - t0
    soft = curve(nC, [(0, 0), (app, 0), (app + 0.15, 1), (nC / SR, 1)])
    segC = segC * (1 - soft) + lpf(segC, 1200) * soft
    g = curve(nC, [(0, 0), (pre, db(2.5)), (app, db(2.5)), (app + 0.15, db(-10)), (nC / SR - FADE, db(-10)), (nC / SR, 0)])
    out[:, oC: oC + nC] += segC * g

    # ── safety: everything outside the sections is exactly zero ──
    for a, b in (A["muteA"], A["blackB"], (A["blackC"][0], edl["DURATION"])):
        ia, ib = int(round(a * SR)), int(round(b * SR))
        if a == A["muteA"][0]:
            ib = int(round((A["hit1"] - pre) * SR))
        if a == A["blackB"][0]:
            ib = int(round((A["hit2"] - pre) * SR))
        out[:, ia:ib] = 0.0
    pk = np.abs(out).max()
    if pk > db(-1):
        out *= db(-1) / pk
    sf.write(audio / "music-edit.wav", out.T, SR, subtype="FLOAT")

    # ── report where the hits really landed ──
    report = {"hit_src": {"9.1": hB, "20.9": hC}}
    for anchor in (A["hit1"], A["hit2"]):
        on, pkdb = hit_onset(out, anchor)
        err = (on - anchor) * 1000
        report[f"landed_{anchor}"] = {"onset": on, "error_ms": err, "peak_db": pkdb}
        print(f"anchor {anchor:5.2f}s → onset {on:.4f}s ({err:+.1f} ms, {abs(err) / 33.33:.2f} frames)  peak {pkdb:.1f} dB")
    (audio / "music-edit.json").write_text(json.dumps(report, indent=1))
    print("wrote", audio / "music-edit.wav")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
