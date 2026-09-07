"""Original, deterministic stereo chip-score for Tyche. No sampled music."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import imageio_ffmpeg
import numpy as np
import soundfile as sf

RATE = 32000
# A shared six-note motif returns in a different harmony in each location.
THEME = [0, 7, 3, 2, -1, 2, 7, 5, 3, 2, 0, -5, -1, 2, 0, None]
SCORES = {
    'title': (68, 57, [0, -5, -1, -7], .10, .08),
    'day': (88, 57, [0, -5, 3, -7], .075, .06),
    'night': (104, 45, [0, -1, -5, -7], .055, .09),
    'pressure': (112, 45, [0, 1, -5, -1], .04, .12),
    'fracture': (72, 45, [0, 1, -1, -6], .07, .045),
    'inquiry': (60, 50, [0, -1, -5, -6], .07, .035),
    'ending-calm': (66, 57, [0, 3, -5, -7], .09, .03),
    'ending-dark': (52, 45, [0, -1, -6, 0], .06, .025),
}


def synth(midi: int, seconds: float, kind: str, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(max(1, int(seconds * RATE))) / RATE
    freq = 440 * 2 ** ((midi - 69) / 12)
    phase = freq * t
    if kind == 'bell':
        wave = np.sin(2 * np.pi * phase + .7 * np.sin(2 * np.pi * phase * 2) * np.exp(-t * 4))
        envelope = (1 - np.exp(-t * 65)) * np.exp(-t * 2.8)
    elif kind == 'bass':
        wave = np.sin(2 * np.pi * phase) + .17 * np.sin(6 * np.pi * phase)
        envelope = (1 - np.exp(-t * 70)) * np.exp(-t * 3)
    elif kind == 'pad':
        wave = np.sin(2 * np.pi * phase) + .12 * np.sin(2 * np.pi * phase * 1.003) + .08 * np.sin(6 * np.pi * phase)
        envelope = np.sin(np.pi * t / max(seconds, .1)) ** 1.3
    elif kind == 'tick':
        noise = rng.normal(0, .3, len(t))
        wave = (noise + np.sin(2 * np.pi * 900 * t)) / 2
        envelope = np.exp(-t * 80)
    else:
        # Soft triangle preserves a console timbre without full-scale square edges.
        wave = sum(((-1) ** k) * np.sin(2 * np.pi * (2 * k + 1) * phase) / (2 * k + 1) ** 2 for k in range(4))
        envelope = np.minimum(1, t / .015) * np.minimum(1, (seconds - t) / .10) * np.exp(-t * .9)
    return wave * envelope


def compose(name: str) -> np.ndarray:
    bpm, root, progression, melody_gain, pulse_gain = SCORES[name]
    beat = 60 / bpm
    bars = 16
    total = round(bars * 4 * beat * RATE)
    mix = np.zeros((total, 2), dtype=np.float64)
    rng = np.random.default_rng(int(hashlib.sha256(name.encode()).hexdigest()[:8], 16))

    def place(midi: int, start: float, length: float, kind: str, gain: float, pan: float = 0) -> None:
        wave = synth(midi, length, kind, rng) * gain
        indices = (np.arange(len(wave)) + round(start * RATE)) % total
        mix[indices, 0] += wave * np.sqrt((1 - pan) / 2)
        mix[indices, 1] += wave * np.sqrt((1 + pan) / 2)

    for bar in range(bars):
        chord = root + progression[(bar // 2) % 4]
        start = bar * 4 * beat
        for tone, pan in [(0, -.4), (7, .4), (15 if name != 'ending-calm' else 16, .15)]:
            place(chord + tone, start, 4 * beat, 'pad', .022, pan)
        for step in range(8):
            at = start + step * beat / 2
            place(chord - 12, at, beat * .43, 'bass', pulse_gain * (1 if step % 2 == 0 else .4))
            if name in ['day', 'night', 'pressure']:
                place(60, at + beat / 4, .08, 'tick', .016 if step % 2 else .010, (-1) ** step * .35)
        # Leave breathing space between phrases; no endless foreground arpeggio.
        if bar % 4 < 3:
            for step in range(4):
                note = THEME[(bar % 4) * 4 + step]
                if note is None:
                    continue
                shift = 12 if bar >= 8 else 0
                place(root + note + shift, start + step * beat, beat * .8,
                    'bell' if name in ['title', 'inquiry', 'ending-calm'] else 'lead', melody_gain, .08)
                if name in ['pressure', 'fracture'] and step == 3:
                    place(root + note + 1, start + step * beat + .05, beat * .6, 'bell', .009, -.6)
    # Tempo-synced circular echo makes the exact encoded loop boundary continuous.
    mix += np.roll(mix[:, ::-1], round(beat * .75 * RATE), axis=0) * .17
    mix -= mix.mean(axis=0)
    rms = np.sqrt(np.mean(mix ** 2))
    mix *= min(.085 / max(rms, 1e-9), .7 / max(np.max(np.abs(mix)), 1e-9))
    return mix.astype(np.float32)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path('public/audio/music'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    manifest = {}
    for name in SCORES:
        track = compose(name)
        output = args.output / f'{name}.mp3'
        with tempfile.TemporaryDirectory(prefix='tyche-score-') as temp_dir:
            wave = Path(temp_dir) / 'score.wav'
            sf.write(wave, track, RATE, subtype='PCM_24')
            subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(wave), '-c:a', 'libmp3lame', '-b:a', '96k', str(output)], check=True)
        manifest[name] = {'file': output.name, 'seconds': round(len(track) / RATE, 3),
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'bpm': SCORES[name][0],
            'peak': round(float(np.max(np.abs(track))), 5), 'rms': round(float(np.sqrt(np.mean(track ** 2))), 5),
            'composer': 'Tyche original score', 'license': 'MIT', 'instrumental': True}
        print(json.dumps({'track': name, **manifest[name]}), flush=True)
    (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
