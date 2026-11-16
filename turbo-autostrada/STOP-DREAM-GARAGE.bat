@echo off
powershell -NoProfile -Command "$gameConnection = Get-NetTCPConnection -State Listen -LocalPort 3210 -ErrorAction SilentlyContinue; if ($gameConnection) { $gameServer = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $gameConnection[0].OwningProcess); if ($gameServer.Name -eq 'node.exe' -and $gameServer.CommandLine -match 'garage-server\.js') { Stop-Process -Id $gameServer.ProcessId; Write-Host 'Dream Garage game server stopped.' } }"
pause
