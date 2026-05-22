# Auyologic 本地授权代理

在本机运行浏览器，完成：

- **账号授权**：小红书等平台扫码 / 登录，把 Cookie 回传给 GEO 后台  
- **投放发布**（可选）：从队列取任务，用 Playwright 在本机发帖  

从网页「下载本地代理」的 zip 已包含发布相关脚本；在仓库里开发时，`run-publish.mjs` 会自动引用上一级 `backend/src/services/playwrightPublisher.js`。

---

## 使用者：怎么启动（推荐）

| 系统 | 操作 |
|------|------|
| **Windows** | 双击 `start-agent.bat` |
| **macOS** | 双击 `start-agent.command`（会打开终端） |
| **Linux** | 在终端执行：`bash start-agent.sh` |

启动脚本会自动完成：

1. 检测本机 Node.js；没有则下载便携版 Node（约 40MB，仅首次，需能访问 nodejs.org）  
2. `npm install`（仅首次或依赖变更时）  
3. **安装 Playwright Chromium**（见下文「浏览器安装」）  
4. 启动代理进程  

启动后按终端提示，在浏览器里完成平台授权即可。

### macOS 首次双击

若提示「无法打开」或「来自未知开发者」：在对应 `.command` 文件上 **右键 → 打开**，确认一次后即可正常双击。  
适用文件：`start-agent.command`、`install-playwright.command`。

---

## 浏览器安装（傻瓜式）

授权 / 发帖需要 Playwright 能启动浏览器。**一般不用单独操作**——`start-agent` 启动时会自动安装。

若启动或授权时报错类似：

```text
Executable doesn't exist at .../ms-playwright/chromium-...
```

请**只安装浏览器**（不启动代理）：

| 系统 | 操作 |
|------|------|
| macOS | 双击 `install-playwright.command` |
| Windows | 双击 `install-playwright.bat` |
| Linux | `bash install-playwright.sh` |

上述脚本等价于在 `local-agent` 目录执行：

```bash
npm install          # 若还没有 node_modules
npx playwright install chromium
```

- 首次下载 Chromium 约 **150MB**，请保持网络畅通  
- 浏览器装在当前目录下的 Playwright 缓存（`PLAYWRIGHT_BROWSERS_PATH=0`），不污染用户全局目录  
- `npm install` 时也会通过 `postinstall` 自动跑一遍浏览器安装  

---

## 浏览器用 Chrome 还是 Chromium？

启动逻辑（`playwrightLaunch.js`）按顺序尝试：

1. **本机已安装的 Google Chrome**（macOS / Windows / Linux 常见路径）  
2. Playwright `channel: 'chrome'`（调用系统 Chrome）  
3. **内置 Chromium**（需先执行上面的浏览器安装）

| 情况 | 建议 |
|------|------|
| 已装 Chrome | 通常可直接授权，无需单独装 Chromium |
| 未装 Chrome 或启动失败 | 双击 `install-playwright.*`，或让 `start-agent` 自动安装 |
| macOS 仍失败 | 先装 [Google Chrome](https://www.google.com/chrome/)，再重试 `install-playwright.command` |

---

## 目录与脚本说明

```
local-agent/
├── index.js                      # 代理主程序
├── auth.js                       # 授权（Playwright 打开登录页）
├── playwrightLaunch.js           # 跨平台启动 Chrome / Chromium
├── run-publish.mjs               # 投放发布入口
├── package.json
├── scripts/
│   └── install-playwright.mjs    # 核心：npm install + playwright install chromium
├── start-agent.bat / .command / .sh    # 一键启动（含自动装浏览器）
├── install-playwright.bat / .command / .sh  # 仅装浏览器
└── README.md                     # 本说明
```

---

## 常见问题

**Q：必须自己安装 Node.js 吗？**  
A：不必。`start-agent` 会在没有 Node 时自动下载便携版；若本机已有 Node，则优先使用系统版本。

**Q：必须手敲 `npx playwright install chromium` 吗？**  
A：不必。双击 `install-playwright.*` 或 `start-agent.*` 即可，脚本内部会执行该命令。

**Q：npm install 很慢或失败？**  
A：需能访问 npm registry；公司网络可配置代理后再重试 `start-agent`。

**Q：代理连不上后台？**  
A：确认启动时传入的后台地址（脚本内默认或参数），与 GEO 页面使用的环境一致（开发 `http://localhost:3003/` / 生产域名）。

---

## 开发者：手动启动

```bash
cd backend/local-agent
npm install                              # 含 postinstall 装 Chromium
node index.js http://localhost:3003/     # 开发
node index.js https://你的生产域名/       # 生产
```

仅重装浏览器：

```bash
npm run playwright:install
# 或
node scripts/install-playwright.mjs
```

---

## 打包发给最终用户

### 方案 A：在线版（体积小，推荐）

zip 内至少包含：

```
local-agent/
├── index.js、auth.js、playwrightLaunch.js、run-publish.mjs
├── package.json、package-lock.json（可选）
├── scripts/install-playwright.mjs
├── start-agent.bat / .command / .sh
└── install-playwright.bat / .command / .sh
```

用户首次双击 `start-agent` 时会联网下载 Node（若无）、npm 依赖和 Chromium。  
要求：能访问 **nodejs.org**、**npm registry**、Playwright 浏览器 CDN。

### 方案 B：离线版（体积大，少联网）

在你自己的电脑上于 `local-agent/` 执行：

```bash
npm install
node scripts/install-playwright.mjs
```

Windows 可额外放入便携 `node.exe`（见 [Node v20.17.0 win-x64](https://nodejs.org/dist/v20.17.0/node-v20.17.0-win-x64.zip)），再整包 zip 发给用户。  
用户解压后双击 `start-agent` 即可，一般无需再跑 `npm install`。

---

## 环境变量（可选）

| 变量 | 说明 |
|------|------|
| `CHROME_PATH` | 指定 Chrome 可执行文件路径，覆盖自动检测 |
| `PLAYWRIGHT_BROWSERS_PATH` | 浏览器缓存目录；脚本默认 `0` 表示装在 `local-agent` 目录内 |
