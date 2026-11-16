@echo off
rem Deschide jocul in modul ELIMINARE (fereastra verticala pentru TikTok LIVE Studio)
rem Porneste intai START.bat. Fereastra foloseste un profil Chrome separat, cu placa video dedicata
rem si fara incetinire cand e acoperita de alte ferestre (LIVE Studio).
start "" chrome --app=http://localhost:3000/?mode=elimination --window-size=540,980 --user-data-dir="%LOCALAPPDATA%\TurboStrada\chrome" --no-first-run --no-default-browser-check --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --ignore-gpu-blocklist --force_high_performance_gpu --autoplay-policy=no-user-gesture-required
