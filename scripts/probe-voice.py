"""Environment/CUDA check and optional local model load; never synthesizes audio."""
import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument("--model", type=Path, help="Load a local checkpoint without generating speech")
args = parser.parse_args()

# Loading must use the copied files, not silently fetch a missing tokenizer.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import torch
from qwen_tts import Qwen3TTSModel
import imageio_ffmpeg

if os.name == "nt":
    assert Path(sys.executable).drive.upper() == "E:", sys.executable
    assert Path(tempfile.gettempdir()).drive.upper() == "E:", tempfile.gettempdir()
assert torch.cuda.is_available(), "CUDA unavailable"
matrix = torch.randn(512, 512, device="cuda", dtype=torch.bfloat16)
product = matrix @ matrix
torch.cuda.synchronize()
assert torch.isfinite(product).all().item(), "CUDA computation failed"
print(json.dumps({
    "python": sys.executable,
    "pythonVersion": sys.version.split()[0],
    "torch": torch.__version__,
    "cuda": torch.version.cuda,
    "gpu": torch.cuda.get_device_name(0),
    "capability": torch.cuda.get_device_capability(0),
    "architectures": torch.cuda.get_arch_list(),
    "qwenTts": importlib.metadata.version("qwen-tts"),
    "ffmpeg": imageio_ffmpeg.get_ffmpeg_exe(),
    "temp": tempfile.gettempdir(),
    "cwd": os.getcwd(),
    "gpuBfloat16Matmul": True,
}, ensure_ascii=False), flush=True)

if args.model:
    model_root = args.model.resolve()
    if os.name == "nt":
        assert model_root.drive.upper() == "E:", model_root
    renderer = runpy.run_path(str(Path(__file__).with_name("render-voice-cuda.py")))
    started = time.monotonic()
    model = Qwen3TTSModel.from_pretrained(str(model_root), device_map="cuda:0",
                                        dtype=torch.bfloat16, attn_implementation="sdpa")
    torch.cuda.synchronize()
    speakers = sorted(speaker.lower() for speaker in model.get_supported_speakers())
    required = {voice for voice, _ in renderer["CAST"].values()}
    assert required.issubset(speakers), (required, speakers)
    print(json.dumps({"modelLoadedWithoutSynthesis": True, "generatedClips": 0,
                      "speakers": speakers, "loadSeconds": round(time.monotonic() - started, 2),
                      "gpuAllocatedGiB": round(torch.cuda.memory_allocated() / 1024 ** 3, 2)},
                     ensure_ascii=False), flush=True)
