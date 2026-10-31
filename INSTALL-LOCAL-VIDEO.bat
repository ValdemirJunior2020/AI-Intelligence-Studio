@echo off
setlocal EnableExtensions
title THEUX AMD VIDEO - AUTO ROCm SETUP
cd /d "%~dp0"
echo ============================================================
echo THEUX AI - AMD WINDOWS ROCm AUTOMATIC SETUP
echo ============================================================
echo Using an isolated Python 3.12 environment; no global changes.
echo ROCm 7.2.1 requires Windows 11 and AMD driver 26.2.2.
echo Requires free SSD space for PyTorch runtime and video weights.
echo.
where py >nul 2>&1
if errorlevel 1 goto installPython
py -3.12 -c "import sys; assert sys.version_info[:2] == (3,12)" >nul 2>&1
if errorlevel 1 goto installPython
goto pythonReady
:installPython
echo [1/7] Installing official Python 3.12...
where winget >nul 2>&1
if errorlevel 1 goto wingetError
winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto failed
echo Python installed. Please rerun this file so PATH refreshes.
pause
exit /b 0
:pythonReady
echo [1/7] Python 3.12 ready.
set "BASE=%CD%\data\wan-video"
set "VENV=%BASE%\venv-amd"
set "PY=%VENV%\Scripts\python.exe"
if not exist "%BASE%" mkdir "%BASE%"
if not exist "%PY%" (
 echo [2/7] Creating isolated virtual environment...
 py -3.12 -m venv "%VENV%"
 if errorlevel 1 goto failed
)
"%PY%" -m pip install --upgrade pip wheel setuptools
if errorlevel 1 goto failed
echo [3/7] Installing AMD official ROCm Windows SDK 7.2.1...
"%PY%" -m pip install --no-cache-dir ^
 "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/rocm_sdk_core-7.2.1-py3-none-win_amd64.whl" ^
 "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/rocm_sdk_devel-7.2.1-py3-none-win_amd64.whl" ^
 "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/rocm_sdk_libraries_custom-7.2.1-py3-none-win_amd64.whl" ^
 "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/rocm-7.2.1.tar.gz"
if errorlevel 1 goto failed
echo [4/7] Installing AMD official ROCm PyTorch wheels...
"%PY%" -m pip install --no-cache-dir ^
 "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/torch-2.9.1%%2Brocm7.2.1-cp312-cp312-win_amd64.whl" ^
 "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/torchaudio-2.9.1%%2Brocm7.2.1-cp312-cp312-win_amd64.whl" ^
 "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/torchvision-0.24.1%%2Brocm7.2.1-cp312-cp312-win_amd64.whl"
if errorlevel 1 goto failed
echo Checking AMD GPU and ROCm before model download...
"%PY%" -c "import torch; print('Torch:',torch.__version__,'ROCm:',torch.version.hip,'GPU:',torch.cuda.is_available()); assert torch.version.hip is not None and torch.cuda.is_available(); print(torch.cuda.get_device_name(0))"
if errorlevel 1 goto driverError
echo [5/7] Installing video requirements without NVIDIA flash_attn...
"%PY%" -m pip install -r "%~dp0video-requirements-amd.txt"
if errorlevel 1 goto failed
echo Verifying the AMD Torch wheel has not been overwritten...
"%PY%" -c "import torch; print(torch.__version__,torch.version.hip,torch.cuda.is_available()); assert torch.version.hip is not None and torch.cuda.is_available()"
if errorlevel 1 goto failed
where git >nul 2>&1
if errorlevel 1 goto gitError
echo [6/7] Checking Wan2.1 source...
if not exist "%BASE%\Wan2.1\generate.py" (
 git clone --depth 1 https://github.com/Wan-Video/Wan2.1.git "%BASE%\Wan2.1"
 if errorlevel 1 goto failed
)
echo [7/7] Downloading Wan2.1 1.3B weights...
"%PY%" -m huggingface_hub download Wan-AI/Wan2.1-T2V-1.3B --local-dir "%BASE%\Wan2.1-T2V-1.3B"
if errorlevel 1 (
 "%PY%" -m pip install "huggingface_hub[cli]"
 hf download Wan-AI/Wan2.1-T2V-1.3B --local-dir "%BASE%\Wan2.1-T2V-1.3B"
 if errorlevel 1 goto failed
)
echo.
echo ROCm setup and model download complete.
echo Run THEUX-AI.bat once to restart backend with isolated Python.
echo.
pause
exit /b 0
:wingetError
echo Windows package manager winget is missing. Python 3.12 cannot be installed automatically.
goto failed
:gitError
echo Git is missing. Run THEUX-AI.bat first, then retry.
goto failed
:driverError
echo AMD ROCm installed, but GPU cannot be used. Check Windows 11 and driver 26.2.2.
echo This installer stopped before downloading video weights.
goto failed
:failed
echo.
echo Setup failed. Global Python was not changed. Check the output above.
pause
exit /b 1
