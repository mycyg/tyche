param([string]$TycheAudioRoot = 'E:\TycheAudio')
$ErrorActionPreference = 'Stop'
$TycheAudioRoot = [IO.Path]::GetFullPath($TycheAudioRoot).TrimEnd('\')
if ($TycheAudioRoot -notmatch '^E:\\[^\\]+') { throw 'Audio production must use a dedicated directory on E:.' }
$TycheAudioPaths = @{
    TEMP = "$TycheAudioRoot\tmp"
    TMP = "$TycheAudioRoot\tmp"
    TMPDIR = "$TycheAudioRoot\tmp"
    UV_CACHE_DIR = "$TycheAudioRoot\cache\uv"
    UV_PYTHON_INSTALL_DIR = "$TycheAudioRoot\runtime"
    UV_PYTHON_CACHE_DIR = "$TycheAudioRoot\cache\python"
    UV_PYTHON_BIN_DIR = "$TycheAudioRoot\tools\python"
    UV_TOOL_DIR = "$TycheAudioRoot\tools\uv-envs"
    UV_TOOL_BIN_DIR = "$TycheAudioRoot\tools\bin"
    PIP_CACHE_DIR = "$TycheAudioRoot\cache\pip"
    HF_HOME = "$TycheAudioRoot\cache\huggingface"
    HF_HUB_CACHE = "$TycheAudioRoot\cache\huggingface\hub"
    HUGGINGFACE_HUB_CACHE = "$TycheAudioRoot\cache\huggingface\hub"
    HF_XET_CACHE = "$TycheAudioRoot\cache\huggingface\xet"
    HF_ASSETS_CACHE = "$TycheAudioRoot\cache\huggingface\assets"
    HF_MODULES_CACHE = "$TycheAudioRoot\cache\huggingface\modules"
    TORCH_HOME = "$TycheAudioRoot\cache\torch"
    TORCHINDUCTOR_CACHE_DIR = "$TycheAudioRoot\cache\torchinductor"
    TRITON_CACHE_DIR = "$TycheAudioRoot\cache\triton"
    CUDA_CACHE_PATH = "$TycheAudioRoot\cache\cuda"
    NUMBA_CACHE_DIR = "$TycheAudioRoot\cache\numba"
    MPLCONFIGDIR = "$TycheAudioRoot\cache\matplotlib"
    GRADIO_TEMP_DIR = "$TycheAudioRoot\tmp\gradio"
    XDG_CACHE_HOME = "$TycheAudioRoot\cache\xdg"
    XDG_CONFIG_HOME = "$TycheAudioRoot\config"
    XDG_DATA_HOME = "$TycheAudioRoot\data"
}
foreach ($TycheAudioEntry in $TycheAudioPaths.GetEnumerator()) {
    New-Item -ItemType Directory -Path $TycheAudioEntry.Value -Force | Out-Null
    [Environment]::SetEnvironmentVariable($TycheAudioEntry.Key, $TycheAudioEntry.Value, 'Process')
}
$env:UV_NO_MODIFY_PATH = '1'
$env:UV_PYTHON_INSTALL_REGISTRY = 'false'
$env:UV_PYTHON_INSTALL_BIN = 'false'
$env:UV_NO_CONFIG = '1'
$env:UV_NO_PROGRESS = '1'
$env:UV_HTTP_TIMEOUT = '180'
$env:UV_CONCURRENT_DOWNLOADS = '4'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:TOKENIZERS_PARALLELISM = 'false'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$env:GRADIO_ANALYTICS_ENABLED = 'False'
Set-Location -LiteralPath $TycheAudioRoot
