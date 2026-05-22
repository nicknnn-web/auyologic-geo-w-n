# Auyologic 本地代理

同一进程完成：**账号授权**（浏览器登录）与 **投放发布**（从队列取任务，本机 Playwright 发帖）。

从网页「下载本地代理」的 zip 已包含 `run-publish.mjs` 与 `src/services/playwrightPublisher.js`；仓库内开发时 `run-publish` 会自动使用上一级 `backend/src/services/playwrightPublisher.js`。

---

## 快速启动

| 系统 | 一键启动 |
|------|----------|
| Windows | 双击 `start-agent.bat` |
| macOS | **双击 `start-agent.command`**（自动打开终端；无 Node 时自动下载） |
| Linux | 执行 `bash start-agent.sh`（无 Node 时自动下载） |

### macOS 首次双击提示

若系统提示「无法打开」或「来自未知开发者」：在 `start-agent.command` 上 **右键 → 打开**，确认一次后即可正常双击。

**无需事先安装 Node.js**（与 Windows `start-agent.bat` 相同）：本机没有 Node 时，脚本会从 nodejs.org 自动下载便携版（约 40MB，仅首次），再执行 `npm install`。需能访问 nodejs.org 与 npm  registry。

若已安装系统 Node.js，则优先使用系统版本。

手动启动（任意系统）：

```bash
cd backend/local-agent
npm install   # 首次
node index.js http://localhost:3003/              # 开发
node index.js https://auyologic-geo-w.zeabur.app/   # 生产
```

---

# 如何制作免安装版（给用户直接用）

## 方案 A：在线版（推荐，最小体积 ~1MB）

只发给用户以下 4 个文件：
```
local-agent/
├── index.js
├── auth.js
├── package.json
├── start-agent.bat      （Windows 双击）
├── start-agent.command  （macOS 双击）
└── start-agent.sh       （Linux / 终端）
```

Windows 用户双击 `start-agent.bat`；Mac/Linux 用户执行 `start-agent.sh`。脚本会自动：
1. 检测是否有系统 Node.js
2. 没有则从 nodejs.org 下载便携版（约 30MB，仅首次）
3. 自动安装 playwright 依赖
4. 启动代理

> 要求：用户电脑能访问 nodejs.org（首次）和 npmjs.com（首次）

---

## 方案 B：离线版（最方便用户，体积约 80MB）

在你自己的电脑上执行一次，然后把整个文件夹发给用户：

### 步骤

1. 在 `local-agent/` 目录执行：
   ```
   npm install
   ```
   
2. 从 https://nodejs.org/dist/v20.17.0/node-v20.17.0-win-x64.zip
   下载后解压，把 `node.exe` 复制到 `local-agent/` 目录下

3. 打包整个 `local-agent/` 文件夹为 zip，发给用户

4. Windows 解压后双击 `start-agent.bat`；Mac/Linux 使用 `start-agent.sh`（需本机已安装 Node.js）

### 最终目录结构（约 80MB）
```
local-agent/
├── node.exe          ← 便携版 Node.js（你下载并放进来的）
├── node_modules/     ← npm install 后生成
├── index.js
├── auth.js
├── package.json
├── start-agent.bat
└── start-agent.sh
```

---

## 关于 Chrome

- 用户电脑上只要装了 Chrome，代理会自动找到并使用，无需额外操作
- 如果没有 Chrome，启动代理后 Playwright 会尝试用内置 Chromium
  （首次可执行 `npx playwright install chromium`）
