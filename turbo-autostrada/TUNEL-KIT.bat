@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Link public pentru pagina cu asset-uri (nu trebuie pornit jocul)
where node >nul 2>nul || (echo Node.js nu este instalat. & pause & exit /b)
if not exist node_modules\express call npm install --no-audit --no-fund
node kit-tunnel.js
pause
