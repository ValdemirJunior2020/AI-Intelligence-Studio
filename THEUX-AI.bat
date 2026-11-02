@echo off
setlocal EnableExtensions
title THEUX DESIGN - AI Studio Installer and Launcher
cd /d "%~dp0"
echo.
echo ============================================================
echo       THEUX DESIGN - ONE-CLICK WINDOWS AI STUDIO
echo ============================================================
echo Project: %CD%
echo AMD Radeon supported with a compatible Ollama ROCm driver.
echo No NVIDIA GPU, no ComfyUI.
echo.
where node >nul 2>&1
if errorlevel 1 (
 echo [1/6] Installing Node.js via winget...
 where winget >nul 2>&1
 if errorlevel 1 goto :manualNode
 winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
 where node >nul 2>&1
 if errorlevel 1 goto :reopen
)
echo [1/6] Node.js detected:
node --version
where npm >nul 2>&1
if errorlevel 1 goto :reopen
where git >nul 2>&1
if errorlevel 1 (
 echo [2/6] Installing Git via winget...
 where winget >nul 2>&1
 if errorlevel 1 goto :manualGit
 winget install --id Git.Git --exact --accept-package-agreements --accept-source-agreements
 where git >nul 2>&1
 if errorlevel 1 goto :reopen
)
echo [2/6] Git available.
if not exist ".env" (
 copy /Y ".env.example" ".env" >nul
 echo [3/6] Created local environment template.
) else (
 echo [3/6] Preserved existing .env. All localhost Vite ports are now allowed.
)
echo [4/6] Installing/checking Node dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 goto :failed
echo Checking Lemo-Opuscar local browser...
node -e "const p=require('playwright'),f=require('fs');process.exit(f.existsSync(p.chromium.executablePath())?0:1)" >nul 2>&1
if errorlevel 1 (
 echo Installing Playwright Chromium locally...
 call npx playwright install chromium
 if errorlevel 1 echo Warning: Chromium install failed. Check INSTALL-LOCAL-OPUSCAR.bat logs.
)
where ffmpeg >nul 2>&1
if errorlevel 1 (
 echo FFmpeg missing - attempting free Windows installation...
 where winget >nul 2>&1
 if not errorlevel 1 winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements
 echo If FFmpeg was installed, reopen THEUX after Windows PATH refreshes.
)

where ollama >nul 2>&1
if errorlevel 1 (
 echo [5/6] Installing Ollama via winget...
 where winget >nul 2>&1
 if errorlevel 1 goto :manualOllama
 winget install --id Ollama.Ollama --exact --accept-package-agreements --accept-source-agreements
 where ollama >nul 2>&1
 if errorlevel 1 goto :reopen
)
echo [5/6] Ollama detected.
curl --silent --max-time 3 http://127.0.0.1:11434/api/tags >nul 2>&1
if errorlevel 1 (
 echo Starting Ollama...
 start "THEUX - Ollama" /MIN cmd /c "ollama serve"
 timeout /t 5 /nobreak >nul
)
echo [6/6] Checking local AI models...
ollama list 2>nul | findstr /i "qwen deepseek llama gemma" >nul
if errorlevel 1 (
 echo No common local AI model detected.
 choice /C YN /N /M "Download qwen2.5-coder:7b (~4.7 GB)? [Y/N]: "
 if errorlevel 2 goto :skipModel
 ollama pull qwen2.5-coder:7b
 if errorlevel 1 echo Model pull failed. Run ollama pull qwen2.5-coder:7b manually.
) else (
 echo Existing local models detected; skipping duplicate download.
)
:skipModel
echo Launching backend and frontend...
start "THEUX - Backend" cmd /k "cd /d ""%CD%"" && npm run server"
timeout /t 3 /nobreak >nul
start "THEUX - Frontend" cmd /k "cd /d ""%CD%"" && npm run dev"
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:5173"
echo.
echo ------------------------------------------------------------
echo Web: http://127.0.0.1:5173
echo API: http://127.0.0.1:4317/api/health
echo ------------------------------------------------------------
echo Create super admin on your first visit. Password 12+ chars.
echo For Netlify publish the dist folder built by npm run build.
echo MiniMax video needs a PAID key set in local .env.
echo.
powershell -NoProfile -Command "$sum=(Get-ChildItem -LiteralPath '.' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum; Write-Host ('Project folder: {0:N2} GB, excludes external Ollama models' -f ($sum/1GB))"
echo.
pause
exit /b 0
:manualNode
echo Install Node 22+ from https://nodejs.org and rerun.
goto :failed
:manualGit
echo Install Git from https://git-scm.com and rerun.
goto :failed
:manualOllama
echo Install Ollama from https://ollama.com/download and rerun.
goto :failed
:reopen
echo Refresh Windows PATH by reopening this BAT.
goto :failed
:failed
echo Setup incomplete; read the error above and retry.
pause
exit /b 1
