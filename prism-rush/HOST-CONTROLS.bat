@echo off
cd /d "%~dp0"
node --input-type=module -e "import { openGameWindow } from './game-window.js'; openGameWindow('http://localhost:4328/host', true);"
