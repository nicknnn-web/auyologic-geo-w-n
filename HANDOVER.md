# 项目交接文档 — Auyologic GEO 管理系统

> 更新时间：2026-03-26
> 适用对象：接手的同事或 AI Agent

---

## 一、项目概况

这是一个 **GEO（Generative Engine Optimization，生成式引擎优化）内容管理系统**，帮助企业管理关键词、生成 AI 软文、分析 GEO 覆盖情况。

### 技术栈
| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + Element Plus + TipTap 富文本编辑器 + ECharts |
| 后端 | Express.js + Node.js 20 |
| 数据库 | PostgreSQL |
| AI | DeepSeek API（密钥配置在后端） |
| 部署 | Sealos（腾讯云容器平台） |
| 镜像 | Docker Hub（nicknnndocker/auyologic-geo-frontend:latest） |

---

## 二、线上地址

| 服务 | 地址 |
|---|---|
| 前端 | https://swzdkjdlkhyy.sealoshzh.site |
| 后端 API | https://fokgoxfxgyjq.sealoshzh.site |
| 后端健康检查 | https://fokgoxfxgyjq.sealoshzh.site/health |

---

## 三、本地代码位置

```
D:\workbuddy\Auyologic geo project\
├── src\                    # 前端 Vue 源码
│   ├── views\              # 页面组件（ContentCreate.vue, Drafts.vue, Keywords.vue 等）
│   ├── utils\              # 工具函数（api.js）
│   └── router\             # 路由配置
├── backend\src\            # 后端 Express 源码
│   ├── index.js            # 主入口，所有 API 路由
│   └── services\
│       └── contentGenerator.js   # AI 内容生成核心逻辑
├── dist\                   # 前端构建产物（npm run build 后生成）
├── Dockerfile.frontend     # 前端 Docker 构建文件
├── nginx.conf              # Nginx 反向代理配置
├── package.json            # 前端依赖
└── README.md               # 部署说明
```

---

## 四、部署流程（每次改完代码后）

> ⚠️ 前提：Docker Desktop 需先手动启动（任务栏里确认 Engine running）

```powershell
# 1. 进入项目目录
cd "D:\workbuddy\Auyologic geo project"

# 2. 构建前端
npm run build

# 3. 构建 Docker 镜像
& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" build -t nicknnndocker/auyologic-geo-frontend:latest -f Dockerfile.frontend .

# 4. 推送到 Docker Hub
& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" push nicknnndocker/auyologic-geo-frontend:latest

# 5. 在 Sealos 控制台手动重启前端应用（需要人工操作）
#    地址：https://cloud.sealos.io
```

**注意**：后端目前无需手动部署，代码在 Sealos 容器内直接运行，如需修改后端需要另行配置后端 CI/CD。

### Docker Hub 登录（Token 方式）
```powershell
& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" login -u nicknnndocker --password dckr_pat_bLO8rVpqspxlnHVDZzjuw4M_HrY
```

---

## 五、已完成的功能模块

### 核心功能
- ✅ 前端 + 后端 + PostgreSQL 全部部署到 Sealos
- ✅ 内容创作页面：**4步向导式工作流**（选择类型 → 选择关键词 → 关联资源 → 生成内容）
- ✅ 6种内容类型模板：评测 / 新闻 / 营销 / 教程 / 案例 / 问答
- ✅ 风格参数控制：语气（专业/亲和/活泼）、长度（短/中/长）、格式（纯文本/小标题/项目符号）
- ✅ AI 生成内容自动 Markdown → HTML 转换后注入富文本编辑器
- ✅ TipTap 富文本编辑器（支持格式化、图片 URL 插入）
- ✅ 草稿箱：内嵌编辑弹窗，无需跳转
- ✅ 一键排版功能（marked.js 解析 Markdown 转富文本）
- ✅ 关键词多选 + 类型筛选（品牌词/品类词/竞品词/场景词）
- ✅ 关键词颜色体系统一（品牌紫/品类绿/竞品蓝/场景橙）
- ✅ GEO Detection 页面（AI 覆盖率分析）
- ✅ 企业设置：行业关键词生成

### UI 设计规范
- 内容创作页面：蓝色主题 `#409eff`
- 按钮：品牌紫色渐变
- 圆角卡片 + 步骤进度条，参考 GEO Detection 页面风格

---

## 六、待开发功能（优先级排序）

| 优先级 | 功能 | 说明 |
|---|---|---|
| P1 | 草稿箱版本历史 | 记录每次修改，支持回退 |
| P1 | 图片上传 API | 目前图片用 localStorage，需要后端存储 |
| P2 | 用户登录注册系统 | 目前所有人共用同一个 default_user |
| P2 | 对接发稿平台 | 微信公众号、知乎等一键发布 |
| P3 | 文章质量评分优化 | 目前 originality/geoScore 是硬编码的假数据 |

---

## 七、重要技术细节（踩坑记录）

### 1. marked.js 配置（v17）
```js
// ✅ 正确写法
marked.use({ gfm: true, breaks: true })

// ❌ 错误写法（v17 不支持）
marked.setOptions({ ... })
```

### 2. 一键排版 — 预处理规则
Markdown 要求标题/段落/列表之间有**空行**，否则 marked 会把内容当成标题：
```js
text
  .replace(/\n(#{1,6}[^\n#])/g, '\n\n$1')  // 标题前加空行
  .replace(/^#{1,6}([^\s#])/gm, '$& ')      // # 后加空格
  .replace(/\n([-][^\n]+)/g, '\n\n$1')       // 列表前加空行
  .replace(/\n{3,}/g, '\n\n')               // 压缩多余空行
```

### 3. DOMPurify 必须在 dependencies（不能在 devDependencies）
生产构建需要 DOMPurify，放在 devDependencies 会导致生产环境报错。

### 4. Sealos 控制台无法自动化
Sealos 控制台是 iframe 嵌套页面，存在跨域限制，浏览器自动化工具无法操作，重启操作必须人工登录控制台完成。

### 5. 后端 API 主要路由（backend/src/index.js）
| 路由 | 说明 |
|---|---|
| `POST /api/ai/generate` | AI 生成内容（接收 contentType/tone/length/format/keywords 等参数） |
| `GET /api/keywords` | 获取关键词列表 |
| `POST /api/keywords` | 新增关键词 |
| `GET /api/drafts` | 获取草稿列表 |
| `POST /api/drafts` | 保存草稿 |
| `PUT /api/drafts/:id` | 更新草稿 |
| `GET /api/settings` | 获取企业设置（含 DeepSeek API Key） |
| `PUT /api/settings` | 更新企业设置 |

---

## 八、接手后第一步建议

1. **熟悉线上页面**：打开 https://swzdkjdlkhyy.sealoshzh.site 浏览各个功能模块
2. **本地跑起来**：
   ```powershell
   cd "D:\workbuddy\Auyologic geo project"
   npm install
   npm run dev    # 前端开发模式，访问 http://localhost:5173
   ```
3. **看源码结构**：重点关注 `src/views/ContentCreate.vue`（最核心的页面）和 `backend/src/index.js`
4. **配置 API Key**：进入线上「企业设置」页面，确认 DeepSeek API Key 已配置，否则 AI 生成功能无法使用

---

## 九、联系方式 & 账号信息

| 账号 | 信息 |
|---|---|
| Docker Hub | 用户名：nicknnndocker |
| Docker Hub Token | `dckr_pat_bLO8rVpqspxlnHVDZzjuw4M_HrY` |
| Sealos 控制台 | https://cloud.sealos.io（手机号/微信登录） |

---

> 如有疑问，可以直接阅读 `MEMORY.md`（AI Agent 的项目记忆文件），里面有更详细的历史决策记录。
