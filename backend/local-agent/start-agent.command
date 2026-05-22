#!/bin/bash
# macOS：在 Finder 中双击本文件即可一键启动（会自动打开终端）
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1
chmod +x start-agent.sh start-agent.command install-playwright.sh install-playwright.command 2>/dev/null || true
exec bash ./start-agent.sh
