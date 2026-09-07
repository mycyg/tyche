"""Offline Qwen3-TTS asset renderer. Model weights never enter the web build.

Input: JSON array of {id,text,speaker,voice?,instruction?}. Files are content
addressed by the supplied id. Resume only when both the file and QA row exist.
The local NovelCast Python environment supplies mlx_audio and FFmpeg.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

CAST = {
    "narrator": ("serena", "清楚、克制的普通话旁白，不要播音腔，不要添加任何词语。"),
    "hero": ("vivian", "年轻女医生，普通话，语气直接、自然，值班时说话，不要添加词语。"),
    "chief": ("aiden", "中年男医生，低沉克制，普通话，语速平稳，不要添加词语。"),
    "nurse": ("serena", "护士长，语气干练，普通话，信息说清楚，不要添加词语。"),
    "peer": ("ryan", "年轻男医生，普通话，有些疲惫的日常谈话，不要添加词语。"),
    "research": ("vivian", "女医生，普通话，平静、略显急促的日常谈话，不要添加词语。"),
    "rep": ("serena", "年轻女性，普通话，礼貌轻声的日常谈话，不要添加词语。"),
    "father": ("uncle_fu", "年长男性，普通话，给女儿打电话，温和但担忧，不要添加词语。"),
    "mother": ("serena", "年长女性，普通话，给女儿打电话，语气自然，温和但担忧，不要添加词语。"),
    "patient-male": ("ryan", "成年男性患者，普通话，日常说话，不要添加词语。"),
    "patient-female": ("vivian", "成年女性患者，普通话，日常说话，不要添加词语。"),
    "family": ("serena", "患者家属，普通话，担心病人的日常谈话，不要添加词语。"),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=4)
    args = parser.parse_args()
    import imageio_ffmpeg
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model

    rows = json.loads(args.input.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    manifest_file = args.output / "manifest.json"
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    pending = [row for row in rows if row["id"] not in manifest
               or manifest[row["id"]].get("textSha256") != hashlib.sha256(row["text"].encode()).hexdigest()
               or not (args.output / f'{row["id"]}.mp3').is_file()]
    if args.limit:
        pending = pending[:args.limit]
    if not pending:
        print(json.dumps({"pending": 0, "rendered": len(manifest)}), flush=True)
        return
    print(json.dumps({"pending": len(pending), "loading": True}), flush=True)
    model = load_model(str(args.model))
    supported = model.get_supported_speakers()
    print(json.dumps({"voices": supported}), flush=True)
    def generated_rows():
        batch_size = max(1, min(8, args.batch_size))
        for offset in range(0, len(pending), batch_size):
            batch = pending[offset:offset + batch_size]
            voices, instructions = [], []
            for row in batch:
                voice, instruction = CAST.get(row.get("speaker", "narrator"), CAST["narrator"])
                voices.append(row.get("voice", voice))
                instructions.append(row.get("instruction", instruction))
            if any(voice not in supported for voice in voices):
                raise ValueError(f"Voice not available: {voices}")
            started = time.monotonic()
            mx.random.seed(int(hashlib.sha256(batch[0]["id"].encode()).hexdigest()[:8], 16))
            results = model.batch_generate(texts=[row["text"] for row in batch],
                voices=voices, instructs=instructions, lang_code="chinese",
                temperature=0.65, top_k=30, repetition_penalty=1.08,
                max_tokens=min(2000, max(200, max(len(row["text"]) for row in batch) * 14)),
                verbose=False)
            received = set()
            for result in results:
                slot = result.sequence_idx
                if slot in received or slot not in range(len(batch)):
                    raise ValueError(f"Invalid batch result index: {slot}")
                received.add(slot)
                yield offset + slot, batch[slot], np.asarray(result.audio).reshape(-1), time.monotonic() - started
            if len(received) != len(batch):
                raise ValueError(f"Incomplete batch at {offset}: {len(received)}/{len(batch)}")

    for index, row, audio, generation_seconds in generated_rows():
        key, text = row["id"], row["text"]
        if not key.replace("-", "").isalnum() or len(key) > 96:
            raise ValueError("Invalid voice asset id")
        voice, instruction = CAST.get(row.get("speaker", "narrator"), CAST["narrator"])
        voice = row.get("voice", voice)
        instruction = row.get("instruction", instruction)
        if voice not in supported:
            raise ValueError(f"Voice not available: {voice}")
        sample_rate = model.sample_rate
        if not len(audio) or not np.isfinite(audio).all():
            raise ValueError(f"Invalid audio: {key}")
        duration = len(audio) / sample_rate
        peak = float(np.max(np.abs(audio)))
        if peak < 0.0005 or duration < 0.15:
            raise ValueError(f"Silent or truncated audio: {key}")
        clipping = float(np.mean(np.abs(audio) >= 0.999))
        with tempfile.TemporaryDirectory(prefix="tyche-voice-") as temp_dir:
            wave = Path(temp_dir) / "voice.wav"
            sf.write(wave, audio, sample_rate, subtype="PCM_24")
            target = args.output / f"{key}.mp3"
            subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(wave),
                "-af", "loudnorm=I=-19:TP=-2:LRA=7,afade=t=in:d=0.015",
                "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "56k", str(target)], check=True)
        manifest[key] = {"text": row.get("displayText", text), "spokenText": text, "speaker": row.get("speaker", "narrator"),
            "voice": voice, "file": f"{key}.mp3", "seconds": round(duration, 3),
            "textSha256": hashlib.sha256(text.encode()).hexdigest(),
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "sourcePeak": round(peak, 5), "sourceClipping": round(clipping, 6),
            "model": "Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit", "qa": "signal-checked"}
        # Atomic production output: an interrupted generation retains the prior manifest.
        temporary = manifest_file.with_suffix(".partial.json")
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(manifest_file)
        mx.clear_cache()
        print(json.dumps({"done": index + 1, "total": len(pending), "id": key,
            "seconds": round(duration, 2), "generationSeconds": round(generation_seconds, 1)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
