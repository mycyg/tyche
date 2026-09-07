"""Original instrumental chip-score additions. No samples or copied melodies."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

import imageio_ffmpeg
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("tyche_score", ROOT / "scripts/compose-score.py")
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)
RATE = score.RATE
TRACKS = {
    "ward-rounds": {"title": "查房的人流", "bpm": 96, "root": 50, "chords": [0, -2, -5, -1],
                    "motif": [0, 7, 10, 7, 3, None, 2, -1], "scene": "病区忙碌、巡床与白天探索"},
    "family-call": {"title": "家里还在等", "bpm": 66, "root": 57, "chords": [0, -5, -4, -7],
                    "motif": [7, 3, 2, None, 0, -1, 2, None], "scene": "家庭来电、筹款与探视"},
    "research-afterhours": {"title": "没有下班的灯", "bpm": 90, "root": 45, "chords": [0, -1, 3, -5],
                           "motif": [0, 12, 7, 10, 3, 7, -1, None], "scene": "科研、办公室与夜间查资料"},
    "complaint-pressure": {"title": "门外有人", "bpm": 116, "root": 38, "chords": [0, 1, -1, -6],
                           "motif": [0, None, 1, 7, 0, None, -1, 6], "scene": "录音、投诉与多人争执"},
}


def compose(name, config):
    beat = 60 / config["bpm"]
    total = round(64 * beat * RATE)
    mix = np.zeros((total, 2), dtype=np.float64)
    rng = np.random.default_rng(sum(map(ord, name)))

    def place(note, at, duration, instrument, gain, pan=0):
        wave = score.synth(note, duration, instrument, rng) * gain
        positions = (np.arange(len(wave)) + round(at * RATE)) % total
        mix[positions, 0] += wave * np.sqrt((1 - pan) / 2)
        mix[positions, 1] += wave * np.sqrt((1 + pan) / 2)

    for bar in range(16):
        root = config["root"] + config["chords"][(bar // 2) % 4]
        start = bar * 4 * beat
        for interval, pan in [(0, -.45), (7, .45), (14, .1)]:
            place(root + interval, start, beat * 5, "pad", .029, pan)
        for step in range(8):
            at = start + step * beat / 2
            if name == "family-call":
                if step in [0, 4]:
                    place(root - 12, at, beat * 1.5, "bass", .05)
            else:
                place(root - 12, at, beat * .35, "bass", .07 if step % 2 == 0 else .026)
                if step % 2 == 1:
                    place(60, at, .09, "tick", .012, -.3 if step % 4 == 1 else .3)
            if name == "research-afterhours" and bar % 4 != 3:
                place(root + [12, 19, 22, 26][step % 4], at, beat * .4, "bell", .024, (-1) ** step * .5)
        if bar % 4 != 3:
            for step in range(4):
                note = config["motif"][(bar % 2) * 4 + step]
                if note is None:
                    continue
                place(config["root"] + note + (12 if bar >= 8 else 0), start + step * beat,
                      beat * (1.4 if name == "family-call" else .7),
                      "bell" if name in ["family-call", "research-afterhours"] else "lead",
                      .06 if name != "complaint-pressure" else .042, .1)
        if name == "complaint-pressure" and bar % 2 == 1:
            place(root + 25, start + beat * 3.5, beat * .55, "bell", .022, -.55)

    mix += np.roll(mix[:, ::-1], round(.75 * beat * RATE), axis=0) * .21
    # Remove the boundary jump without fading each loop to silence.
    mix -= np.linspace(0, 1, total)[:, None] * (mix[-1] - mix[0])
    mix -= mix.mean(axis=0)
    mix *= min(.075 / max(np.sqrt(np.mean(mix ** 2)), 1e-9), .75 / max(np.abs(mix).max(), 1e-9))
    return mix.astype(np.float32)


def main():
    output = ROOT / "handoff-assets/music"
    output.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    manifest = []
    for name, config in TRACKS.items():
        samples = compose(name, config)
        wave = output / f"{name}.wav"
        sf.write(wave, samples, RATE, subtype="PCM_24")
        for extension, encoding in [("ogg", ["-c:a", "libvorbis", "-q:a", "5"]),
                                    ("mp3", ["-c:a", "libmp3lame", "-b:a", "128k"])]:
            subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(wave), *encoding,
                            str(output / f"{name}.{extension}")], check=True)
        manifest.append({**config, "id": name, "seconds": round(len(samples) / RATE, 3),
                         "loopStart": 0, "loopEndSamples": len(samples), "sampleRate": RATE,
                         "channels": 2, "license": "MIT", "composer": "Tyche original chip-score",
                         "files": [f"{name}.wav", f"{name}.ogg", f"{name}.mp3"]})
        print(name, manifest[-1]["seconds"], "seconds", flush=True)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
