#!/bin/bash
# macOS：双击本文件 = 只安装 Playwright 浏览器（不启动代理）
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1
chmod +x install-playwright.sh install-playwright.command start-agent.sh start-agent.command 2>/dev/null || true
exec bash ./install-playwright.sh
