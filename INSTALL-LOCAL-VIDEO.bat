@echo off
setlocal EnableExtensions
title Theux AI - AMD Local Video Setup
cd /d "%~dp0"
echo ============================================================
echo THEUX LOCAL VIDEO - AMD GPU PRECHECK
echo ============================================================
echo.
echo This installer requires an AMD ROCm-enabled PyTorch interpreter.
echo It WILL NOT overwrite your global Python or install NVIDIA CUDA.
echo It WILL NOT install flash_attn.
echo.
set "PY=python"
if defined WAN_PYTHON set "PY=%WAN_PYTHON%"
where "%PY%" >nul 2>&1
if errorlevel 1 (
 echo ERROR: Python interpreter not found: %PY%
 goto :fail
)
echo Checking %PY% ...
"%PY%" -c "import torch,sys; print('Python:',sys.executable); print('PyTorch:',torch.__version__); print('ROCm:',torch.version.hip); print('GPU:',torch.cuda.is_available()); assert torch.version.hip is not None and torch.cuda.is_available(), 'This PyTorch is not GPU-enabled ROCm.'"
if errorlevel 1 (
 echo.
 echo STOPPED: Current Python is CPU-only or AMD ROCm GPU is unavailable.
 echo Your existing PyTorch has not been modified.
 echo Follow the official AMD Windows Radeon PyTorch installation guide.
 echo On Windows, use a supported AMD ROCm Python environment.
 echo Then set WAN_PYTHON to that interpreter, and rerun this installer.
 goto :fail
)
echo AMD GPU confirmed. Installing a dedicated package environment.
set "WD=%CD%\data\wan-video"
if not exist "%WD%" mkdir "%WD%"
where git >nul 2>&1
if errorlevel 1 goto :needgit
if not exist "%WD%\Wan2.1\generate.py" (
 git clone --depth 1 https://github.com/Wan-Video/Wan2.1.git "%WD%\Wan2.1"
 if errorlevel 1 goto :fail
)
echo Installing non-Torch, non-FlashAttention packages only.
"%PY%" -m pip install --no-deps -r "%~dp0video-requirements-amd.txt"
if errorlevel 1 goto :fail
echo.
echo Validating common Wan dependencies...
"%PY%" -c "import torch,torchvision,diffusers,transformers,accelerate,imageio,easydict,ftfy; assert torch.cuda.is_available()"
if errorlevel 1 (
 echo Missing or incompatible packages. Consult AMD ROCm and Wan documentation.
 goto :fail
)
"%PY%" -m pip install huggingface_hub
if errorlevel 1 goto :fail
echo Downloading Wan 1.3B model (several GB)...
"%PY%" -m huggingface_hub download Wan-AI/Wan2.1-T2V-1.3B --local-dir "%WD%\Wan2.1-T2V-1.3B"
if errorlevel 1 goto :fail
echo.
echo Model files downloaded. Restart Theux AI to check the engine.
echo Model execution may still require AMD-specific code patches.
pause
exit /b 0
:needgit
echo Git is missing.
:fail
echo.
echo Video installation not completed. No video model was downloaded by this attempt.
pause
exit /b 1
