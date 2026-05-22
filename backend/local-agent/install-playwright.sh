#!/usr/bin/env bash
# 傻瓜式：安装 Playwright Chromium（可单独运行，也会被 start-agent.sh 自动调用）
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${AGENT_DIR}"

echo ""
echo "  若只需安装浏览器、不启动代理，运行本脚本即可。"
echo "  安装完成后，可双击 start-agent.command 启动代理。"
echo ""

NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
else
  if [ -x "${AGENT_DIR}/_node_portable/bin/node" ]; then
    NODE_BIN="${AGENT_DIR}/_node_portable/bin/node"
  else
    echo "[提示] 未找到 Node.js，请先双击 start-agent.command 完成环境初始化，"
    echo "       或从 https://nodejs.org 安装 Node 后再运行本脚本。"
    read -r -p "按回车键关闭… " _
    exit 1
  fi
fi

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-0}"
"${NODE_BIN}" scripts/install-playwright.mjs
EXIT=$?

echo ""
if [ "${EXIT}" -eq 0 ]; then
  echo "  可以关闭本窗口，然后双击 start-agent.command 启动本地代理。"
else
  echo "  安装未成功，请检查上方报错或网络。"
fi
read -r -p "按回车键关闭… " _
exit "${EXIT}"
