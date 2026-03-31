@echo off
chcp 65001 >nul
title Auyologic 本地授权代理

echo ╔══════════════════════════════════════╗
echo ║   Auyologic 本地授权代理  v1.0.0     ║
echo ╚══════════════════════════════════════╝
echo.

:: 切换到脚本所在目录（支持双击运行、从任意位置调用）
cd /d "%~dp0"

:: ── 第一步：确定 node 可执行文件 ──────────────────────────────────────
set NODE_CMD=

:: 优先用同目录下的便携版 node.exe
if exist "%~dp0node.exe" (
    set NODE_CMD="%~dp0node.exe"
    echo [Node] 使用内置便携版 Node.js
    goto :check_npm
)

:: 其次检测系统已安装的 node
where node >nul 2>nul
if %errorlevel% equ 0 (
    set NODE_CMD=node
    echo [Node] 使用系统 Node.js
    goto :check_npm
)

:: 都没有：自动下载便携版 Node.js（Windows 10/11 自带 curl 和 PowerShell）
echo [Node] 未检测到 Node.js，正在自动下载便携版...
echo        （仅首次需要，约 30MB，请保持网络畅通）
echo.

set NODE_VER=v20.17.0
set NODE_ZIP=node-%NODE_VER%-win-x64.zip
set NODE_URL=https://nodejs.org/dist/%NODE_VER%/%NODE_ZIP%

:: 用 PowerShell 下载
powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%NODE_URL%', '%~dp0%NODE_ZIP%') }"
if not exist "%~dp0%NODE_ZIP%" (
    echo [错误] 下载失败，请检查网络或手动安装 Node.js：https://nodejs.org/
    pause
    exit /b 1
)

echo [解压] 正在解压 Node.js...
powershell -Command "Expand-Archive -Path '%~dp0%NODE_ZIP%' -DestinationPath '%~dp0_node_tmp' -Force"
:: 把 node.exe 和 npm 相关文件移到当前目录
copy /y "%~dp0_node_tmp\node-%NODE_VER%-win-x64\node.exe" "%~dp0node.exe" >nul
xcopy /e /y /q "%~dp0_node_tmp\node-%NODE_VER%-win-x64\node_modules" "%~dp0node_modules_npm\" >nul 2>nul
copy /y "%~dp0_node_tmp\node-%NODE_VER%-win-x64\npm" "%~dp0npm" >nul 2>nul
copy /y "%~dp0_node_tmp\node-%NODE_VER%-win-x64\npm.cmd" "%~dp0npm.cmd" >nul 2>nul

:: 清理临时文件
rmdir /s /q "%~dp0_node_tmp" >nul 2>nul
del /q "%~dp0%NODE_ZIP%" >nul 2>nul

set NODE_CMD="%~dp0node.exe"
echo [完成] Node.js 便携版已就绪
echo.

:: ── 第二步：确定 npm 命令 ─────────────────────────────────────────────
:check_npm
set NPM_CMD=

if exist "%~dp0npm.cmd" (
    set NPM_CMD="%~dp0npm.cmd"
    goto :install_deps
)

where npm >nul 2>nul
if %errorlevel% equ 0 (
    set NPM_CMD=npm
    goto :install_deps
)

:: node.exe 自带 npm（通过 node 调用）
set NPM_CMD=%NODE_CMD% "%~dp0node_modules_npm\npm\bin\npm-cli.js"

:: ── 第三步：安装依赖 ──────────────────────────────────────────────────
:install_deps
if not exist "%~dp0node_modules\playwright" (
    echo [安装] 首次运行，正在安装依赖（playwright 约 5MB，请稍候）...
    %NPM_CMD% install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
    echo [完成] 依赖安装成功
    echo.
)

:: ── 第四步：启动代理 ──────────────────────────────────────────────────
echo [启动] 正在启动代理...
echo        首次使用会提示输入服务器地址，之后自动记住
echo.
%NODE_CMD% "%~dp0index.js" %1

pause
