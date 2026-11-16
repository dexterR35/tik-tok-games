@echo off
rem Opreste serverul jocului (portul 3000)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do taskkill /f /pid %%p >nul 2>nul
echo Server oprit.
timeout /t 2 >nul
