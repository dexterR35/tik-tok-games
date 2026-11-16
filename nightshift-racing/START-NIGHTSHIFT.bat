@echo off
title NIGHTSHIFT - Live Street Racing
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js first: https://nodejs.org
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
if not exist dist\vendor\three.module.js (
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node server.mjs --open
pause
