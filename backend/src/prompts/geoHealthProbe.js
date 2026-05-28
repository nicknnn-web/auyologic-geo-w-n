/**
 * [GEO 体检 - 探针阶段 Prompt]
 *
 * 两步流程：
 * 1. 直问：仅将题库原题作为 user 消息发给大模型，得到 raw_answer（模拟真实用户提问）。
 * 2. 抽取：将 raw_answer 交给模型结构化为 JSON（mentioned_entities 等），不改变原文含义。
 *
 * 调用方：backend/src/services/geoBrandTaskService.js → probeOneQuestionWithModel
 */

/** @deprecated 旧版一步合一的 system，保留导出避免外部引用报错 */
export const PROBE_SYSTEM_PROMPT = `你是一个严格按 JSON 输出的助手。`;

/** 第 2 步：从探针原文抽取结构化信息 */
export const PROBE_EXTRACT_SYSTEM_PROMPT = `你是一个信息抽取助手。用户会提供一段 AI 对某个问题的完整回答原文。
你必须只输出一个 JSON 对象，包含键 "answer"（字符串，必须与原文一致，不要改写或缩写）与 "mentioned_entities"（数组）。
mentioned_entities 每项为对象，字段 name（字符串）、type（字符串，如 product）、position（数字，从 1 起）。
不要输出 sources、articles 或任何信源链接字段。
不要输出 markdown 代码围栏以外的多余说明文字。`;

/**
 * 第 1 步：直问 —— 仅返回原题（不做包装）
 * @param {string} questionText
 */
export function buildProbeDirectUserPrompt(questionText) {
  return String(questionText ?? '').trim() || 'hi';
}

/**
 * 第 2 步：抽取 —— 基于 AI 原文生成 JSON
 * @param {string} typeLine
 * @param {string} rawAnswer
 */
export function buildProbeExtractUserPrompt(typeLine, rawAnswer) {
  const answer = String(rawAnswer ?? '').trim();
  return [
    `问题类型（keyword_type）：${typeLine}`,
    '',
    '以下为探针阶段得到的 AI 回答原文（请原样放入 JSON 的 answer 字段，不要修改措辞）：',
    '---',
    answer,
    '---',
    '',
    '请从上述原文中提取 mentioned_entities：',
    '1. 只提取明确的品牌或公司名称（如 OpenAI、阿里云、腾讯），按首次出现顺序编号 position（从 1 起）',
    '2. 不要提取功能、技术、泛化类别',
    '3. 不要推测或补充原文未提及的名称',
    '4. 若未提及任何品牌/公司，mentioned_entities 返回空数组',
    '5. answer 字段必须与「---」之间的原文完全一致',
    '6. 只输出 JSON，格式示例：',
    '{',
    '  "answer": "（与原文一致）",',
    '  "mentioned_entities": [{ "name": "品牌名", "type": "product", "position": 1 }]',
    '}',
  ].join('\n');
}

/** @deprecated 旧版一步合一 user prompt，已由直问 + 抽取两步替代 */
export function buildProbeUserPrompt(typeLine, questionText) {
  return buildProbeDirectUserPrompt(questionText);
}
