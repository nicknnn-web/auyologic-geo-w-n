# Auyologic 本地授权代理 · 使用手册

本地代理在本机打开浏览器，帮你在 **小红书** 等平台完成登录，并把登录状态同步到 GEO 后台。  
**使用期间请保持代理窗口不要关闭。**

---

## 使用前准备

1. 在 GEO 网页点击 **「下载本地代理」**，解压得到 `local-agent` 文件夹。  
2. 电脑能正常上网（首次启动会自动下载组件，合计约 **200MB**，需几分钟）。  
3. **不必**事先安装 Node.js；脚本会自动处理。  
4. 建议本机已安装 [Google Chrome](https://www.google.com/chrome/)（没有也能用，脚本会尝试安装内置浏览器）。

---

## Windows 用户 · 初次使用

### 第一步：解压

将 zip 解压到任意目录，例如：

`D:\Auyologic\local-agent\`

### 第二步：启动代理

进入文件夹，**双击** `start-agent.bat`。

首次启动会自动：

- 下载 Node（若本机没有，约 30MB）  
- 安装依赖（`npm install`）  
- 安装 Playwright 浏览器（约 150MB）  

请耐心等待，不要关闭黑色命令行窗口。

### 第三步：选择环境

窗口里出现：

```text
[Y] 开发环境 (localhost)
[N] 生产环境 (线上)
```

- 连 **本机开发**：按 **Y**  
- 连 **线上 GEO**：按 **N**  

### 第四步：在网页里发起授权

1. 保持 `start-agent.bat` 窗口 **一直开着**（显示「代理已启动」）。  
2. 打开 GEO 网站，进入需要授权的小红书账号页面。  
3. 点击 **「本地授权」**（或同类按钮）。  
4. 本机会自动弹出浏览器 → 在窗口里 **扫码或登录**。  
5. 登录成功后，按网页或终端提示确认；终端出现 **「授权成功」** 即可。

### 若提示浏览器找不到

双击同目录下的 `install-playwright.bat`，装完后再双击 `start-agent.bat`。

---

## Mac 用户 · 初次使用

### 第一步：解压

将 zip 解压，例如放到：

`~/Downloads/local-agent/`

### 第二步：允许首次打开（仅第一次）

若双击 `start-agent.command` 时系统提示 **「无法打开」** 或 **「来自未知开发者」**：

1. 在 `start-agent.command` 上 **右键**  
2. 选 **「打开」**  
3. 在弹窗里再点 **「打开」**  

确认一次后，以后可直接双击。  
（`install-playwright.command` 若同样报错，也用右键打开一次。）

### 第三步：启动代理

**双击** `start-agent.command`，终端会自动打开。

首次启动会自动安装 Node（若无）、依赖和浏览器，需几分钟，**不要关终端**。

### 第四步：选择环境

终端里出现：

```text
[1] 开发环境 (http://localhost:3003/)
[2] 生产环境 (https://auyologic-geo-w.zeabur.app/)
```

输入 **1** 或 **2**（直接回车默认为 **1** 开发环境）。

### 第五步：在网页里发起授权

1. **不要关闭** 终端窗口（应显示「代理已启动」）。  
2. 打开 GEO 网站，进入小红书账号授权页。  
3. 点击 **「本地授权」**。  
4. 本机会弹出浏览器 → **扫码或登录**。  
5. 成功后终端显示 **「授权成功」**。

### 若提示浏览器找不到

先 **双击** `install-playwright.command` 安装浏览器，再 **双击** `start-agent.command` 重新启动。  
仍失败时，请先安装 [Google Chrome](https://www.google.com/chrome/) 后重试。

---

## 日常使用（第二次及以后）

| 系统 | 操作 |
|------|------|
| Windows | 双击 `start-agent.bat` → 选环境 → 网页里点「本地授权」 |
| Mac | 双击 `start-agent.command` → 选环境 → 网页里点「本地授权」 |

一般 **不用再装** 依赖和浏览器；只有换电脑或删了文件夹才需要重新走一遍首次流程。

---

## 常见问题

| 现象 | 处理 |
|------|------|
| 下载很慢 / 安装失败 | 检查网络；公司网络可能需要代理；关掉后重新双击启动脚本 |
| `Executable doesn't exist` | Windows：`install-playwright.bat`；Mac：`install-playwright.command` |
| 网页点授权没反应 | 确认代理窗口仍开着，且选的环境与网页一致（开发 / 线上） |
| Mac 双击没反应 | 用 **右键 → 打开** 运行 `start-agent.command` |
| 想换开发 / 线上环境 | 关掉代理窗口，重新双击启动脚本，重新选择 |

---

## 文件说明（知道这些即可）

| 文件 | 用途 |
|------|------|
| `start-agent.bat` | Windows：启动代理（推荐） |
| `start-agent.command` | Mac：启动代理（推荐） |
| `install-playwright.bat` | Windows：仅安装浏览器 |
| `install-playwright.command` | Mac：仅安装浏览器 |

**不需要**自己输入 `npx playwright install chromium`，双击上面的安装/启动脚本即可。
