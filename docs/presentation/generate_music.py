"""Generate Sureau's original ambient presentation score from oscillators and noise.

No samples, downloaded audio, existing melodies or third-party music are used.
Python 3 + NumPy/SciPy and the locally installed FFmpeg are sufficient.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import re
import subprocess

import numpy as np
from scipy import signal
from scipy.io import wavfile


SR = 48_000
DURATION = 120.0
TEMPO = 96
BEAT = 60.0 / TEMPO
BAR = BEAT * 4
CHORD_DURATION = BAR * 2
SAMPLES = round(DURATION * SR)
OUT_DIR = Path(__file__).resolve().parent
OUTPUT = OUT_DIR / "musique-originale.wav"
RNG = np.random.default_rng(238_103)

# Dmaj7, Bm7, Gmaj7, Asus4. The voicings leave room for the narration/UI.
CHORDS = (
    {"pad": (50, 57, 61, 66), "arp": (62, 66, 69, 73), "bass": 38},
    {"pad": (47, 54, 57, 62), "arp": (62, 66, 69, 71), "bass": 35},
    {"pad": (43, 50, 54, 59), "arp": (62, 66, 67, 71), "bass": 31},
    {"pad": (45, 52, 57, 62), "arp": (62, 64, 69, 74), "bass": 33},
)


def hz(note: float) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def add(dest: np.ndarray, mono: np.ndarray, start: float, gain: float, pan: float) -> None:
    """Equal-power stereo placement. All instrument edges have smooth envelopes."""
    begin = round(start * SR)
    source_start = max(0, -begin)
    begin = max(0, begin)
    count = min(len(mono) - source_start, SAMPLES - begin)
    if count <= 0:
        return
    angle = (pan + 1) * math.pi / 4
    part = mono[source_start : source_start + count]
    dest[begin : begin + count, 0] += part * (gain * math.cos(angle))
    dest[begin : begin + count, 1] += part * (gain * math.sin(angle))


def render_pad(note: int, duration: float, voice: int) -> np.ndarray:
    t = np.arange(round(duration * SR), dtype=np.float64) / SR
    f = hz(note)
    # Very slow detuning creates movement without the sharp edges of a saw wave.
    vibrato = 0.0007 * np.sin(2 * np.pi * (0.11 + voice * 0.013) * t + voice)
    phase = 2 * np.pi * f * t + vibrato * f
    timbre = (
        np.sin(phase)
        + 0.19 * np.sin(2 * phase + 0.35)
        + 0.045 * np.sin(3 * phase + 0.8)
        + 0.025 * np.sin(2 * np.pi * f * 1.0017 * t + 0.5)
    )
    attack = np.sin(np.clip(t / 1.8, 0, 1) * np.pi / 2) ** 2
    release = np.sin(np.clip((duration - t) / 2.0, 0, 1) * np.pi / 2) ** 2
    breathe = 0.94 + 0.06 * np.sin(2 * np.pi * 0.17 * t + voice)
    return (timbre * attack * release * breathe).astype(np.float32)


def render_pluck(note: int, velocity: float) -> np.ndarray:
    duration = 2.2
    t = np.arange(round(duration * SR), dtype=np.float64) / SR
    f = hz(note)
    envelope = (1 - np.exp(-t / 0.012)) * np.exp(-t / 0.53)
    envelope *= np.minimum(1, (duration - t) / 0.15)
    sound = (
        np.sin(2 * np.pi * f * t)
        + 0.12 * np.sin(2 * np.pi * 2.002 * f * t) * np.exp(-t / 0.24)
        + 0.035 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / 0.14)
    )
    return (sound * envelope * velocity).astype(np.float32)


def render_bass(note: int, duration: float) -> np.ndarray:
    t = np.arange(round(duration * SR), dtype=np.float64) / SR
    f = hz(note)
    envelope = (1 - np.exp(-t / 0.055)) * np.exp(-t / 2.1)
    envelope *= np.sin(np.clip((duration - t) / 0.42, 0, 1) * np.pi / 2) ** 2
    sound = np.sin(2 * np.pi * f * t) + 0.16 * np.sin(4 * np.pi * f * t)
    return (sound * envelope).astype(np.float32)


def render_tick() -> np.ndarray:
    t = np.arange(round(0.11 * SR), dtype=np.float64) / SR
    noise = RNG.normal(0, 0.4, len(t))
    noise = signal.sosfilt(signal.butter(2, (2700, 6200), "bandpass", fs=SR, output="sos"), noise)
    envelope = (1 - np.exp(-t / 0.003)) * np.exp(-t / 0.018)
    envelope *= np.minimum(1, (0.11 - t) / 0.015)
    return (noise * envelope).astype(np.float32)


def score() -> np.ndarray:
    master = np.zeros((SAMPLES, 2), dtype=np.float32)
    arps = np.zeros_like(master)
    # A restrained six-note motif is freshly specified here; it is not a melody quote.
    positions = (0.0, 1.5, 2.5, 4.0, 5.5, 7.0)
    order = (0, 2, 1, 3, 2, 1)
    pans = (-0.42, 0.32, -0.15, 0.48)
    for section in range(math.ceil(DURATION / CHORD_DURATION)):
        start = section * CHORD_DURATION
        chord = CHORDS[section % len(CHORDS)]
        # Introduce the arpeggio gently during the opening; keep the rest settled.
        section_gain = 0.82 if section < 2 else 1.0
        for voice, note in enumerate(chord["pad"]):
            add(master, render_pad(note, CHORD_DURATION + 1.8, voice), start - 0.45,
                0.026 * section_gain, pans[voice])
        for local_bar in range(2):
            add(master, render_bass(chord["bass"], BAR * 0.97), start + local_bar * BAR,
                0.070 * section_gain, 0)
        for index, beat_position in enumerate(positions):
            variation = 1 if section % 4 == 2 and index == 3 else 0
            note = chord["arp"][(order[index] + variation) % 4]
            velocity = (0.74, 0.48, 0.63, 0.49, 0.56, 0.43)[index]
            pluck = render_pluck(note, velocity)
            onset = start + beat_position * BEAT + 0.07
            pan = (-0.4, 0.4, -0.2, 0.35, -0.3, 0.25)[index]
            add(arps, pluck, onset, 0.043 * section_gain, pan)
            add(arps, pluck, onset + BEAT * 0.75, 0.009 * section_gain, -pan)
            add(arps, pluck, onset + BEAT * 1.5, 0.004 * section_gain, pan * 0.5)
        if section >= 2:
            # Airy pulses rather than a conspicuous drum groove.
            for beat_position in (1.5, 3.5, 5.5, 7.5):
                add(master, render_tick(), start + beat_position * BEAT,
                    0.007 * (0.85 + RNG.random() * 0.3), 0.18 if section % 2 else -0.18)
    master += arps
    # Small, decorrelated room reflections retain a close, warm tone.
    for delay, gain in ((0.097, 0.08), (0.163, 0.05), (0.251, 0.025)):
        offset = round(delay * SR)
        master[offset:] += arps[:-offset, ::-1] * gain
    master = signal.sosfilt(
        signal.butter(2, (31, 7800), "bandpass", fs=SR, output="sos"),
        master,
        axis=0,
    ).astype(np.float32)
    t = np.arange(SAMPLES, dtype=np.float32) / SR
    fade_in = np.sin(np.minimum(t / 3.0, 1) * np.pi / 2) ** 2
    fade_out = np.sin(np.minimum((DURATION - t) / 5.0, 1) * np.pi / 2) ** 2
    master *= (fade_in * fade_out)[:, None]
    master[0] = 0
    master[-1] = 0
    if not np.isfinite(master).all():
        raise RuntimeError("Non-finite sample in original score")
    return master


def ffmpeg_measure(path: Path) -> dict[str, str]:
    process = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path), "-af",
         "loudnorm=I=-22:TP=-2:LRA=9:print_format=json", "-f", "null", "-"],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    blocks = re.findall(r"\{[^{}]*\}", process.stderr, re.S)
    return json.loads(blocks[-1])


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source = OUT_DIR / ".musique-originale-source.wav"
    music = score()
    print(f"Rendered {DURATION:.1f}s original stereo score; raw peak {np.max(np.abs(music)):.6f}", flush=True)
    wavfile.write(source, SR, music)
    measured = ffmpeg_measure(source)
    normalization = (
        "loudnorm=I=-22:TP=-2:LRA=9:linear=true:"
        f"measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
        f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']}"
    )
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
         "-i", str(source), "-af", normalization, "-ar", str(SR),
         "-ac", "2", "-c:a", "pcm_s24le", str(OUTPUT)],
        check=True,
    )
    source.unlink()
    final = ffmpeg_measure(OUTPUT)
    report = {
        "file": str(OUTPUT), "duration_seconds": DURATION, "sample_rate": SR,
        "channels": 2, "bit_depth": 24, "tempo_bpm": TEMPO,
        "integrated_lufs": float(final["input_i"]),
        "true_peak_dbtp": float(final["input_tp"]),
        "loudness_range_lu": float(final["input_lra"]),
        "bytes": OUTPUT.stat().st_size,
        "origin": "Original oscillator/noise synthesis; no samples or downloaded audio",
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    (OUT_DIR / "musique-originale-mesures.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
