@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title THEUX - Local Lemo-Opuscar installer
if not exist "data\install-logs" mkdir "data\install-logs"
set "LOG=data\install-logs\opuscar-install.log"
echo === THEUX OPUSCAR INSTALL %DATE% %TIME% === > "%LOG%"
where node >> "%LOG%" 2>&1
if errorlevel 1 goto failed
where ffmpeg >> "%LOG%" 2>&1
if errorlevel 1 (
 echo FFmpeg missing. Install with winget install Gyan.FFmpeg
 echo ERROR: FFmpeg not found >> "%LOG%"
 goto failed
)
where ffprobe >> "%LOG%" 2>&1
if errorlevel 1 goto failed
echo [1/3] Installing Node dependencies, reusing existing packages...
call npm install --no-audit --no-fund >> "%LOG%" 2>&1
if errorlevel 1 goto failed
echo [2/3] Checking local Chromium for Playwright...
node -e "const p=require('playwright');const f=require('fs');process.exit(f.existsSync(p.chromium.executablePath())?0:1)" >> "%LOG%" 2>&1
if errorlevel 1 (
 echo Installing local Chromium...
 call npx playwright install chromium >> "%LOG%" 2>&1
 if errorlevel 1 goto failed
)
echo [3/3] Checking local Ollama...
curl --silent --fail --max-time 5 http://127.0.0.1:11434/api/tags >> "%LOG%" 2>&1
if errorlevel 1 (
 echo Ollama is offline; start Ollama first. Installer preserved your configuration.
 goto failed
)
echo Installed! Restart THEUX-AI.bat only when your active Wan render has finished.
echo Installed >> "%LOG%"
pause
exit /b 0
:failed
echo Installation incomplete. See %CD%\%LOG%
echo FAILED >> "%LOG%"
pause
exit /b 1
