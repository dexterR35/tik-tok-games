@echo off
rem Opreste toate cele 4 live-uri (porturile 3001-3004)
for %%P in (3001 3002 3003 3004) do for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do taskkill /f /pid %%p >nul 2>nul
echo Live-uri oprite.
timeout /t 2 >nul
