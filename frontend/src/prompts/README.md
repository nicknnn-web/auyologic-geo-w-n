# 前端 Prompt 目录

所有前端向 `/api/ai/generate` 等 AI 代理接口发送的 prompt 统一放在本目录。

## 现有 prompt 清单

| 文件 | 导出 | 业务模块 | 下游使用 |
|------|------|-----------|----------|
| `geoQuestionGenerate.js` | `buildGeoQuestionPrompt({ brand, product, targetCustomer })` | 拓展问题 - **GEO 50 题生成** | `views/Questions.vue` |
| `keywordExtract.js` | `buildBusinessTermsPrompt({ name, industry, description })`<br>`buildCoreKeywordsPrompt({ name, industry, description })` | 业务/核心关键词提取 | `views/Questions.vue`（业务专业词）<br>`views/EnterpriseSettings.vue`（10-15 个核心关键词） |
| `geoDetection.js` | `GEO_DETECTION_SYSTEM_PROMPT`<br>`buildGeoDetectionPrompt({ question, keyword, platformId })` | GEO 检测 - 品牌可见度分析 | `views/GEODetection.vue` |
| `geoReport.js` | `GEO_REPORT_SYSTEM_PROMPT`<br>`buildGeoReportPrompt(detectionData)` | GEO 改进方案报告 | `views/GEOReport.vue` |
| `websiteAnalyzer.js` | `PORTAL_SEO_SYSTEM_PROMPT` / `ARTICLE_SEO_SYSTEM_PROMPT`<br>`PORTAL_SCORING_RULES` / `ARTICLE_SCORING_RULES`<br>`getAIFriendlinessPromptSet(pageType)`<br>`buildAIFriendlinessPrompt({ scoringRules, url, truncatedText })` | 网站优化 - AI 亲和性分析 | `utils/websiteAnalyzer.js` |
| `knowledgeAnalyze.js` | `buildKnowledgeAnalyzePrompt(content)` | 知识库 - 文档分析 | `views/Knowledge.vue` |

## 新增 prompt 流程

1. 在本目录新建 `xxx.js`（小驼峰命名对应模块）。
2. 顶部写 JSDoc：**用途 / 调用方 / 输入字段 / 输出 JSON 结构**。
3. 导出常量（`XXX_SYSTEM_PROMPT`）或函数（`buildXxxPrompt(...)`）。
4. 在 `index.js` 中 `export * from './xxx.js'`。
5. 业务代码改成 `import { XXX } from '../prompts/index.js'`。
