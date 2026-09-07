#!/usr/bin/env bash
# Isolated Linux CUDA environment; no sudo or changes to the system Python.
set -euo pipefail
TycheAudioRoot="${1:?Pass an absolute audio workspace directory}"
TycheUv="${TYCHE_UV:-uv}"
TychePythonBase="${TYCHE_PYTHON:-python3.12}"
case "$TycheAudioRoot" in /*) ;; *) echo 'An absolute workspace path is required.' >&2; exit 1 ;; esac
mkdir -p "$TycheAudioRoot"/{models,jobs,output,logs,tmp,cache}
export TMPDIR="$TycheAudioRoot/tmp"
export HF_HOME="$TycheAudioRoot/cache/huggingface"
export TORCH_HOME="$TycheAudioRoot/cache/torch"
export CUDA_CACHE_PATH="$TycheAudioRoot/cache/cuda"
if [[ ! -x "$TycheAudioRoot/venv/bin/python" ]]; then
    "$TycheUv" venv --python "$TychePythonBase" "$TycheAudioRoot/venv"
fi
"$TycheUv" pip install --python "$TycheAudioRoot/venv/bin/python" \
    'torch==2.9.1+cu128' 'torchaudio==2.9.1+cu128' \
    --index-url https://download.pytorch.org/whl/cu128
"$TycheUv" pip install --python "$TycheAudioRoot/venv/bin/python" \
    'qwen-tts==0.1.1' 'imageio-ffmpeg==0.6.0' \
    'torch==2.9.1+cu128' 'torchaudio==2.9.1+cu128' \
    --index-url https://pypi.tuna.tsinghua.edu.cn/simple
"$TycheAudioRoot/venv/bin/python" "$(dirname "$0")/probe-voice.py"
