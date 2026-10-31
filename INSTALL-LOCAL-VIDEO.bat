@echo off
setlocal EnableExtensions
title Theux AI - Install Local Video
cd /d "%~dp0"
echo Wan2.1 1.3B local text-to-video; no MiniMax API or ComfyUI.
echo Requires an AMD-compatible Python PyTorch ROCm environment.
where python >nul 2>&1 || (echo Python missing. & pause & exit /b 1)
where git >nul 2>&1 || (echo Git missing. & pause & exit /b 1)
set "WD=%CD%\data\wan-video"
if not exist "%WD%" mkdir "%WD%"
if not exist "%WD%\Wan2.1\generate.py" (
 git clone --depth 1 https://github.com/Wan-Video/Wan2.1.git "%WD%\Wan2.1"
 if errorlevel 1 goto fail
)
python -c "import torch; print('PyTorch:',torch.__version__); print('GPU:',torch.cuda.is_available())"
if errorlevel 1 (
 echo Install AMD-compatible ROCm PyTorch first. Do NOT install default NVIDIA CUDA packages.
 goto fail
)
echo Installing Wan2.1 dependencies (ensure existing AMD PyTorch is preserved)...
python -m pip install -r "%WD%\Wan2.1\requirements.txt"
if errorlevel 1 goto fail
python -m pip install huggingface_hub
if errorlevel 1 goto fail
echo Downloading free video model weights...
hf download Wan-AI/Wan2.1-T2V-1.3B --local-dir "%WD%\Wan2.1-T2V-1.3B"
if errorlevel 1 goto fail
echo Model files installed. Restart Theux backend and try Local AI Video.
pause
exit /b 0
:fail
echo Installation incomplete. GPU compatibility is not guaranteed on Windows AMD.
pause
exit /b 1
