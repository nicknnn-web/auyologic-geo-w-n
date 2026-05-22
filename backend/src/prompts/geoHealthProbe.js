/**
 * [GEO 体检 - 探针阶段 Prompt]
 *
 * 用途：模拟「真实用户 → AI」提问，输出自然回答与提及实体。
 * 信源 URL 由任务后台博查检索 + 分析模型分类写入，探针不再输出 sources。
 * 调用方：backend/src/services/geoBrandTaskService.js → probeOneQuestionWithModel
 * 输出 JSON：
 *   { answer: string, mentioned_entities: [{ name, type, position }] }
 */

/** 系统提示词：约束输出 JSON 格式 */
export const PROBE_SYSTEM_PROMPT = `你是一个严格按 JSON 输出的助手。用户会给出一条需要分析的问题。
你必须只输出一个 JSON 对象，包含键 "answer"（字符串）与 "mentioned_entities"（数组）。
mentioned_entities 每项为对象，字段 name（字符串）、type（字符串，如 product）、position（数字，从 1 起）。
不要输出 sources、articles 或任何信源链接字段。
不要输出 markdown 代码围栏以外的多余说明文字。`;

/**
 * 构建探针阶段的 user prompt
 * @param {string} typeLine       问题类型标签（包含中文名 + keyword_type）
 * @param {string} questionText   原始问题文本
 */
export function buildProbeUserPrompt(typeLine, questionText) {
  return [
    `问题类型（keyword_type，与 sys_dict.data_key 一致）：${typeLine}`,
    '',
    '用户问题：',
    questionText,
    '',
    '请先像一个通用大模型（如 ChatGPT / DeepSeek）一样，给出完整、自然的回答。',
    '回答应尽量贴近真实 AI 风格，可以包含对比、推荐或举例。',
    '',
    '然后，对你的回答进行结构化提取，并输出 JSON。',
    '',
    '要求：',
    '1. answer 为完整自然语言回答（保持原始风格）',
    '2. 如果回答中提到了具体产品 / 品牌 / 工具，请按「首次出现顺序」提取，只提取明确的品牌或公司名称，例如：OpenAI、阿里云、腾讯、Notion 等。\n' +
    '不要提取以下内容：\n' +
    '- 功能或技术（如：OCR、搜索引擎、AI模型）\n' +
    '- 泛化产品类别（如：电商平台、管理系统）\n' +
    '- 不明确归属的通用名称',
    '3. position 表示在回答中的出现顺序（第一个提到=1）',
    '4. 只提取明确提及的名称，不要推测或补充',
    '5. 如果没有提及任何产品，mentioned_entities 返回空数组',
    '6. 不要输出信源、链接、sources、articles',
    '7. 最终只输出 JSON',
    '',
    '输出格式：',
    '{',
    '  "answer": "完整回答内容",',
    '  "mentioned_entities": [',
    '    { "name": "产品或品牌名", "type": "product", "position": 1 }',
    '  ]',
    '}',
  ].join('\n');
}
