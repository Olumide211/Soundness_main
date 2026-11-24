"""Frame-by-frame comparison of a new render against the reference render.

  python3 scripts/compare-render.py out/reference/ref-16x9.mp4 out/gemini-neon-16x9.mp4

Prints every run of frames whose PSNR vs the reference is below the threshold
(identical frames decode bit-exact → PSNR inf)."""
import re, subprocess, sys, tempfile, os

ref, new = sys.argv[1], sys.argv[2]
thr = float(sys.argv[3]) if len(sys.argv) > 3 else 60.0
with tempfile.TemporaryDirectory() as d:
    log = os.path.join(d, "psnr.log")
    subprocess.run(["ffmpeg", "-v", "error", "-i", new, "-i", ref, "-lavfi", f"[0][1]psnr=stats_file={log}", "-f", "null", "-"], check=True)
    rows = []
    for line in open(log):
        n = int(re.search(r"n:(\d+)", line).group(1)) - 1
        p = re.search(r"psnr_avg:(\S+)", line).group(1)
        rows.append((n, float("inf") if p == "inf" else float(p)))
diff = [n for n, p in rows if p < thr]
runs, s = [], None
for n in diff:
    if s is None or n != prev + 1:
        if s is not None:
            runs.append((s, prev))
        s = n
    prev = n
if s is not None:
    runs.append((s, prev))
print(f"{len(rows)} frames compared, {len(rows) - len(diff)} identical (PSNR ≥ {thr} dB), {len(diff)} differ")
for a, b in runs:
    mn = min(p for n, p in rows if a <= n <= b)
    print(f"  frames {a}–{b}  ({a/30:.3f}–{(b+1)/30:.3f} s)  min PSNR {mn:.1f} dB")
