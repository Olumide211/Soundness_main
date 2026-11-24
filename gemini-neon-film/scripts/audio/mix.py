"""
Final mix → audio/final-mix.wav (48 kHz stereo, −14 LUFS, ≤ −1 dBTP).

  tools/tts/bin/python scripts/audio/mix.py public/gemini-neon-pack/audio

1. VO bus: each phrase (audio/vo/Pxx.wav, optional ≤5 % atempo from timeline.json)
   is placed so its first word lands on its cue (src/edl.ts CUES.at), then
   ffmpeg: highpass 80 Hz → de-esser → 3:1 compressor → +3 dB presence @ 4 kHz.
   Dry: no reverb.
2. Music (audio/music-edit.wav) is ducked 10 dB under the VO: gain curve keyed
   from the VO envelope, attack 10 ms / release 250 ms, back up in the gaps.
3. Sum → gain to −14 LUFS → 4× oversampled limiter (−1.6 dBFS) → 2-pass loudnorm
   (I −14, TP −1, linear) → 48 kHz stereo.
The silent windows (8.7–9.1, 20.3–20.9, 25.0–end) are forced to digital zero.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

sys.path.insert(0, str(Path(__file__).parent))
from audio_common import SR, db, load_edl  # noqa: E402

PAD = 0.040
DUCK_DB = -10.0
ATTACK, RELEASE = 0.010, 0.250


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def read48(path: Path, tempo: float = 1.0) -> np.ndarray:
    """Mono 48 kHz float, optional atempo (pitch-preserving)."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "x.wav"
        af = f"atempo={tempo}" if abs(tempo - 1) > 1e-6 else "anull"
        ff("-i", str(path), "-af", af, "-ac", "1", "-ar", str(SR), "-c:a", "pcm_f32le", str(out))
        y, _ = sf.read(out)
    return y


def loudnorm_2pass(src: Path, dst: Path, I=-14.0, TP=-1.0):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af",
                        f"loudnorm=I={I}:TP={TP}:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    j = json.loads(r.stderr[r.stderr.rindex("{"): r.stderr.rindex("}") + 1])
    af = (f"loudnorm=I={I}:TP={TP}:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
          f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:"
          f"linear=true:print_format=json")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(src), "-af", af,
                        "-ar", str(SR), "-ac", "2", "-c:a", "pcm_f32le", str(dst)], capture_output=True, text=True)
    j2 = json.loads(r.stderr[r.stderr.rindex("{"): r.stderr.rindex("}") + 1])
    return j, j2


def main(audio: Path):
    root = audio.parents[2]
    edl = load_edl(root)
    A = edl["ANCHORS"]
    n = int(round(edl["DURATION"] * SR))
    plan = json.loads((audio / "vo" / "timeline.json").read_text())
    tempo = plan.get("tempo", {})

    # ── 1. VO bus (raw placement) ──
    vo = np.zeros(n)
    placed = {}
    for c in edl["CUES"]:
        p = c["vo"]
        y = read48(audio / "vo" / f"{p}.wav", tempo.get(p, 1.0))
        start = c["at"] - PAD / tempo.get(p, 1.0)
        if start < 0:  # P01 at 0.0: drop the leading pad
            y = y[int(-start * SR):]
            start = 0.0
        a = int(round(start * SR))
        b = min(n, a + len(y))
        if np.any(np.abs(vo[a:b]) > 1e-6):
            raise SystemExit(f"{p} overlaps the previous phrase")
        vo[a:b] += y[: b - a]
        placed[p] = (start, b / SR)
    # level-match phrases (takes differ a little): each phrase to the same RMS
    for p, (s, e) in placed.items():
        a, b = int(s * SR), int(e * SR)
        r = np.sqrt(np.mean(vo[a:b] ** 2)) + 1e-12
        target = db(-20)
        if p == "P06":  # "Neon waits." stays the softest line
            target = db(-23)
        vo[a:b] *= target / r

    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        sf.write(d / "vo_raw.wav", vo, SR, subtype="FLOAT")
        ff("-i", str(d / "vo_raw.wav"), "-af",
           "highpass=f=80:poles=2,"
           "deesser=i=0.5:m=0.5:f=0.5:s=o,"
           "acompressor=threshold=-26dB:ratio=3:attack=5:release=90:knee=4:makeup=3dB,"
           "equalizer=f=4000:t=q:w=0.9:g=3",
           "-ar", str(SR), "-c:a", "pcm_f32le", str(d / "vo_bus.wav"))
        vo_bus, _ = sf.read(d / "vo_bus.wav")
        vo_bus = vo_bus[:n] if len(vo_bus) >= n else np.pad(vo_bus, (0, n - len(vo_bus)))
        sf.write(audio / "vo-bus.wav", vo_bus, SR, subtype="FLOAT")

        # ── 2. Music + ducking ──
        mus, msr = sf.read(audio / "music-edit.wav")
        assert msr == SR
        mus = mus[:n]
        win = int(0.010 * SR)
        env = np.sqrt(np.convolve(vo_bus**2, np.ones(win) / win, mode="same"))
        key = (20 * np.log10(env + 1e-9) > -45).astype(float)  # VO active
        target = 1 - key * (1 - db(DUCK_DB))
        g = np.empty(n)
        ca, cr = np.exp(-1 / (ATTACK * SR)), np.exp(-1 / (RELEASE * SR))
        acc = 1.0
        for i in range(n):  # one-pole attack/release smoothing
            t = target[i]
            k = ca if t < acc else cr
            acc = t + k * (acc - t)
            g[i] = acc
        mus_d = mus * g[:, None]
        np.save(d / "g.npy", g)

        # ── 3. Sum, pre-limit, loudnorm ──
        mix = mus_d + np.stack([vo_bus, vo_bus], 1)
        for a, b in (A["muteA"], A["blackB"], (A["blackC"][0], edl["DURATION"])):
            mix[int(round((a + 0.0) * SR)): int(round(b * SR)) if b < edl["DURATION"] else n] *= 0
        # restore the 30 ms pre-hit fade-ins that sit just before 9.1 / 20.9
        for hit in (A["hit1"], A["hit2"]):
            a, b = int(round((hit - 0.03) * SR)), int(round(hit * SR))
            mix[a:b] = (mus_d + np.stack([vo_bus, vo_bus], 1))[a:b]
        # gain to ≈ −14 LUFS, then a 4× oversampled limiter (true-peak control) so the
        # final 2-pass loudnorm only needs a tiny linear trim
        import pyloudnorm as pyln

        meter = pyln.Meter(SR)
        mix *= db(-14.0 - meter.integrated_loudness(mix))
        for _ in range(2):
            up = resample_poly(mix, 4, 1, axis=0)
            sf.write(d / "up.wav", up, SR * 4, subtype="FLOAT")
            ff("-i", str(d / "up.wav"), "-af", "alimiter=limit=0.83:attack=0.5:release=40:level=disabled:asc=1",
               "-c:a", "pcm_f32le", str(d / "up_lim.wav"))
            lim, _ = sf.read(d / "up_lim.wav")
            mix = resample_poly(lim, 1, 4, axis=0)[:n]
            mix *= db(-14.0 - meter.integrated_loudness(mix))
        sf.write(d / "sum_lim.wav", mix, SR, subtype="FLOAT")
        m1, m2 = loudnorm_2pass(d / "sum_lim.wav", d / "ln.wav")
        out, _ = sf.read(d / "ln.wav")
        out = out[:n] if len(out) >= n else np.pad(out, ((0, n - len(out)), (0, 0)))
        # loudnorm is a pure gain in linear mode; re-zero the silent windows exactly
        for a, b in ((8.7, 9.07), (20.3, 20.87), (25.0, edl["DURATION"])):
            out[int(round(a * SR)): int(round(b * SR))] = 0.0
        sf.write(audio / "final-mix.wav", out, SR, subtype="PCM_24")

    duck = {p: round(float(20 * np.log10(g[int((s + 0.2) * SR)])), 1) for p, (s, e) in placed.items()}
    print("loudnorm pass1:", {k: m1[k] for k in ("input_i", "input_tp")}, "→ normalization:", m2.get("normalization_type"))
    print("music gain under each line (dB):", duck)
    print("wrote", audio / "final-mix.wav")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
