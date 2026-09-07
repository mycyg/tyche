"""Offline CUDA Qwen3-TTS renderer; produces the game's existing MP3 manifest.

Run in the isolated Linux workspace or E:-scoped Windows environment.
No server, listener, or player data is needed.
Resume validates text, actor direction, model revision and the output file hash.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

CAST = {
    "narrator": ("serena", "自然清楚的普通话旁白，像在讲亲历的事，不要播音腔，不要添加词语。"),
    "hero": ("vivian", "年轻女医生，普通话，日常交谈，话说得直接，吐槽不夸张，不要添加词语。"),
    "chief": ("uncle_fu", "中年男主任，普通话，低声交代工作，语气有分量，不要训话腔，不要添加词语。"),
    "nurse": ("serena", "护士长，普通话，语气干练，像在护士站交代眼前的事情，不要添加词语。"),
    "peer": ("dylan", "年轻男住院医，普通话，值班间隙和同事闲聊，有些疲惫，吐槽自然，不要添加词语。"),
    "research": ("vivian", "女医生，普通话，和同事商量工作，话说得快一些，但不要像读通知，不要添加词语。"),
    "rep": ("serena", "年轻女医药代表，普通话，熟人间聊天的口吻，客气但不过分热情，不要添加词语。"),
    "father": ("uncle_fu", "年长父亲，普通话，给女儿打电话，语气家常，心里有担心，不要添加词语。"),
    "mother": ("serena", "母亲，普通话，给女儿打电话，语气家常，担心她又不好一直催，不要添加词语。"),
    "patient-male": ("dylan", "男性患者，普通话，说自己的病情和眼前的难处，日常说话，不要添加词语。"),
    "patient-female": ("vivian", "女性患者，普通话，说自己的病情和眼前的难处，日常说话，不要添加词语。"),
    "family": ("serena", "患者家属，普通话，担心亲人，问具体问题，语气自然，不要添加词语。"),
}
GENERATION = {"temperature": 0.65, "top_k": 30, "repetition_penalty": 1.08}
ENCODING = {"sampleRate": 24000, "channels": 1, "bitrate": "56k", "loudness": -19}


def sha_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def replace_ready(source: Path, target: Path) -> None:
    # Windows SCP/antivirus readers can briefly deny replacement of an open file.
    # Wait for that reader, without discarding the already generated batch.
    for attempt in range(50):
        try:
            source.replace(target)
            return
        except PermissionError:
            if attempt == 49:
                raise
            time.sleep(0.1)


def row_profile(row: dict, revision: str, max_new_tokens: int = 2000, batch_size: int = 4) -> dict:
    speaker = row.get("speaker", "narrator")
    if speaker not in CAST:
        raise ValueError(f"Unknown game actor: {speaker}")
    voice, instruction = CAST[speaker]
    return {"backend": "qwen-tts-cuda-bf16", "rendererSchema": 1, "modelRevision": revision,
            "speaker": speaker, "voice": row.get("voice", voice).lower(),
            "instruction": row.get("instruction", instruction),
            "generation": {**GENERATION, "maxNewTokens": max_new_tokens, "batchSize": batch_size,
                           "seedPolicy": "first-cue-sha256-v1"}, "encoding": ENCODING}


def profile_hash(profile: dict) -> str:
    return sha_text(json.dumps(profile, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def validate_rows(rows: object) -> list[dict]:
    if not isinstance(rows, list):
        raise ValueError("Cue input must be an array")
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9-]{1,96}", row["id"]):
            raise ValueError("Invalid voice asset id")
        if row["id"] in seen:
            raise ValueError(f"Duplicate cue: {row['id']}")
        seen.add(row["id"])
        if not isinstance(row.get("text"), str) or not row["text"].strip():
            raise ValueError(f"Empty spoken text: {row['id']}")
        for field in ("speaker", "voice", "instruction", "displayText"):
            if field in row and (not isinstance(row[field], str) or not row[field].strip()):
                raise ValueError(f"Invalid {field}: {row['id']}")
        row_profile(row, "validation")
    return rows


def reusable(row: dict, record: dict | None, output: Path, revision: str, max_new_tokens: int = 2000, batch_size: int = 4) -> bool:
    if not isinstance(record, dict):
        return False
    target = output / f"{row['id']}.mp3"
    if record.get("file") != target.name or not target.is_file() or target.is_symlink() or target.stat().st_size == 0:
        return False
    return (record.get("textSha256") == sha_text(row["text"])
            and record.get("speaker") == row.get("speaker", "narrator")
            and record.get("profileSha256") == profile_hash(row_profile(row, revision, max_new_tokens, batch_size))
            and record.get("sha256") == sha_file(target))


def validate_copy_review(review: object, cue_bytes: bytes) -> None:
    if not isinstance(review, dict) or review.get("status") != "ready-for-voice":
        raise ValueError("Copy revision has not been completed; voice generation is locked")
    if review.get("cuesSha256") != hashlib.sha256(cue_bytes).hexdigest():
        raise ValueError("Cue text changed after copy review; revise and review before generating")


def verify_model(root: Path, checksums: bool = True) -> dict:
    root = root.resolve()
    manifest = json.loads((root / "tyche-model-manifest.json").read_text(encoding="utf-8"))
    if manifest.get("model") != "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice" or manifest.get("revision") != "0c0e3051f131929182e2c023b9537f8b1c68adfe":
        raise ValueError("Unexpected model or revision")
    files = manifest.get("files")
    if not isinstance(files, dict) or not all(name in files for name in ("config.json", "model.safetensors", "speech_tokenizer/model.safetensors")):
        raise ValueError("Incomplete checkpoint manifest")
    for name, record in files.items():
        target = (root / name).resolve()
        if not target.is_relative_to(root) or not target.is_file() or target.stat().st_size != record.get("bytes") or (checksums and sha_file(target) != record.get("sha256")):
            raise ValueError(f"Model transfer checksum mismatch: {name}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--max-new-tokens", type=int, default=2000)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verify-model", action="store_true", help="Optional full checkpoint hash check for transfer troubleshooting")
    parser.add_argument("--copy-review", type=Path, help="Completed copy review for these exact cue bytes")
    args = parser.parse_args()
    if args.limit < 0 or not 1 <= args.batch_size <= 8 or args.max_new_tokens < 100:
        parser.error("Invalid render limits")
    if os.name == "nt":
        for path in [Path(sys.executable), args.model.resolve(), args.input.resolve(), args.output.resolve(), Path(tempfile.gettempdir())]:
            if path.drive.upper() != "E:":
                parser.error(f"Audio production path must be on E: {path}")
        for key in ["HF_HOME", "HF_HUB_CACHE", "HF_XET_CACHE", "TORCH_HOME", "CUDA_CACHE_PATH", "NUMBA_CACHE_DIR", "GRADIO_TEMP_DIR"]:
            if not os.environ.get(key) or Path(os.environ[key]).drive.upper() != "E:":
                parser.error(f"E: cache environment missing: {key}")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    cue_bytes = args.input.read_bytes()
    rows = validate_rows(json.loads(cue_bytes.decode("utf-8-sig")))
    if not args.dry_run:
        if not args.copy_review:
            parser.error("Finish the copy revision first, then supply --copy-review")
        if os.name == "nt" and args.copy_review.resolve().drive.upper() != "E:":
            parser.error("Copy review must be on E:")
        validate_copy_review(json.loads(args.copy_review.read_text(encoding="utf-8-sig")), cue_bytes)
    model_manifest = verify_model(args.model, checksums=args.verify_model)
    revision = model_manifest["revision"]
    args.output.mkdir(parents=True, exist_ok=True)
    manifest_file = args.output / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8")) if manifest_file.exists() else {}
    pending = [row for row in rows if not reusable(row, manifest.get(row["id"]), args.output, revision, args.max_new_tokens, args.batch_size)]
    if args.limit:
        pending = pending[:args.limit]
    print(json.dumps({"cues": len(rows), "pending": len(pending), "dryRun": args.dry_run}), flush=True)
    if not pending or args.dry_run:
        return
    import imageio_ffmpeg
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable; refusing silent CPU fallback")
    torch.set_num_threads(8)
    model = Qwen3TTSModel.from_pretrained(str(args.model), device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
    supported = {voice.lower() for voice in model.get_supported_speakers()}
    if any(row_profile(row, revision, args.max_new_tokens, args.batch_size)["voice"] not in supported for row in pending):
        raise ValueError(f"Unsupported actor voice; available: {sorted(supported)}")
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    print(json.dumps({"loaded": True, "gpu": torch.cuda.get_device_name(0), "speakers": sorted(supported)}), flush=True)
    for offset in range(0, len(pending), args.batch_size):
        batch = pending[offset:offset + args.batch_size]
        profiles = [row_profile(row, revision, args.max_new_tokens, args.batch_size) for row in batch]
        started = time.monotonic()
        torch.manual_seed(int(sha_text(batch[0]["id"])[:8], 16))
        with torch.inference_mode():
            waves, sample_rate = model.generate_custom_voice(
                text=[row["text"] for row in batch], language=["Chinese"] * len(batch),
                speaker=[profile["voice"] for profile in profiles],
                instruct=[profile["instruction"] for profile in profiles],
                max_new_tokens=min(args.max_new_tokens, max(200, max(len(row["text"]) for row in batch) * 14)),
                **GENERATION,
            )
        torch.cuda.synchronize()
        if len(waves) != len(batch) or sample_rate <= 0:
            raise RuntimeError("Incomplete voice batch")
        generation_seconds = time.monotonic() - started
        for slot, (row, profile, wave) in enumerate(zip(batch, profiles, waves, strict=True)):
            audio = np.asarray(wave, dtype=np.float32).reshape(-1)
            if not len(audio) or not np.isfinite(audio).all():
                raise ValueError(f"Invalid audio: {row['id']}")
            duration = len(audio) / sample_rate
            peak = float(np.max(np.abs(audio)))
            if duration < 0.15 or peak < 0.0005:
                raise ValueError(f"Silent or truncated audio: {row['id']}")
            clipping = float(np.mean(np.abs(audio) >= 0.999))
            target = args.output / f"{row['id']}.mp3"
            partial = args.output / f"{row['id']}.{os.getpid()}.partial.mp3"
            with tempfile.TemporaryDirectory(prefix="tyche-voice-") as temporary:
                source = Path(temporary) / "voice.wav"
                sf.write(source, audio, sample_rate, subtype="PCM_24")
                subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(source),
                    "-af", "loudnorm=I=-19:TP=-2:LRA=7,afade=t=in:d=0.015", "-ar", "24000", "-ac", "1",
                    "-c:a", "libmp3lame", "-b:a", "56k", str(partial)], check=True)
            if not partial.is_file() or partial.stat().st_size == 0:
                raise RuntimeError(f"Empty MP3: {row['id']}")
            replace_ready(partial, target)
            manifest[row["id"]] = {
                "text": row.get("displayText", row["text"]), "spokenText": row["text"],
                "speaker": profile["speaker"], "voice": profile["voice"], "file": target.name,
                "seconds": round(duration, 3), "textSha256": sha_text(row["text"]),
                "sha256": sha_file(target), "sourcePeak": round(peak, 5), "sourceClipping": round(clipping, 6),
                "model": model_manifest["model"], "modelRevision": revision,
                "profile": profile, "profileSha256": profile_hash(profile), "qa": "signal-checked",
                "renderer": "qwen-tts-cuda", "torch": torch.__version__,
            }
            temporary_manifest = manifest_file.with_suffix(".partial.json")
            temporary_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            replace_ready(temporary_manifest, manifest_file)
            print(json.dumps({"done": offset + slot + 1, "total": len(pending), "id": row["id"],
                "seconds": round(duration, 2), "batchGenerationSeconds": round(generation_seconds, 2),
                "peakGpuGiB": round(torch.cuda.max_memory_allocated() / 1024 ** 3, 2)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
