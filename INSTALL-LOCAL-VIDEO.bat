@echo off
setlocal EnableExtensions DisableDelayedExpansion
title THEUX - AUTOMATIC AMD ROCm VIDEO INSTALLER v3
cd /d "%~dp0"
echo ============================================================
echo THEUX AMD VIDEO AUTO INSTALLER v3 - NOT CPU PRECHECK
echo ============================================================
echo Keeps your existing Python 3.11 and Ollama unchanged.
echo Creates an isolated Python 3.12 ROCm environment.
echo Windows 11 and supported AMD Radeon driver required.
echo No NVIDIA CUDA, FlashAttention or ComfyUI.
echo.
where py >nul 2>&1
if errorlevel 1 goto getPython
py -3.12 -c "import sys; assert sys.version_info[:2]==(3,12)" >nul 2>&1
if errorlevel 1 goto getPython
goto pythonOK
:getPython
where winget >nul 2>&1
if errorlevel 1 goto wingetFail
echo [1/6] Installing Python 3.12...
winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto fail
py -3.12 --version >nul 2>&1
if errorlevel 1 (
 echo Python installed. Close and restart this BAT to refresh PATH.
 pause
 exit /b 0
)
:pythonOK
set "BASE=%CD%\data\wan-video"
set "ENV=%BASE%\venv-amd"
set "PY=%ENV%\Scripts\python.exe"
if not exist "%BASE%" mkdir "%BASE%"
if not exist "%PY%" (
 echo [1/6] Creating private AMD Python environment...
 py -3.12 -m venv "%ENV%"
 if errorlevel 1 goto fail
)
"%PY%" -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto fail
echo [2/6] Installing official AMD ROCm SDK and GPU PyTorch...
echo Using official AMD repository as find-links; not the public CPU wheel.
"%PY%" -m pip install --no-cache-dir -f https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/ "torch==2.9.1+rocm7.2.1" "torchvision==0.24.1+rocm7.2.1" "torchaudio==2.9.1+rocm7.2.1"
if errorlevel 1 goto fail
echo Checking GPU BEFORE fetching video model...
"%PY%" -c "import torch; print('Torch',torch.__version__,'ROCm',torch.version.hip,'GPU',torch.cuda.is_available()); assert torch.cuda.is_available(); print(torch.cuda.get_device_name(0))"
if errorlevel 1 goto gpuFail
echo [3/6] Checking Wan source...
where git >nul 2>&1
if errorlevel 1 goto gitFail
if not exist "%BASE%\Wan2.1\generate.py" (
 git clone --depth 1 https://github.com/Wan-Video/Wan2.1.git "%BASE%\Wan2.1"
 if errorlevel 1 goto fail
)
echo [4/6] Installing video dependencies WITHOUT flash_attn...
"%PY%" -m pip install --no-cache-dir opencv-python diffusers transformers accelerate imageio imageio-ffmpeg easydict ftfy dashscope "huggingface_hub[cli]" tqdm einops
if errorlevel 1 goto fail
"%PY%" -c "import torch; assert torch.cuda.is_available(); print('AMD GPU still available:',torch.cuda.get_device_name(0))"
if errorlevel 1 goto gpuFail
echo [5/6] Downloading Wan 1.3B model weights (multi-GB)...
"%PY%" -m huggingface_hub download Wan-AI/Wan2.1-T2V-1.3B --local-dir "%BASE%\Wan2.1-T2V-1.3B"
if errorlevel 1 goto fail
echo [6/6] Local video files ready; no API key needed.
echo Restart THEUX-AI.bat and click Generate local video.
echo Note: upstream Wan CUDA-oriented kernels may still need AMD changes.
pause
exit /b 0
:gpuFail
echo The AMD PyTorch environment installed, but cannot access GPU.
echo Confirm Windows 11, AMD driver 26.2.2 and Radeon RX 9060 XT.
goto fail
:gitFail
echo Git not found; run THEUX-AI.bat first.
goto fail
:wingetFail
echo Install Windows App Installer winget from Microsoft Store.
:fail
echo Video setup did not finish. Existing global Python was preserved.
pause
exit /b 1
