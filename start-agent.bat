@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0backend\local-agent"
if not exist "start-agent.bat" (
    echo [ERROR] Cannot find backend\local-agent\start-agent.bat
    echo Please run from project root or use local-agent folder directly.
    pause
    exit /b 1
)
call "%~dp0backend\local-agent\start-agent.bat"
