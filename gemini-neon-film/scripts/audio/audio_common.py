"""Shared helpers for the audio pipeline (music edit, mix, checks)."""
import json
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfiltfilt

SR = 48000


def load_edl(root: Path) -> dict:
    return json.loads((root / "out" / "edl.json").read_text())


def lowband(y: np.ndarray, sr: int = SR, fc: float = 150.0) -> np.ndarray:
    """Low-passed mono signal (sub + bass)."""
    if y.ndim == 2:
        y = y.mean(0)
    sos = butter(4, fc, btype="low", fs=sr, output="sos")
    return sosfiltfilt(sos, y)


def envelope(x: np.ndarray, sr: int = SR, win: float = 0.005) -> np.ndarray:
    n = max(1, int(win * sr))
    return np.sqrt(np.convolve(x**2, np.ones(n) / n, mode="same"))


def hit_onset(y: np.ndarray, t_guess: float, sr: int = SR, search: float = 0.12) -> tuple[float, float]:
    """
    Precise time of a bass hit near `t_guess`: the moment of steepest rise of the
    low-band (<150 Hz) 20 ms RMS envelope, measured on a linear scale so quiet
    fade-ins don't register. Returns (onset_time, peak_level_db).
    """
    lb = lowband(y, sr)
    env = envelope(lb, sr, 0.02)
    lag = int(0.02 * sr)
    a = max(0, int((t_guess - search) * sr))
    b = min(len(env) - lag, int((t_guess + search) * sr))
    d = env[a + lag: b + lag] - env[a:b]
    i = int(np.argmax(d))
    on = (a + i + lag / 2) / sr
    pk = float(np.max(env[a: b + lag]))
    return on, float(20 * np.log10(pk + 1e-12))


def hit_strength(y: np.ndarray, t: float, sr: int = SR) -> float:
    """Low-band jump (dB) of a hit: 0–150 ms after vs 200–50 ms before."""
    lb = lowband(y, sr)
    after = lb[int(t * sr): int((t + 0.15) * sr)]
    before = lb[int((t - 0.2) * sr): int((t - 0.05) * sr)]
    rms = lambda v: np.sqrt(np.mean(v**2)) + 1e-12
    return float(20 * np.log10(rms(after) / rms(before)))


def ramp(n_total: int, sr: int, points: list[tuple[float, float]]) -> np.ndarray:
    """Piecewise-linear gain curve from (time_s, gain_linear) points."""
    t = np.arange(n_total) / sr
    ts, gs = zip(*points)
    return np.interp(t, ts, gs)


def db(x: float) -> float:
    return 10 ** (x / 20)
