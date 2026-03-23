# GEO管理系统 - 部署指南

## 系统架构

```
前端 (Vue 3) → 后端 (Express.js) → 数据库 (PostgreSQL)
```

---

## 第一步：部署数据库（Sealos）

### 1.1 登录 Sealos
访问 https://cloud.sealos.io ，用微信/手机号登录。

### 1.2 创建 PostgreSQL 数据库
1. 进入「应用管理」→「新建应用」
2. 选择「数据库」→「PostgreSQL」
3. 配置：
   - 数据库名：`auyologic`
   - 用户名：`postgres`
   - 密码：设置一个强密码
4. 点击「部署」，等待完成
5. 复制连接信息（格式：`postgresql://postgres:密码@主机:5432/auyologic`）

---

## 第二步：部署后端（Sealos）

### 2.1 准备后端代码
项目目录 `backend/` 已包含完整后端代码。

### 2.2 创建后端应用
1. 在 Sealos 新建应用
2. 填写信息：
   - 应用名称：`auyologic-backend`
   - 镜像：`node:20-alpine`（Sealos 支持从 Dockerfile 构建）
3. 资源配置：1核512MB 足够
4. 环境变量，添加：
   ```
   DATABASE_URL=postgresql://postgres:你的密码@数据库主机:5432/auyologic
   PORT=3001
   ```
5. 挂载 uploads 目录（用于存储上传的文件）

### 2.3 部署
点击部署，等待容器启动。确认健康检查通过后，复制访问地址（例如：`https://your-app.sealos.run`）。

---

## 第三步：构建前端

### 3.1 修改环境变量
在项目根目录创建 `.env.production`：
```
VITE_API_URL=/api
VITE_API_TARGET=https://你的后端地址
```

### 3.2 构建
```bash
cd "Auyologic geo project"
npm install
npm run build
```

`dist/` 目录即为部署产物。

---

## 第四步：部署前端（Sealos）

### 4.1 静态网站部署
1. Sealos 新建应用 → 选择「静态网站」
2. 上传 `dist/` 目录内容
3. 填写自定义域名（可选）

### 4.2 配置反向代理（重要）
如果前端和后端分开部署，需要配置路由：
- `/api/*` → 转发到后端服务
- 其他 → 静态文件

Sealos 静态网站支持配置重写规则，或使用 Nginx ingress。

---

## 快速启动（本地开发）

### 数据库
确保有 PostgreSQL 实例可用，或使用 Supabase 免费版：
1. 注册 https://supabase.com
2. 创建项目，复制 `Connection String`
3. 填入 `backend/.env`

### 启动后端
```bash
cd backend
npm install
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL
npm start
```

### 启动前端
```bash
cd "Auyologic geo project"
npm install
npm run dev
```

---

## 环境变量汇总

### 后端 (.env)
| 变量名 | 说明 | 示例 |
|--------|------|------|
| DATABASE_URL | PostgreSQL 连接字符串 | `postgresql://postgres:xxx@host:5432/auyologic` |
| PORT | 服务端口 | `3001` |
| DEFAULT_DEEPSEEK_API_KEY | 默认AI密钥（可选） | `sk-xxx` |

### 前端 (.env.production)
| 变量名 | 说明 | 示例 |
|--------|------|------|
| VITE_API_URL | API 前缀 | `/api` |
| VITE_API_TARGET | 后端地址（开发用） | `http://localhost:3001` |

---

## 技术栈

- **前端**：Vue 3 + Vite + Element Plus + Tailwind CSS + ECharts
- **后端**：Express.js + Node.js 20
- **数据库**：PostgreSQL
- **AI**：DeepSeek API（密钥配置在后端，保护安全）
- **部署**：Sealos
