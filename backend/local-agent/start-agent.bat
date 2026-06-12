@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

title Auyologic Local Agent

cd /d "%~dp0"

set AUTH_KEEP_BROWSER_OPEN=1

echo.
echo ========================================
echo   Auyologic Local Agent  v1.2.6
echo ========================================
echo.

:: -------- Node.js --------
set "NODE_CMD="

if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
    echo [Node] bundled node.exe
    goto check_npm
)

where node >nul 2>nul
if !errorlevel!==0 (
    set "NODE_CMD=node"
    echo [Node] system node
    goto check_npm
)

echo [Node] downloading portable Node.js...
set "NODE_VER=v20.17.0"
set "NODE_ZIP=node-%NODE_VER%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/%NODE_VER%/%NODE_ZIP%"

powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%NODE_URL%', '%~dp0%NODE_ZIP%')"

if not exist "%~dp0%NODE_ZIP%" (
    echo [ERROR] Node download failed. Check network.
    pause
    exit /b 1
)

echo [Node] extracting...
set "NODE_EXTRACT_DIR=node-%NODE_VER%-win-x64"

powershell -NoProfile -Command "Expand-Archive -Path '%~dp0%NODE_ZIP%' -DestinationPath '%~dp0_node_tmp' -Force"

copy /y "%~dp0_node_tmp\%NODE_EXTRACT_DIR%\node.exe" "%~dp0node.exe" >nul
xcopy /e /y /q "%~dp0_node_tmp\%NODE_EXTRACT_DIR%\node_modules" "%~dp0node_modules_npm\" >nul 2>nul
copy /y "%~dp0_node_tmp\%NODE_EXTRACT_DIR%\npm.cmd" "%~dp0npm.cmd" >nul 2>nul
rmdir /s /q "%~dp0_node_tmp" >nul 2>nul
del /q "%~dp0%NODE_ZIP%" >nul 2>nul

set "NODE_CMD=%~dp0node.exe"
echo [Node] ready
echo.

:check_npm
set "NPM_CMD="

if exist "%~dp0npm.cmd" (
    set "NPM_CMD=%~dp0npm.cmd"
    goto install_deps
)

where npm >nul 2>nul
if !errorlevel!==0 (
    set "NPM_CMD=npm"
    goto install_deps
)

set "NPM_CMD=%NODE_CMD% %~dp0node_modules_npm\npm\bin\npm-cli.js"

:install_deps
if not exist "%~dp0node_modules\playwright" (
    echo [npm] installing dependencies...
    call %NPM_CMD% install
    if !errorlevel! neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo [npm] done
    echo.
)

echo [Playwright] checking Chromium...
set PLAYWRIGHT_BROWSERS_PATH=0
"%NODE_CMD%" scripts\install-playwright.mjs
if !errorlevel! neq 0 (
    echo [WARN] Playwright install failed. Run install-playwright.bat
    pause
)
echo.

:: -------- Environment --------
echo.
echo ========================================
echo   选择连接地址
echo ========================================
echo   Y = 本地开发环境（用户请勿选择）   http://localhost:3003
echo   N = 线上生产环境  Zeabur
echo.
echo 请输入 Y or N
echo.

choice /c YN /n /m "Select: "

if errorlevel 2 (
    set "SERVER_URL=https://auyologic-geo-w.zeabur.app"
    set "ENV_NAME=production"
) else (
    set "SERVER_URL=http://localhost:3003"
    set "ENV_NAME=local dev"
)

echo.
echo [ENV] %ENV_NAME%
echo [URL] %SERVER_URL%
echo.
echo [START] launching agent...
echo.

"%NODE_CMD%" "%~dp0index.js" "%SERVER_URL%"
set "AGENT_EXIT=%ERRORLEVEL%"

echo.
if not "%AGENT_EXIT%"=="0" (
    echo [EXIT] Agent exited with code %AGENT_EXIT%
    echo.
)
pause
endlocal
