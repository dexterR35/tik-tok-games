@echo off
title THE LAST CITY - Zombie Defense LIVE
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer first: https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node server.mjs --open
pause
