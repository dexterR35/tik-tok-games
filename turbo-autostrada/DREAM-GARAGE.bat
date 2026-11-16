@echo off
cd /d "%~dp0"
title Dream Garage - local prototype
where node >nul 2>nul || (echo Install Node.js LTS, then run this file again. & pause & exit /b)
if not exist node_modules\express (echo Run npm install in this folder first. & pause & exit /b)
node garage-server.js --open
pause
