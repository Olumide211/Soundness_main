"""Transcribe audio/ref-clean.wav with faster-whisper → audio/ref-text.txt"""
import sys
from pathlib import Path
from faster_whisper import WhisperModel

audio = Path(sys.argv[1])
m = WhisperModel("medium.en", device="cpu", compute_type="int8")
segs, _ = m.transcribe(str(audio / "ref-clean.wav"), beam_size=5, language="en", word_timestamps=True)
segs = list(segs)
text = " ".join(s.text.strip() for s in segs).strip()
for s in segs:
    print(f"{s.start:6.2f}-{s.end:6.2f} {s.text}")
(audio / "ref-text.txt").write_text(text + "\n", encoding="utf-8")
print("TEXT:", text)
