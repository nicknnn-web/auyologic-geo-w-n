# 后端 Prompt 目录

所有后端向大模型发送的 prompt 统一放在本目录，按业务模块拆分文件。

## 现有 prompt 清单

| 文件 | 导出 | 业务模块 | 下游使用 |
|------|------|-----------|----------|
| `geoHealthProbe.js` | `PROBE_SYSTEM_PROMPT`、`buildProbeUserPrompt(typeLine, questionText)` | GEO 品牌体检 - **探针阶段**（真实用户向 AI 提问） | `services/geoBrandTaskService.js → probeOneQuestionWithModel` |
| `geoHealthAnalysis.js` | `ANALYSIS_SYSTEM_PROMPT`、`buildAnalysisPrompt({ brand, question, answer, category })` | GEO 品牌体检 - **答案分析阶段**（多维打标签，矩阵规则的智能判定源） | `services/geoBrandAnalysisService.js → analyzeOneAnswer`<br>下游：`routes/geoHealthReport.js` 的 `computeOpenCell/computeBrandCell/computeCompareCell` 依赖此 prompt 输出的字段 |
| `contentGenerator.js` | `buildContentGeneratorSystemPrompt({ toneDesc, lengthReq, formatReq })` | AI 文章创作 | `services/contentGenerator.js` |

## 新增 prompt 流程

1. 在本目录新建 `xxx.js`（单数/小驼峰命名对应模块）。
2. 顶部写 JSDoc：**用途 / 调用方 / 输入字段 / 输出 JSON 结构**（必要时附矩阵/前端规则文档链接）。
3. 导出常量（`XXX_SYSTEM_PROMPT`）或函数（`buildXxxPrompt(...)`）。
4. 在 `index.js` 中 `export * from './xxx.js'`。
5. 业务代码改成从 `../prompts/index.js` 或 `../prompts/xxx.js` 导入。
