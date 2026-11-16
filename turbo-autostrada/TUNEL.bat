@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Link public pentru joc (porneste intai START.bat)
node tunnel.js
pause
