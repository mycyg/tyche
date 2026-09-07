"""Fetch the pinned public checkpoint; prefer LAN transfer when it is available."""
import argparse
import hashlib
import json
import os
import shutil
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path, PurePosixPath
from urllib.request import Request, urlopen

MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
REVISION = "0c0e3051f131929182e2c023b9537f8b1c68adfe"
OFFICIAL = "https://huggingface.co"
CHUNK_BYTES = 8 * 1024 * 1024


def safe_path(root, name):
    relative = PurePosixPath(name)
    if relative.is_absolute() or ".." in relative.parts or "\\" in name:
        raise ValueError("Unsafe model filename")
    result = root.joinpath(*relative.parts)
    if not result.resolve().is_relative_to(root.resolve()):
        raise ValueError("Model path escapes its output directory")
    return result


def checked_file(file, metadata):
    """Validate against upstream LFS SHA-256 or the upstream Git blob ID."""
    if not file.is_file() or file.is_symlink() or file.stat().st_size != metadata.size:
        return None
    sha = hashlib.sha256()
    blob = hashlib.sha1(f"blob {metadata.size}\0".encode())
    with file.open("rb") as source:
        for data in iter(lambda: source.read(4 * 1024 * 1024), b""):
            sha.update(data)
            blob.update(data)
    if metadata.lfs:
        valid = sha.hexdigest() == metadata.lfs.sha256
    else:
        valid = blob.hexdigest() == metadata.blob_id
    return {"bytes": metadata.size, "sha256": sha.hexdigest()} if valid else None


def fetch_range(url, part, start, end, size):
    length = end - start + 1
    if part.is_file() and part.stat().st_size == length:
        return
    for attempt in range(4):
        try:
            request = Request(url, headers={"Range": f"bytes={start}-{end}", "Accept-Encoding": "identity"})
            with urlopen(request, timeout=45) as response:
                partial_response = response.status == 206 and response.headers.get("Content-Range") == f"bytes {start}-{end}/{size}"
                full_response = response.status == 200 and start == 0 and end == size - 1
                if not (partial_response or full_response):
                    raise ValueError("Server did not return the requested byte range")
                temporary = part.with_suffix(".partial")
                received = 0
                with temporary.open("wb") as target:
                    while data := response.read(min(1024 * 1024, length - received + 1)):
                        received += len(data)
                        if received > length:
                            raise ValueError("Range exceeds expected length")
                        target.write(data)
                if received != length:
                    raise ValueError("Truncated byte range")
                temporary.replace(part)
                return
        except Exception as error:
            if attempt == 3:
                # Do not log signed CDN URLs from networking exceptions.
                raise RuntimeError(f"Range {start}-{end} failed ({type(error).__name__})") from None
            time.sleep(attempt + 1)


def download_http(root, metadata, endpoint, workers):
    destination = safe_path(root, metadata.rfilename)
    destination.parent.mkdir(parents=True, exist_ok=True)
    url = f"{endpoint}/{MODEL}/resolve/{REVISION}/{metadata.rfilename}"
    # Parts are separate from HF/Xet partials: neither format is assumed to
    # contain a verified contiguous prefix. Existing downloads stay untouched.
    part_root = safe_path(root / ".cache" / "tyche-http" / REVISION, metadata.rfilename)
    part_root.mkdir(parents=True, exist_ok=True)
    parts = []
    for start in range(0, metadata.size, CHUNK_BYTES):
        end = min(metadata.size - 1, start + CHUNK_BYTES - 1)
        parts.append((part_root / str(start), start, end))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        jobs = [executor.submit(fetch_range, url, part, start, end, metadata.size) for part, start, end in parts]
        for count, job in enumerate(as_completed(jobs), 1):
            job.result()
            if count % 8 == 0 or count == len(jobs):
                print(json.dumps({"file": metadata.rfilename, "parts": count, "totalParts": len(jobs)}), flush=True)
    temporary = destination.with_name(destination.name + ".tyche-partial")
    with temporary.open("wb") as target:
        for part, _, _ in parts:
            with part.open("rb") as source:
                shutil.copyfileobj(source, target, 4 * 1024 * 1024)
    if not checked_file(temporary, metadata):
        raise ValueError(f"Upstream checksum mismatch: {metadata.rfilename}; completed model not replaced")
    temporary.replace(destination)


def main():
    from huggingface_hub import HfApi, snapshot_download

    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--transport", choices=["hub", "http"], default="hub")
    parser.add_argument("--endpoint", choices=[OFFICIAL, "https://hf-mirror.com"], default=OFFICIAL)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.workers <= 8:
        parser.error("workers must be between 1 and 8")
    root = args.output.resolve()
    if os.name == "nt":
        assert root.drive.upper() == "E:"
        for key in ("HF_HOME", "HF_HUB_CACHE", "HF_XET_CACHE", "TEMP", "TMP"):
            assert Path(os.environ[key]).drive.upper() == "E:", key
    root.mkdir(parents=True, exist_ok=True)
    # Use the explicitly selected endpoint for metadata too: an inaccessible
    # official host must not block a requested mirror download. This public
    # checkpoint never receives saved credentials. Provenance stays explicit.
    metadata = HfApi(endpoint=args.endpoint, token=False).model_info(MODEL, revision=REVISION, files_metadata=True)
    selected = [m for m in metadata.siblings if m.rfilename.endswith((".json", ".safetensors", ".txt")) or m.rfilename == "README.md"]
    print(json.dumps({"download": str(root), "revision": REVISION, "transport": args.transport, "files": len(selected)}), flush=True)
    if args.transport == "hub":
        snapshot_download(MODEL, revision=REVISION, local_dir=root, endpoint=args.endpoint, token=False,
                          max_workers=args.workers, allow_patterns=[m.rfilename for m in selected])
    files = {}
    for entry in selected:
        target = safe_path(root, entry.rfilename)
        checked = checked_file(target, entry)
        if not checked and args.transport == "http":
            download_http(root, entry, args.endpoint, args.workers)
            checked = checked_file(target, entry)
        if not checked:
            raise ValueError(f"Missing or invalid upstream model file: {entry.rfilename}")
        files[entry.rfilename] = checked
    assert all(name in files for name in ("config.json", "model.safetensors", "speech_tokenizer/model.safetensors"))
    manifest = {"model": MODEL, "revision": REVISION, "metadataEndpoint": args.endpoint, "files": files}
    partial = root / "tyche-model-manifest.partial.json"
    partial.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(root / "tyche-model-manifest.json")
    print(json.dumps({"downloaded": len(files), "bytes": sum(f["bytes"] for f in files.values()), "revision": REVISION}), flush=True)


if __name__ == "__main__":
    main()
