param([string]$TycheAudioRoot = 'E:\TycheAudio')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. "$PSScriptRoot\voice-environment.ps1" -TycheAudioRoot $TycheAudioRoot
$TycheAudioPaths | ConvertTo-Json -Compress
foreach ($TycheAudioFolder in @('downloads','tools','models','jobs','output','logs')) {
    New-Item -ItemType Directory -Path "$TycheAudioRoot\$TycheAudioFolder" -Force | Out-Null
}
$TycheUvZip = "$TycheAudioRoot\downloads\uv-0.12.10-windows.zip"
$TycheUvSha = 'f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2'
if (!(Test-Path -LiteralPath $TycheUvZip)) {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Uri 'https://github.com/astral-sh/uv/releases/download/0.12.10/uv-x86_64-pc-windows-msvc.zip' -OutFile $TycheUvZip
}
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $TycheUvZip).Hash.ToLowerInvariant() -ne $TycheUvSha) { throw 'uv archive checksum mismatch.' }
$TycheUvDir = "$TycheAudioRoot\tools\uv-0.12.10"
if (!(Test-Path -LiteralPath "$TycheUvDir\uv.exe")) {
    Expand-Archive -LiteralPath $TycheUvZip -DestinationPath $TycheUvDir
}
$TycheUv = "$TycheUvDir\uv.exe"
& $TycheUv --version
if ($LASTEXITCODE -ne 0) { throw 'uv did not start.' }
& $TycheUv python install 3.12 --no-bin --no-registry
if ($LASTEXITCODE -ne 0) { throw 'Python installation failed.' }
$TychePython = "$TycheAudioRoot\venv\Scripts\python.exe"
if (!(Test-Path -LiteralPath $TychePython)) {
    & $TycheUv venv --python 3.12 --managed-python "$TycheAudioRoot\venv"
    if ($LASTEXITCODE -ne 0) { throw 'Virtual environment creation failed.' }
}
& $TycheUv pip install --python $TychePython 'torch==2.9.1+cu128' 'torchaudio==2.9.1+cu128' --index-url 'https://download.pytorch.org/whl/cu128'
if ($LASTEXITCODE -ne 0) { throw 'CUDA PyTorch installation failed.' }
& $TycheUv pip install --python $TychePython 'qwen-tts==0.1.1' 'imageio-ffmpeg==0.6.0' 'torch==2.9.1+cu128' 'torchaudio==2.9.1+cu128' --index-url 'https://pypi.tuna.tsinghua.edu.cn/simple'
if ($LASTEXITCODE -ne 0) { throw 'Qwen TTS installation failed.' }
& $TychePython "$PSScriptRoot\probe-voice.py"
if ($LASTEXITCODE -ne 0) { throw 'GPU verification failed.' }
