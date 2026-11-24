"""
Check step for the final films.

  tools/tts/bin/python scripts/audio/check.py public/gemini-neon-pack/audio [out/a.mp4 out/b.mp4 ...]

1. loudness (ebur128): ≈ −14 LUFS integrated (±0.5), true peak ≤ −1.0 dBTP
2. true silence (< −60 dBFS) at 8.75–9.05, 20.35–20.85 and 25.05–end
3. faster-whisper on the mix: every line present, words correct, each starts
   within 3 frames of its subtitle in-time
4. bass hits on 9.1 s and 20.9 s within 1 frame
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
    for a, b in ((8.75, 9.05), (20.35, 20.85), (25.05, edl["DURATION"] - 0.005)):
        seg = y[:, int(a * sr): int(b * sr)]
        pk = 20 * np.log10(np.abs(seg).max() + 1e-12)
        ok(f"silence {a:.2f}–{b:.2f}s < −60 dBFS", pk < -60, f"(peak {pk:.1f} dBFS)")
    for anchor in (A["hit1"], A["hit2"]):
        on, _ = hit_onset(y, anchor, sr)
        err = (on - anchor) / FRAME
        ok(f"bass hit on {anchor}s within 1 frame", abs(err) <= 1.0, f"(onset {on:.4f}s, {err:+.2f} frames)")
    if not words:
        return
    from faster_whisper import WhisperModel

    model = WhisperModel("medium.en", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(str(wav), beam_size=5, language="en", word_timestamps=True,
                               condition_on_previous_text=False, vad_filter=False)
    stream = [(norm(w.word), w.start) for s in segs for w in s.words if norm(w.word)]
    flat = [(t, st) for wd, st in stream for t in wd.split()]
    print("  whisper:", " ".join(t for t, _ in flat))
    i = 0
    for c in edl["CUES"]:
        target = norm(c["text"]).split()
        found = None
        for j in range(i, len(flat) - len(target) + 1):
            if [t for t, _ in flat[j: j + len(target)]] == target:
                found = j
                break
        if found is None:
            ok(f"line '{c['text']}'", False, "(not found / words wrong)")
            continue
        st = flat[found][1]
        err = (st - c["at"]) / FRAME
        ok(f"line '{c['text']}'", abs(err) <= 3.0, f"(starts {st:.2f}s vs sub {c['at']:.2f}s, {err:+.1f} frames)")
        i = found + len(target)


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
