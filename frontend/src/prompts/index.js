/**
 * 前端 Prompt 统一出口
 * 所有业务 prompt 集中在 frontend/src/prompts/ 目录下，按模块拆分文件。
 *
 * 新增 prompt 时：
 * 1. 在本目录新建 xxx.js，写好 JSDoc（用途 / 调用方 / 输入输出）
 * 2. 在此 index.js 中 re-export
 * 3. 业务代码改为从 '@/prompts' 或相对路径导入
 */
export * from './geoQuestionGenerate.js'
export * from './keywordExtract.js'
export * from './geoDetection.js'
export * from './geoReport.js'
export * from './websiteAnalyzer.js'
export * from './knowledgeAnalyze.js'
