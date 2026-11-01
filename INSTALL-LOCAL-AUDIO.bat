@echo off
setlocal EnableExtensions
title THEUX - Free Local Audio Installation
cd /d "%~dp0"
echo.
echo ======================================================
echo   THEUX AUDIO STUDIO - EARSHOT AND REAL SOUND
echo   Separate CPU environment. AMD video is untouched.
echo ======================================================
echo.
where git >nul 2>nul
if errorlevel 1 (echo ERROR: Git is required. & goto failed)
py -3.12 --version >nul 2>nul
if errorlevel 1 (echo ERROR: Python 3.12 is required for this installer. & goto failed)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo FFmpeg not found. Trying free FFmpeg installation with winget...
  where winget >nul 2>nul
  if errorlevel 1 (echo ERROR: Install FFmpeg and FFprobe, then rerun this file. & goto failed)
  winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements
  echo If installed just now, close and reopen this window so PATH updates.
  where ffmpeg >nul 2>nul
  if errorlevel 1 (echo ERROR: FFmpeg not yet visible in PATH. Reopen and rerun. & goto failed)
)
set "AUDIO=%~dp0data\earshot"
if not exist "%AUDIO%" mkdir "%AUDIO%"
if not exist "%AUDIO%\repo\pyproject.toml" (
  echo Downloading official Earshot source...
  git clone --depth 1 https://github.com/Leonxlnx/earshot "%AUDIO%\repo"
  if errorlevel 1 goto failed
)
if not exist "%AUDIO%\venv\Scripts\python.exe" (
  py -3.12 -m venv "%AUDIO%\venv"
  if errorlevel 1 goto failed
)
set "PY=%AUDIO%\venv\Scripts\python.exe"
"%PY%" -m pip install --upgrade pip
if errorlevel 1 goto failed
echo Installing CPU-only PyTorch in a separate environment...
"%PY%" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto failed
echo Installing Earshot, Real Sound mixer requirements, and audio QA tools...
"%PY%" -m pip install -e "%AUDIO%\repo" pyloudnorm
if errorlevel 1 goto failed
"%PY%" -m earshot doctor --fetch
if errorlevel 1 goto failed
"%PY%" -m earshot doctor
if errorlevel 1 goto failed
echo.
echo THEUX AUDIO READY. Restart THEUX-AI.bat after the current video finishes.
pause
exit /b 0
:failed
echo.
echo Audio install stopped. Your existing AMD video engine was not changed.
pause
exit /b 1
