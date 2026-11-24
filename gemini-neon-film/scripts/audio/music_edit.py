"""
Music edit: audio/music.mp3 → audio/music-edit.wav (48 kHz stereo, 28.6 s).

  tools/tts/bin/python scripts/audio/analyse_music.py public/gemini-neon-pack/audio   (once)
  tools/tts/bin/python scripts/audio/music_edit.py public/gemini-neon-pack/audio

Built only from the licensed track, with NO time-stretch: sections are cut from the
track and shifted so the track's own bass hits land on the picture anchors
(src/edl.ts ANCHORS), then shaped with the track's own harmonic/percussive stems
(librosa HPSS). Every section edge is a 30 ms fade / crossfade.

  0.000 – 4.933   A   low pulse building: strict-HPSS drone (dark) + percussion rising −22 → −8 dB
  4.933 – 5.000       hard mute (2 black frames)
  5.000 – 7.400   A2  drone only, no percussion ("and neon? / neon waits.")
  7.400 – 9.200   A2  tension rises: filter opens, percussion back in, a small hit lands on 8.4
  9.200 – 9.800       near-silence (filament dark)
  9.800           B   MAIN DROP: a strong hit from the track exactly on the filament ignition
  9.8 – 18.4      B   full drive under the fast lines
  18.4 – 19.6     B   thins on the servers (percussion −12 dB, harmonics low-passed, −3 dB)
  20.600          S   30 ms crossfade into another hit for the fire-sparks burst
  21.400 – 21.567     near-silence (hero tube dark)
  21.567          C   SECOND, BIGGER HIT (the track's strongest, +2.5 dB) on the flicker-on
  23.4 – 24.933   C   soft under the app recording (−10 dB, low-passed)
  24.933 – 28.6       hard mute, silent end card
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
PRE = FADE  # each hit section starts 30 ms before its hit (fade-in ends on the hit)


def lpf(x, fc):
    sos = butter(4, fc, btype="low", fs=SR, output="sos")
    return sosfiltfilt(sos, x, axis=-1)


def curve(n, pts):
    t = np.arange(n) / SR
    ts, gs = zip(*pts)
    return np.interp(t, ts, gs)


def hpss(x, margin=1.0):
    """margin 1: soft masks, H + P reconstructs the original exactly.
    margin > 1: stricter harmonic stem (drums / bass transients pushed out)."""
    H = np.stack([librosa.effects.hpss(c, margin=margin)[0] for c in x])
    return H, x - H


def main(audio: Path):
    root = audio.parents[2]
    edl = load_edl(root)
    A = edl["ANCHORS"]
    dur = edl["DURATION"]
    total = int(round(dur * SR))
    y, _ = librosa.load(audio / "music.mp3", sr=SR, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    ana = json.loads((audio / "music-analysis.json").read_text())
    usable_end = 104.0  # the track fades out after ~105 s

    # ── rank the track's bass hits (refined to the attack) ──
    cands = []
    for t, _ in ana["low_hits"]:
        if t < 2.0 or t > usable_end:
            continue
        a = int((t - 1.0) * SR)
        on, peak_db = hit_onset(y[:, a: int((t + 1.0) * SR)], t - a / SR)
        on += a / SR
        jump = hit_strength(y[:, int((on - 1) * SR): int((on + 1) * SR)], 1.0)
        cands.append({"t": round(on, 4), "peak_db": round(peak_db, 2), "jump": round(jump, 2),
                      "score": jump + 0.5 * peak_db})
    cands.sort(key=lambda c: -c["score"])

    used = []  # source regions already taken (no repeated material)

    def pick(before, after):
        """Best-ranked hit whose region [t-before, t+after] is free and inside the track."""
        for c in cands:
            a, b = c["t"] - before, c["t"] + after
            if a < 0 or b > usable_end or any(a < ub and b > ua for ua, ub in used):
                continue
            used.append((a, b))
            return c
        raise SystemExit("no free hit left in the track")

    lenC = A["mute"] - A["hit2"]                 # 3.37 s
    lenB = A["sparks"] - A["hit1"]               # 10.8 s
    lenS = A["dropOut2"][0] - A["sparks"]        # 0.8 s
    a2_lead = A["smallHit"] - A["muteA"][1]      # 3.4 s of A2 before its small hit
    a2_tail = A["dropOut"][0] - A["smallHit"]    # 0.8 s after
    hC = pick(PRE, lenC)          # strongest → second, bigger hit on the hero tube
    hB = pick(PRE, lenB)          # next → main drop on the filament
    hS = pick(PRE, lenS)          # fire-sparks
    hSm = pick(a2_lead, a2_tail)  # small hit on the plasma (8.4)
    for name, c, at in (("main drop", hB, A["hit1"]), ("sparks", hS, A["sparks"]),
                        ("bigger hit", hC, A["hit2"]), ("small hit", hSm, A["smallHit"])):
        print(f"{name:10s} @ {at:6.3f}s ← track {c['t']:7.3f}s  jump {c['jump']:+.1f} dB  peak {c['peak_db']:.1f} dB")

    out = np.zeros((2, total))

    def cut(src_start, out_start, out_end):
        n = int(round((out_end - out_start) * SR))
        a = int(round(src_start * SR))
        return y[:, a: a + n].copy(), int(round(out_start * SR)), n

    def put(seg, o):
        out[:, o: o + seg.shape[1]] += seg

    # ── A · 0 – 4.933: low pulse building ──
    seg, o, n = cut(0.0, 0.0, A["muteA"][0])
    _, P = hpss(seg)
    H, _ = hpss(seg, margin=4.0)
    seg = lpf(H, 1500) * db(6) + P * curve(n, [(0, db(-22)), (n / SR, db(-8))])
    seg *= curve(n, [(0, 0), (0.25, 1), (n / SR - FADE, 1), (n / SR, 0)])
    put(seg * db(-2), o)

    # ── A2 · 5.0 – 9.2: drone only until 7.4, then tension rises; small hit on 8.4 ──
    t0 = A["muteA"][1]
    seg, o, n = cut(hSm["t"] - a2_lead, t0, A["dropOut"][0])
    _, P = hpss(seg)
    H, _ = hpss(seg, margin=4.0)
    rise0 = 7.4 - t0
    openf = curve(n, [(0, 0), (rise0, 0), (n / SR, 1)])  # filter opens 7.4 → 9.2
    gP = curve(n, [(0, 0), (rise0, 0), (rise0 + 0.15, db(-18)), (A["smallHit"] - t0 - 0.05, db(-8)),
                   (n / SR, db(-5))])
    seg = lpf(H, 1500) * db(6) * (1 - openf) + H * db(6) * openf + P * gP
    seg *= curve(n, [(0, 0), (FADE, 1), (rise0, 1), (n / SR - FADE, db(3)), (n / SR, 0)])
    put(seg * db(-2), o)

    # ── B · 9.8 – 20.6: main drop, drive, thin on the servers ──
    seg, o, n = cut(hB["t"] - PRE, A["hit1"] - PRE, A["sparks"])
    H, P = hpss(seg)
    t0 = A["hit1"] - PRE
    s0, s1 = A["thin"][0] - t0, A["thin"][1] - t0
    r = 0.12
    thin = curve(n, [(0, 0), (s0 - r, 0), (s0, 1), (s1 - r, 1), (s1, 0), (n / SR, 0)])
    seg = H * (1 - thin) + lpf(H, 700) * thin + P * (1 - thin * (1 - db(-12)))
    seg *= 1 - thin * (1 - db(-3))
    seg *= curve(n, [(0, 0), (PRE, 1), (n / SR - FADE, 1), (n / SR, 0)])  # 30 ms crossfade into S
    put(seg, o)

    # ── S · 20.6 – 21.4: hit on the fire-sparks burst ──
    seg, o, n = cut(hS["t"] - PRE, A["sparks"] - PRE, A["dropOut2"][0])
    seg *= curve(n, [(0, 0), (PRE, 1), (n / SR - FADE, 1), (n / SR, 0)])
    put(seg, o)

    # ── C · 21.567 – 24.933: the bigger hit, then soft under the app ──
    seg, o, n = cut(hC["t"] - PRE, A["hit2"] - PRE, A["mute"])
    t0 = A["hit2"] - PRE
    app = A["app"][0] - t0
    soft = curve(n, [(0, 0), (app, 0), (app + 0.15, 1), (n / SR, 1)])
    seg = seg * (1 - soft) + lpf(seg, 1200) * soft
    seg *= curve(n, [(0, 0), (PRE, db(2.5)), (app, db(2.5)), (app + 0.15, db(-10)),
                     (n / SR - FADE, db(-10)), (n / SR, 0)])
    put(seg, o)

    # ── every mute window is exactly zero ──
    for a, b in ((A["muteA"][0], A["muteA"][1]), (A["dropOut"][0], A["hit1"] - PRE),
                 (A["dropOut2"][0], A["hit2"] - PRE), (A["mute"], dur)):
        out[:, int(round(a * SR)): int(round(b * SR))] = 0.0
    pk = np.abs(out).max()
    if pk > db(-1):
        out *= db(-1) / pk
    sf.write(audio / "music-edit.wav", out.T, SR, subtype="FLOAT")

    report = {"sources": {"main_drop": hB, "sparks": hS, "bigger_hit": hC, "small_hit": hSm}, "landed": {}}
    for name, anchor in (("main drop", A["hit1"]), ("sparks", A["sparks"]), ("bigger hit", A["hit2"])):
        on, pkdb = hit_onset(out, anchor)
        err = (on - anchor) * 30
        report["landed"][name] = {"anchor": anchor, "onset": round(on, 4), "frames": round(err, 2), "peak_db": round(pkdb, 1)}
        print(f"{name:10s} anchor {anchor:6.3f}s → onset {on:.4f}s ({err:+.2f} frames)  low-band peak {pkdb:.1f} dB")
    (audio / "music-edit.json").write_text(json.dumps(report, indent=1))
    print("wrote", audio / "music-edit.wav")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
