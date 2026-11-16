@echo off
cd /d "%~dp0"
curl --fail --silent http://localhost:4316/api/state >nul 2>&1
if not errorlevel 1 (
  start "" http://localhost:4316
  exit /b
)
if not exist node_modules\express call npm install
start "" http://localhost:4316
node server.mjs
pause
