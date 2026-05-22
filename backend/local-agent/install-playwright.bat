@echo off
chcp 65001 >nul
title 安装 Playwright 浏览器（Chromium）
cd /d "%~dp0"

echo.
echo   傻瓜式安装：自动执行 npx playwright install chromium
echo   完成后请运行 start-agent.bat 启动本地代理
echo.

set "NODE_CMD=node"
where node >nul 2>&1 || (
  if exist "%~dp0_node_portable\node.exe" set "NODE_CMD=%~dp0_node_portable\node.exe"
)

if not exist "%~dp0node_modules\playwright" (
  echo [1/2] npm install ...
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败
    pause
    exit /b 1
  )
)

set PLAYWRIGHT_BROWSERS_PATH=0
echo [2/2] npx playwright install chromium ...
echo       首次约 150MB，请稍候...
echo.
call npx playwright install chromium
if errorlevel 1 (
  echo.
  echo [失败] 请检查网络，或在本机安装 Google Chrome 后重试
  pause
  exit /b 1
)

echo.
echo [完成] 浏览器已安装，可运行 start-agent.bat
echo.
pause
