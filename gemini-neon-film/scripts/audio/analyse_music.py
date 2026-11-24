"""librosa analysis of audio/music.mp3 → audio/music-analysis.json + printed summary."""
import json, sys
from pathlib import Path
import numpy as np, librosa

audio = Path(sys.argv[1])
y, sr = librosa.load(audio / "music.mp3", sr=22050, mono=True)
dur = len(y) / sr
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
tempo = float(np.atleast_1d(tempo)[0])
hop = 256
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
low = S[freqs < 120].sum(0)
low_db = librosa.amplitude_to_db(low, ref=np.max)
onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=hop, units="time")
low_flux = np.maximum(0, np.diff(low, prepend=low[0]))
low_flux /= low_flux.max()
t = librosa.frames_to_time(np.arange(len(low)), sr=sr, hop_length=hop)
# strongest low-end hits (peaks in low-band flux, ≥0.25 s apart)
pk = librosa.util.peak_pick(low_flux, pre_max=40, post_max=40, pre_avg=40, post_avg=40, delta=0.05, wait=20)
hits = sorted([(float(t[i]), float(low_flux[i])) for i in pk], key=lambda x: -x[1])[:30]
# percussive energy profile
yh, yp = librosa.effects.hpss(y)
rms = librosa.feature.rms(y=y, hop_length=hop)[0]
prms = librosa.feature.rms(y=yp, hop_length=hop)[0]
print(f"duration {dur:.2f}s tempo {tempo:.1f} BPM, {len(beats)} beats, {len(onsets)} onsets")
print("sec   rms_db  perc_db  low_db")
for s0 in np.arange(0, dur, 2.0):
    m = (t >= s0) & (t < s0 + 2)
    print(f"{s0:5.1f} {20*np.log10(rms[m].mean()+1e-9):7.1f} {20*np.log10(prms[m].mean()+1e-9):7.1f} {low_db[m].mean():7.1f}")
print("strongest low hits:", ", ".join(f"{a:.2f}({b:.2f})" for a, b in sorted(hits)))
json.dump({"tempo": tempo, "beats": [float(b) for b in beats], "onsets": [float(o) for o in onsets],
           "low_hits": hits, "duration": dur}, open(audio / "music-analysis.json", "w"), indent=1)
