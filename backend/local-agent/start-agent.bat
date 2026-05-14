@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title Auyologic 本地授权代理

echo ╔══════════════════════════════════════╗
echo ║   Auyologic 本地授权代理  v1.0.0     ║
echo ╚══════════════════════════════════════╝
echo.

:: 切换到脚本目录
cd /d "%~dp0"

:: ================================
:: 1. 检测 Node.js
:: ================================
set "NODE_CMD="

if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
    echo [Node] 使用内置便携版 Node.js
    goto check_npm
)

where node >nul 2>nul
if %errorlevel%==0 (
    set "NODE_CMD=node"
    echo [Node] 使用系统 Node.js
    goto check_npm
)

:: ================================
:: 2. 自动下载 Node
:: ================================
echo [Node] 未检测到 Node.js，正在下载便携版...
echo        首次运行需要约 30MB，请稍候...
echo.

set "NODE_VER=v20.17.0"
set "NODE_ZIP=node-%NODE_VER%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/%NODE_VER%/%NODE_ZIP%"

powershell -Command ^
"[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; ^
(New-Object Net.WebClient).DownloadFile('%NODE_URL%', '%~dp0%NODE_ZIP%')"

if not exist "%~dp0%NODE_ZIP%" (
    echo [错误] Node 下载失败，请检查网络
    pause
    exit /b 1
)

echo [解压] 正在处理 Node.js...

powershell -Command "Expand-Archive -Path '%~dp0%NODE_ZIP%' -DestinationPath '%~dp0_node_tmp' -Force"

set "TMP=node-%NODE_VER%-win-x64"

copy /y "%~dp0_node_tmp\%TMP%\node.exe" "%~dp0node.exe" >nul

xcopy /e /y /q "%~dp0_node_tmp\%TMP%\node_modules" "%~dp0node_modules_npm\" >nul 2>nul

copy /y "%~dp0_node_tmp\%TMP%\npm.cmd" "%~dp0npm.cmd" >nul 2>nul

rmdir /s /q "%~dp0_node_tmp" >nul 2>nul
del /q "%~dp0%NODE_ZIP%" >nul 2>nul

set "NODE_CMD=%~dp0node.exe"

echo [完成] Node.js 就绪
echo.

:: ================================
:: 3. npm 检测
:: ================================
:check_npm

set "NPM_CMD="

if exist "%~dp0npm.cmd" (
    set "NPM_CMD=%~dp0npm.cmd"
    goto install_deps
)

where npm >nul 2>nul
if %errorlevel%==0 (
    set "NPM_CMD=npm"
    goto install_deps
)

set "NPM_CMD=%NODE_CMD% %~dp0node_modules_npm\npm\bin\npm-cli.js"

:: ================================
:: 4. 安装依赖
:: ================================
:install_deps

if not exist "%~dp0node_modules\playwright" (
    echo [安装] 首次启动，安装依赖中（可能需要几分钟）...
    echo.

    %NPM_CMD% install

    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )

    echo [完成] 依赖安装成功
    echo.
)

:: ================================
:: 5. 选择环境
:: ================================
echo.
echo ╔══════════════════════════════════════╗
echo ║            请选择运行环境            ║
echo ╚══════════════════════════════════════╝
echo.
echo   [Y] 开发环境 (localhost)
echo   [N] 生产环境 (线上)
echo.
echo 直接按 Y 或 N 键选择（无需回车）
echo.

choice /c YN /n /m "请选择环境: "

if errorlevel 2 (
    set "SERVER_URL=https://auyologic-geo-w.zeabur.app/"
    set "ENV_NAME=生产环境"
) else (
    set "SERVER_URL=http://localhost:3003/"
    set "ENV_NAME=开发环境"
)

echo.
echo [环境] %ENV_NAME%
echo [地址] %SERVER_URL%
echo.

:: ================================
:: 6. 启动
:: ================================
echo [启动] 正在启动代理...
echo.

%NODE_CMD% "%~dp0index.js" "%SERVER_URL%"

echo.
pause
