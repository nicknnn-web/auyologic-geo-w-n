/**
 * 后端 Prompt 统一出口
 * 所有业务 prompt 集中在 backend/src/prompts/ 目录下，按模块拆分文件。
 *
 * 新增 prompt 时：
 * 1. 在本目录新建一个 xxx.js，写好 JSDoc（用途 / 调用方 / 输入输出）
 * 2. 在此 index.js 中 re-export
 * 3. 业务代码改为从 '../prompts/index.js' 导入
 */
export * from './geoHealthProbe.js';
export * from './geoHealthAnalysis.js';
export * from './contentGenerator.js';
