# GEO管理系统 - 部署指南

## 系统架构

```
前端 (Vue 3) → 后端 (Express.js) → 数据库 (PostgreSQL)
```

---

## 部署平台

本项目部署于 **Zeabur**，使用 GitHub 自动化部署。

> ⚠️ 以下内容已废弃，仅供参考：
> - Sealos 部署方案（已迁移至 Zeabur）
> - 旧版 HANDOVER.md（路径和架构已过时）

---

## 技术栈

- **前端**：Vue 3 + Vite + Element Plus + Tailwind CSS + ECharts
- **后端**：Express.js + Node.js
- **数据库**：PostgreSQL
- **AI**：DeepSeek API（密钥配置在后端，保护安全）
- **部署**：Zeabur（GitHub: nicknnn-web/auyologic-geo-w）

---

## 本地开发

### 前置

确保已安装 Node.js 和 PostgreSQL。

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
cd frontend
npm install
npm run dev
```

---

## 环境变量

### 后端 (.env)

| 变量名 | 说明 | 示例 |
|--------|------|------|
| DATABASE_URL | PostgreSQL 连接字符串 | `postgresql://postgres:xxx@host:5432/auyologic` |
| PORT | 服务端口 | `3001` |
| DEEPSEEK_API_KEY | DeepSeek API Key | `sk-xxx` |
| BOCHA_API_KEY | 品牌体检信源：博查 Web Search（必填方可跑信源阶段） | 见 [博查开放平台](https://open.bocha.cn) |

探针只生成回答与实体；每题由博查检索网页 URL，再由任务上的 `analysis_connection_id` 模型做四分类后写入 `geo_health_article`。

### 前端 (.env.production) |

| 变量名 | 说明 | 示例 |
|--------|------|------|
| VITE_API_URL | API 前缀 | `/api` |
| VITE_API_TARGET | 后端地址（开发用） | `http://localhost:3001` |

---

## 相关文档

- `ZEABUR_DEPLOY.md` — Zeabur 部署详细步骤
- `docs/MIGRATION_ZEABUR_TO_SELFHOSTED.md` — Zeabur 迁往自建服务器（含 Jenkins）流程与官方版本核验方式
- `HANDOVER.md` — 项目交接文档（内容已过时，仅供参考）
