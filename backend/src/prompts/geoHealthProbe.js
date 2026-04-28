/**
 * [GEO 体检 - 探针阶段 Prompt]
 *
 * 用途：模拟"真实用户 → AI"提问场景，对每道抽样题让大模型给出自然回答
 *       并按结构化 JSON 返回答案、提及实体、来源等。
 * 调用方：backend/src/services/geoBrandTaskService.js → probeOneQuestionWithModel
 * 输出 JSON：
 *   {
 *     answer: string,
 *     sources: Array<{ title, url, platform, publish_time, summary, category }>,
 *     mentioned_entities: [{ name, type, position }]
 *   }
 */

/** 每条信源的 category 枚举（与库表 geo_health_article.source_category 一致） */
export const PROBE_SOURCE_CATEGORY_ENUM = `authority_media（权威/综合新闻等媒体）、industry_vertical（行业与垂直媒体）、official_media（品牌官网与官方自媒体）、ugc_community（UGC 与社区平台）`;

/** 系统提示词：约束输出 JSON 格式 */
export const PROBE_SYSTEM_PROMPT = `你是一个严格按 JSON 输出的助手。用户会给出一条需要分析的问题。
你必须只输出一个 JSON 对象，且包含键 "sources"：数组；每项为对象，字段 title、url、platform、publish_time、summary（均为字符串），以及 category（字符串，取值见用户说明中的四类枚举英文键）。
兼容旧格式：若仍使用键 "articles"，则每项同样须含上述字段与 category。
不要输出 markdown 代码围栏以外的多余说明文字。url 尽量为真实可访问的 http/https 链接；若无法提供可省略该字段或留空字符串。
若你具备检索能力，应优先联网检索公开信息后再整理结论与信源；若不具备，不得编造链接。`;

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
    '尽量联网去搜索公开信息后再组织回答与信源（若当前环境无法真正联网，则勿虚构 URL，sources 可留空）。',
    '回答应尽量贴近真实 AI 风格，可以包含对比、推荐或举例。',
    '',
    '然后，对你的回答进行结构化提取，并输出 JSON。',
    '',
    '要求：',
    '1. answer 为完整自然语言回答（保持原始风格）',
    '2. 如果回答中提到了具体产品 / 品牌 / 工具，请按“首次出现顺序”提取 只提取明确的品牌或公司名称，例如：OpenAI、阿里云、腾讯、Notion 等。\n' +
    '不要提取以下内容：\n' +
    '- 功能或技术（如：OCR、搜索引擎、AI模型）\n' +
    '- 泛化产品类别（如：电商平台、管理系统）\n' +
    '- 不明确归属的通用名称 ',
    '3. position 表示在回答中的出现顺序（第一个提到=1）',
    '4. 只提取明确提及的名称，不要推测或补充',
    '5. 如果没有提及任何产品，mentioned_entities 返回空数组',

    '6. 如果回答参考了外部信息，请提取 sources：每项含真实可核验的 url（无则留空），并为该项标注 category',
    `   category 只能为以下四类英文键之一：${PROBE_SOURCE_CATEGORY_ENUM}。`,
    '   请结合站点性质判断：新闻门户/主流媒体倾向 authority_media；36氪/虎嗅/IT之家等行业资讯倾向 industry_vertical；',
    '   品牌官网、官方公众号文章倾向 official_media；知乎/B站/小红书/贴吧等倾向 ugc_community。',
    '7. 不要编造来源',
    '8. 最终只输出 JSON',
    '',
    '输出格式：',
    '{',
    '  "answer": "完整回答内容",',
    '  "sources": [',
    '    { "title": "", "url": "", "platform": "", "publish_time": "", "summary": "", "category": "authority_media" }',
    '  ],',
    '  "mentioned_entities": [',
    '    { "name": "产品或品牌名", "type": "product", "position": 1 }',
    '  ]',
    '}'
  ].join('\n');
}
