@echo off
echo Starting Auyologic Geo Project...
cd /d "%~dp0"
start /b cmd /c "npm run dev &"
timeout /t 3 /nobreak >nul
start http://localhost:3003
echo Done!
