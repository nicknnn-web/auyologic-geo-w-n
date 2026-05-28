#!/usr/bin/env bash
# Auyologic 本地授权代理 — macOS / Linux（与 start-agent.bat 一致：无 Node 时自动下载便携版）
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${AGENT_DIR}"
chmod +x install-playwright.sh install-playwright.command start-agent.sh start-agent.command 2>/dev/null || true

# 授权成功后保持浏览器打开（便于对比）；恢复自动关窗：export AUTH_KEEP_BROWSER_OPEN=0
export AUTH_KEEP_BROWSER_OPEN="${AUTH_KEEP_BROWSER_OPEN:-1}"

NODE_VER="v20.17.0"
NODE_BIN=""
NPM_BIN=""

echo "╔══════════════════════════════════════╗"
echo "║   Auyologic 本地授权代理  v1.0.0     ║"
echo "╚══════════════════════════════════════╝"
echo

detect_node_platform() {
  local arch kernel
  arch="$(uname -m)"
  kernel="$(uname -s)"
  case "${kernel}" in
    Darwin)
      case "${arch}" in
        arm64|aarch64) echo "darwin-arm64" ;;
        x86_64) echo "darwin-x64" ;;
        *) echo "" ;;
      esac
      ;;
    Linux)
      case "${arch}" in
        x86_64|amd64) echo "linux-x64" ;;
        aarch64|arm64) echo "linux-arm64" ;;
        *) echo "" ;;
      esac
      ;;
    *)
      echo ""
      ;;
  esac
}

download_portable_node() {
  local platform tarball url folder
  platform="$(detect_node_platform)"
  if [ -z "${platform}" ]; then
    echo "[错误] 不支持的操作系统: $(uname -s) $(uname -m)"
    exit 1
  fi

  tarball="node-${NODE_VER}-${platform}.tar.gz"
  url="https://nodejs.org/dist/${NODE_VER}/${tarball}"
  folder="node-${NODE_VER}-${platform}"

  echo "[Node] 未检测到 Node.js，正在下载便携版..."
  echo "       首次约 40MB，请稍候…"
  echo "       ${url}"
  echo

  if [ -f "${tarball}" ]; then
    rm -f "${tarball}"
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "${tarball}" "${url}" || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "${tarball}" "${url}" || true
  else
    echo "[错误] 需要 curl 或 wget 才能自动下载 Node.js"
    echo "       请手动安装: https://nodejs.org"
    exit 1
  fi

  if [ ! -s "${tarball}" ]; then
    echo "[错误] Node 下载失败，请检查网络或手动安装 Node.js"
    exit 1
  fi

  echo "[解压] 正在处理 Node.js…"
  rm -rf "_node_tmp" "_node_portable"
  mkdir -p "_node_tmp"
  tar -xzf "${tarball}" -C "_node_tmp"
  if [ ! -x "_node_tmp/${folder}/bin/node" ]; then
    echo "[错误] 解压后未找到 node 可执行文件"
    exit 1
  fi
  mv "_node_tmp/${folder}" "_node_portable"
  rm -rf "_node_tmp" "${tarball}"
  chmod +x "_node_portable/bin/node" 2>/dev/null || true
  echo "[完成] Node.js 便携版就绪"
  echo
}

resolve_node_and_npm() {
  if [ -x "${AGENT_DIR}/node" ]; then
    NODE_BIN="${AGENT_DIR}/node"
    echo "[Node] 使用目录内便携版 Node.js"
  elif [ -x "${AGENT_DIR}/_node_portable/bin/node" ]; then
    NODE_BIN="${AGENT_DIR}/_node_portable/bin/node"
    echo "[Node] 使用已下载的便携版 Node.js"
  elif command -v node >/dev/null 2>&1; then
    NODE_BIN="node"
    echo "[Node] 使用系统 Node.js"
  else
    download_portable_node
    NODE_BIN="${AGENT_DIR}/_node_portable/bin/node"
  fi

  if [ -x "${AGENT_DIR}/_node_portable/bin/npm" ]; then
    NPM_BIN="${AGENT_DIR}/_node_portable/bin/npm"
  elif command -v npm >/dev/null 2>&1; then
    NPM_BIN="npm"
  elif [ -x "${AGENT_DIR}/_node_portable/bin/node" ]; then
    NPM_BIN="${AGENT_DIR}/_node_portable/bin/npm"
  else
    echo "[错误] 未找到 npm"
    exit 1
  fi

  echo "[Node] $("${NODE_BIN}" -v) — ${NODE_BIN}"
  echo
}

resolve_node_and_npm

if [ ! -d node_modules/playwright ]; then
  echo "[安装] 首次启动，安装依赖中（可能需要几分钟）…"
  echo
  "${NPM_BIN}" install
  echo
  echo "[完成] 依赖安装成功"
  echo
fi

# Playwright 浏览器：自动执行 install-playwright（内含 npx playwright install chromium）
echo "[Playwright] 检查浏览器（已安装则跳过；首次约 150MB）…"
echo "       也可单独双击 install-playwright.command 仅安装浏览器。"
echo
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-0}"
if ! "${NODE_BIN}" scripts/install-playwright.mjs; then
  echo
  echo "[警告] 浏览器安装未成功。可双击 install-playwright.command 重试，"
  echo "       或安装 Google Chrome 后再次启动本代理。"
  echo
  read -r -p "仍要继续启动代理吗？[y/N] " cont
  case "${cont}" in
    y|Y|yes|是) ;;
    *) exit 1 ;;
  esac
fi

echo
echo "╔══════════════════════════════════════╗"
echo "║            请选择运行环境            ║"
echo "╚══════════════════════════════════════╝"
echo
echo "  [1] 开发环境 (http://localhost:3003/)"
echo "  [2] 生产环境 (https://auyologic-geo-w.zeabur.app/)"
echo
read -r -p "请选择 [1/2]，直接回车默认 1: " choice

case "${choice:-1}" in
  2|n|N|生产|prod|production)
    SERVER_URL="https://auyologic-geo-w.zeabur.app/"
    ENV_NAME="生产环境"
    ;;
  *)
    SERVER_URL="http://localhost:3003/"
    ENV_NAME="开发环境"
    ;;
esac

echo
echo "[环境] ${ENV_NAME}"
echo "[地址] ${SERVER_URL}"
echo
echo "[启动] 正在启动代理…"
echo
echo "（按 Ctrl+C 可停止代理）"
echo

"${NODE_BIN}" index.js "${SERVER_URL}"
EXIT_CODE=$?

echo
if [ "${EXIT_CODE}" -ne 0 ]; then
  echo "[退出] 代理异常结束，代码: ${EXIT_CODE}"
else
  echo "[退出] 代理已停止"
fi
read -r -p "按回车键关闭此窗口… " _
exit "${EXIT_CODE}"
