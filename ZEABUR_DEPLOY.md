# Zeabur 部署指南

## 第一步：推送代码到 GitHub

```powershell
cd "D:\workbuddy\projects\Auyologic geo project"
git add backend/src/index.js backend/src/routes/ backend/zeabur.json zeabur.json zeabur.toml zeabur-deploy.json
git commit -m "feat: 修复数据持久化 + Zeabur配置"
git push origin main
```

## 第二步：在 Zeabur 部署

### 1. 访问 Zeabur
打开 https://zeabur.com 并登录（支持 GitHub 登录）

### 2. 创建项目
- 点击 "New Project" → "Deploy from GitHub"
- 选择 `nicknnn-web/auyologic-geo-w` 仓库

### 3. 添加数据库
- 点击 "Add Service" → "Marketplace"
- 选择 "PostgreSQL" 并添加
- 等待数据库创建完成

### 4. 部署后端
- Zeabur 应该会自动检测 backend 目录为 Node.js 服务
- 在后端服务的 Environment 中添加：
  - `DEEPSEEK_API_KEY` = 你的 DeepSeek API Key
- 连接 PostgreSQL：点击后端服务 → "Variables" → 找到 DATABASE_URL（如果没自动连接，手动添加并引用数据库）

### 5. 部署前端
- 添加新服务，指定 frontend 目录
- 构建命令：`npm install && npm run build`
- 输出目录：`dist`
- 环境变量：
  - `VITE_API_URL` = https://你的后端域名/api
- 添加依赖：frontend 依赖后端服务

### 6. 配置域名
- 前端服务点击 "Domains" → 添加自定义域名（可选）
- 后端服务也需要配置域名（Zeabur 会自动生成）

## 第三步：更新前端 API 地址

部署完成后，记下后端的域名，修改前端的 `VITE_API_URL` 环境变量。

## Zeabur 优势

✅ 免费额度充足（每月 $5 免费额度）
✅ 自动配置 HTTPS
✅ 自动配置数据库连接
✅ 支持自动部署（代码推送后自动更新）
✅ 支持多服务部署
✅ 稳定性和速度都比 Sealos 好

## 注意事项

- PostgreSQL 数据库免费额度有限，注意用量
- 后端需要设置 `DEEPSEEK_API_KEY` 才能正常使用 AI 功能
- 首次部署可能需要等待几分钟
