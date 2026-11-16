@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LIVE 1 - CLASIC (port 3001)
rem LIVE 1: jocul CLASIC, pe portul 3001. Contul TikTok se scrie in lives\clasic.json ("tiktokUsername").
rem FEREASTRA=0 (recomandat): jocul se pune in TikTok LIVE Studio ca sursa "Link" la 1080x1920, clar si la 60 FPS.
rem FEREASTRA=1: se deschide si fereastra Chrome a jocului (pentru captura de fereastra). NU folosi ambele deodata.
set FEREASTRA=0
set LINK=http://localhost:3001/?live=1
where node >nul 2>nul || (echo Node.js nu este instalat. Descarca-l de pe https://nodejs.org ^(versiunea LTS^) si porneste din nou. & pause & exit /b)
if not exist node_modules\tiktok-live-connector call npm install --no-audit --no-fund
rem opreste un server vechi ramas pe portul 3001
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3001 .*LISTENING"') do taskkill /f /pid %%p >nul 2>nul
start "" http://localhost:3001/panel.html
if "%FEREASTRA%"=="1" start "" chrome --app=http://localhost:3001/ --window-size=540,980 --user-data-dir="%LOCALAPPDATA%\TurboStrada\chrome-clasic" --no-first-run --no-default-browser-check --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --ignore-gpu-blocklist --force_high_performance_gpu --autoplay-policy=no-user-gesture-required
if "%FEREASTRA%"=="0" (
  echo|set /p="%LINK%"|clip
  echo.
  echo  ============================================================
  echo   TikTok LIVE Studio: Adauga sursa ^> Link ^> lipeste ^(Ctrl+V^):
  echo     %LINK%
  echo   Dimensiune 1080 x 1920, apoi intinde sursa pe tot ecranul.
  echo   ^(linkul e deja copiat; il gasesti si in panou^)
  echo  ============================================================
  echo.
)
node server.js lives\clasic.json
pause
