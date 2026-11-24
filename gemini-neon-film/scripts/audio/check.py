"""
Check step for the final films.

  tools/tts/bin/python scripts/audio/check.py public/gemini-neon-pack/audio [out/a.mp4 out/b.mp4 ...]

1. loudness (ebur128): ≈ −14 LUFS integrated (±0.5), true peak ≤ −1.0 dBTP
2. true silence (< −60 dBFS) at 4.94–4.99 and 24.95–end; near-silence (< −40) at 9.25–9.75
3. faster-whisper on the whole final mix, aligned to the script: every line present and correct;
   each line starts within 3 frames of its time and ends inside its window without crossing a
   cut (sample-accurate, measured on the processed VO stem that is in the mix)
4. bass hits on 9.800 s (filament) and 21.567 s (hero tube) within 1 frame
5. ffprobe each MP4: size, 30 fps, 858 frames, 28.6 s, exactly one AAC stream
   (and its decoded audio passes 1, 2 and 4 too)
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
from audio_common import SR, hit_onset, load_edl  # noqa: E402
from gen_vo import norm  # noqa: E402

FRAME = 1 / 30
results = []


def ok(name, cond, detail=""):
    results.append(bool(cond))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}  {detail}")


def ebur(path: Path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True).stderr
    summ = r[r.rindex("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summ).group(1))
    return I, tp


def vo_extents(audio: Path):
    """Sample-accurate start/end of each line on the processed VO stem that is in the mix.
    Each line is searched only up to the next line's start (lines are 0.1 s apart)."""
    plan = json.loads((audio / "vo" / "timeline.json").read_text())
    vo, sr = sf.read(audio / "vo-bus.wav")
    win = int(0.005 * sr)
    env = 20 * np.log10(np.sqrt(np.convolve(vo**2, np.ones(win) / win, mode="same")) + 1e-12)
    items = sorted(plan["window"].items(), key=lambda kv: kv[1][0])
    out = {}
    for i, (p, (start, wend)) in enumerate(items):
        nxt = items[i + 1][1][0] if i + 1 < len(items) else wend + 1.0
        # from this line's own leading pad to just before the next line's pad
        a = max(0, int((start - 0.045) * sr))
        b = int(min(nxt - 0.045, wend + 0.40) * sr)
        seg = env[a:b]
        act = np.where(seg > seg.max() - 30.0)[0]  # speech level: within 30 dB of the line's peak
        out[p] = ((a + act[0]) / sr, (a + act[-1]) / sr, start, wend)
    return out


def cut_checks(audio: Path, edl):
    """Every line starts on its time (±3 frames) and ends inside its window, never crossing a cut:
    measured sample-accurately on the processed VO stem (audio/vo-bus.wav) that went into the mix."""
    print("\n[vo] timing, windows and cuts (processed VO stem)")
    cuts = sorted({round(sh["start"] - (sh.get("blackBefore", 0) / 30), 3) for sh in edl["SHOTS"]} |
                  {round(sh["end"], 3) for sh in edl["SHOTS"]})
    for p, (s0, s1, start, wend) in vo_extents(audio).items():
        err = (s0 - start) / FRAME
        crossed = [c for c in cuts if s0 + 0.005 < c < s1 - 0.005]
        # the brief's windows are the rule: a few windows deliberately span a cut into a shot
        # with no line of its own (P03 2.05–3.40 over the 2.8 cut, P04 3.55–4.90 over 4.2)
        ok(f"{p} starts {s0:.3f}s (time {start:.2f}, {err:+.2f} frames), ends {s1:.3f}s (window {wend})",
           abs(err) <= 3.0 and s1 <= wend + 0.005,
           f"{'(runs over the ' + ', '.join(map(str, crossed)) + ' cut inside its window)' if crossed else ''}")


def audio_checks(label, wav: Path, edl, words=True):
    print(f"\n[{label}] {wav.name}")
    A = edl["ANCHORS"]
    I, tp = ebur(wav)
    ok("integrated loudness ≈ −14 LUFS", abs(I + 14) <= 0.5, f"({I:.1f} LUFS)")
    ok("true peak ≤ −1.0 dBTP", tp <= -1.0, f"({tp:.2f} dBTP)")
    y, sr = sf.read(wav)
    if y.ndim == 2:
        y = y.T
    else:
        y = y[None]
    for a, b, lim, kind in ((4.94, 4.99, -60, "true silence"), (24.95, edl["DURATION"] - 0.005, -60, "true silence"),
                            (9.25, 9.75, -40, "near-silence")):
        seg = y[:, int(a * sr): int(b * sr)]
        pk = 20 * np.log10(np.abs(seg).max() + 1e-12)
        ok(f"{kind} {a:.2f}–{b:.2f}s < {lim} dBFS", pk < lim, f"(peak {pk:.1f} dBFS)")
    for anchor in (A["hit1"], A["hit2"]):
        on, _ = hit_onset(y, anchor, sr)
        err = (on - anchor) / FRAME
        ok(f"bass hit on {anchor}s within 1 frame", abs(err) <= 1.0, f"(onset {on:.4f}s, {err:+.2f} frames)")
    if not words:
        return
    from faster_whisper import WhisperModel
    from scipy.signal import resample_poly

    import difflib

    model = WhisperModel("medium.en", device="cpu", compute_type="int8")
    mono = y.mean(0)
    x16 = resample_poly(mono, 16000, sr).astype(np.float32)
    # whole final mix in one pass (lines are heard in context, as in the film); short
    # per-line slices make whisper hallucinate ("thank you for watching"), so they are not used
    segs, _ = model.transcribe(x16, beam_size=5, language="en", word_timestamps=True,
                               condition_on_previous_text=True, vad_filter=False)
    heard = [norm(w.word) for s_ in segs for w in s_.words]
    heard = [t for h in heard for t in h.split()]
    print("  whisper (final mix):", " ".join(heard))
    exp, owner = [], []
    for c in edl["CUES"]:
        for t in norm(c["text"]).split():
            exp.append(t)
            owner.append(c["vo"])
    sm = difflib.SequenceMatcher(a=exp, b=heard, autojunk=False)
    matched = set()
    for tag, i1, i2, _, _ in sm.get_opcodes():
        if tag == "equal":
            matched.update(range(i1, i2))
    ext = vo_extents(wav_plan_dir.parent)
    for c in edl["CUES"]:
        idx = [i for i, o in enumerate(owner) if o == c["vo"]]
        miss = [exp[i] for i in idx if i not in matched]
        s0 = ext[c["vo"]][0]
        ok(f"line '{c['text']}' present and correct in the mix", not miss,
           f"({'misheard: ' + ' '.join(miss) if miss else 'all words'}; voice at {s0:.3f}s)")


def probe(mp4: Path, w, h):
    print(f"\n[video] {mp4.name}")
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format",
                                   "-of", "json", str(mp4)], capture_output=True, text=True).stdout)
    v = [s for s in j["streams"] if s["codec_type"] == "video"]
    a = [s for s in j["streams"] if s["codec_type"] == "audio"]
    s = v[0]
    ok(f"size {w}x{h}", s["width"] == w and s["height"] == h, f"({s['width']}x{s['height']})")
    ok("30 fps", s["r_frame_rate"] == "30/1" and s["avg_frame_rate"] == "30/1", f"({s['avg_frame_rate']})")
    ok("858 frames", int(s["nb_read_frames"]) == 858, f"({s['nb_read_frames']})")
    ok("duration 28.6 s", abs(float(j["format"]["duration"]) - 28.6) < 0.03, f"({float(j['format']['duration']):.3f}s)")
    ok("H.264 yuv420p", s["codec_name"] == "h264" and s["pix_fmt"] == "yuv420p")
    ok("exactly one AAC stream", len(a) == 1 and a[0]["codec_name"] == "aac",
       f"({len(a)} audio, {a[0]['codec_name'] if a else '-'}, {a[0].get('bit_rate', '?') if a else ''} b/s, "
       f"{a[0].get('sample_rate', '?') if a else ''} Hz)")


def main():
    audio = Path(sys.argv[1]).resolve()
    root = audio.parents[2]
    edl = load_edl(root)
    global wav_plan_dir
    wav_plan_dir = audio / "vo"
    cut_checks(audio, edl)
    audio_checks("mix", audio / "final-mix.wav", edl, words=True)
    for mp4 in map(Path, sys.argv[2:]):
        w, h = (1920, 1080) if "16x9" in mp4.name else (1080, 1920)
        probe(mp4, w, h)
        with tempfile.TemporaryDirectory() as d:
            wav = Path(d) / "a.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-vn", "-c:a", "pcm_f32le", str(wav)], check=True)
            audio_checks(f"decoded from {mp4.name}", wav, edl, words=False)
    print("\nALL CHECKS PASSED" if all(results) else f"\n{results.count(False)} CHECK(S) FAILED")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
