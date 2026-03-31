# 如何制作免安装版（给用户直接用）

## 方案 A：在线版（推荐，最小体积 ~1MB）

只发给用户以下 4 个文件：
```
local-agent/
├── index.js
├── auth.js
├── package.json
└── 启动代理.bat
```

用户双击 `启动代理.bat`，bat 会自动：
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

4. 用户解压后双击 `启动代理.bat` 即可，**无需任何安装**

### 最终目录结构（约 80MB）
```
local-agent/
├── node.exe          ← 便携版 Node.js（你下载并放进来的）
├── node_modules/     ← npm install 后生成
├── index.js
├── auth.js
├── package.json
└── 启动代理.bat
```

---

## 关于 Chrome

- 用户电脑上只要装了 Chrome，代理会自动找到并使用，无需额外操作
- 如果没有 Chrome，bat 启动代理后 Playwright 会尝试用内置 Chromium
  （首次会提示执行 `npx playwright install`）
