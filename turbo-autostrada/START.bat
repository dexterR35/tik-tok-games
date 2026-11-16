@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TURBOSTRADA - LIVE @weallrobots (port 3000)
rem UN SINGUR JOC: pornesti asta si alegi jocul (Clasic / Challenge / Echipe / Eliminare) din panou, oricand.
rem Contul TikTok si jocul de la pornire sunt in config.json.
rem FEREASTRA=0 (recomandat): TikTok LIVE Studio cere un link https, asa ca se porneste si TUNELUL.
rem    In fereastra TUNEL apare linkul pentru LIVE Studio (deja copiat) -> Add source > Link > Ctrl+V, 1080 x 1920.
rem FEREASTRA=1: se deschide fereastra Chrome a jocului (pentru Window capture). NU folosi ambele deodata.
set FEREASTRA=0
where node >nul 2>nul || (echo Node.js nu este instalat. Descarca-l de pe https://nodejs.org ^(versiunea LTS^) si porneste din nou. & pause & exit /b)
if not exist node_modules\tiktok-live-connector call npm install --no-audit --no-fund
rem opreste un server vechi ramas pe portul 3000
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do taskkill /f /pid %%p >nul 2>nul
start "" http://localhost:3000/panel.html
if "%FEREASTRA%"=="1" start "" chrome --app=http://localhost:3000/ --window-size=540,980 --user-data-dir="%LOCALAPPDATA%\TurboStrada\chrome" --no-first-run --no-default-browser-check --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --ignore-gpu-blocklist --force_high_performance_gpu --autoplay-policy=no-user-gesture-required
if "%FEREASTRA%"=="0" (
  start "TUNEL - link pentru LIVE Studio" cmd /k node tunnel.js
  echo.
  echo  ============================================================
  echo   Linkul pentru TikTok LIVE Studio apare in fereastra TUNEL
  echo   ^(si in panou^) in cateva secunde, deja copiat.
  echo   LIVE Studio: Add source ^> Link ^> Ctrl+V, Custom resolution 1080 x 1920.
  echo   Linkul se schimba la fiecare pornire: pune-l din nou in LIVE Studio.
  echo  ============================================================
  echo.
)
node server.js
pause
