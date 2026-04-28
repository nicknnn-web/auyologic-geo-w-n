/**
 * [GEO 体检 - 答案分析 Prompt] 【矩阵规则的智能判定源】
 *
 * 用途：读取 geo_health_answer 后，让大模型对单条回答做多维打分：
 *       visibility / position / brand_status / compare_status /
 *       brandMentioned / brandRank / topBrand / competitorsMentioned /
 *       hasNegative / sourceType / sentimentKeywords
 * 调用方：backend/src/services/geoBrandAnalysisService.js → analyzeOneAnswer
 *
 * 下游使用：
 * - backend/src/routes/geoHealthReport.js 的
 *   computeOpenCell / computeBrandCell / computeCompareCell 基于此处字段计算矩阵标签
 *
 * 矩阵规则对应文档：4.1 开放式 / 4.3 品牌词 / 4.4 对比词
 */

/** 系统提示词：角色与输出约束 */
export const ANALYSIS_SYSTEM_PROMPT = `你是品牌AI可见度多维分析引擎。
严格按照用户要求的 JSON 格式输出，不输出任何解释、注释或 markdown 代码块。`;

/**
 * 构建合并分析 prompt（单次调用完成全部维度）。
 *
 * @param {object} params
 * @param {string} params.brand         企业/品牌名称
 * @param {string} params.question      用户问题
 * @param {string} params.answer        AI 回答全文
 * @param {'brand'|'compare'|'open'} params.category  问题意图类型
 * @param {{ positive?: string[]; neutral?: string[]; negative?: string[] }} [params.sentimentLexicon] 情感词三档（库表注入）
 */
export function buildAnalysisPrompt({ brand, question, answer, category, sentimentLexicon }) {
  const lex = sentimentLexicon || {};
  const pos = Array.isArray(lex.positive) ? lex.positive.filter(Boolean) : [];
  const neu = Array.isArray(lex.neutral) ? lex.neutral.filter(Boolean) : [];
  const neg = Array.isArray(lex.negative) ? lex.negative.filter(Boolean) : [];
  const quoteJoin = (arr) => arr.map((x) => `「${String(x).replace(/「|」/g, '')}」`).join('、');
  const lexiconBlock =
    pos.length + neu.length + neg.length === 0
      ? ''
      : `
【语义情绪词表】（运营在「情感词管理」中配置；用于统一 hasNegative、sentimentKeywords、position(T3) 等与情绪相关的判定；语义相近或同义表达也应考虑）
- 正面优势（整体语义偏积极时可参考，但不单凭此类词否定负面）：${pos.length ? quoteJoin(pos) : '（暂无）'}
- 中性描述（客观描述向，不单独作为正面或负面依据）：${neu.length ? quoteJoin(neu) : '（暂无）'}
- 负面警示（出现或语境接近时，hasNegative 应为 true，且 sentimentKeywords 应优先覆盖相关词或其同义说法）：${neg.length ? quoteJoin(neg) : '（暂无）'}
`;

  return `【品牌分析任务】

输入：
- brand（目标品牌）: ${brand}
- category（问题意图）: ${category}
- question: ${question}
- answer: ${answer}
${lexiconBlock}
请对上述 AI 回答做以下多维判定，并严格只输出 JSON：

字段说明：
1. visibility
   - "visible"：品牌被提及且无明显负面
   - "not_visible"：品牌未提及，或仅以负面方式出现

2. position（品牌推荐位置）
   - "T0"：品牌为首位推荐
   - "T1"：品牌被推荐但不是第一
   - "T2"：完全未提及品牌
   - "T3"：出现负面信息

3. brand_status（品牌词质量，仅 category=brand 时有意义，否则填 "not_applicable"）
   - "accurate"：信息准确，内容主要围绕品牌
   - "bias"：有品牌信息但存在错误/陈旧/偏差
   - "missing"：没提品牌
   - "hijack"：推荐竞品或竞品内容占比更高
   - "risk"：出现负面内容

4. compare_status（对比倾向，仅 category=compare 时有意义，否则填 "not_applicable"）
   - "win"：明确推荐目标品牌
   - "neutral"：客观对比，无明显倾向
   - "lose"：明确推荐竞品
   - "hijack"：明显偏向竞品且占比高
   - "risk"：出现负面

5. brandMentioned：回答中是否出现品牌名（true/false）

6. brandRank：品牌在推荐列表中的顺序（从1开始的整数；若未提及填 null）

7. topBrand：回答中首位推荐的品牌名（string；若无推荐填 null）

8. competitorsMentioned：回答中出现的竞品名列表（string[]；若无填 []）

9. hasNegative：回答是否包含对目标品牌的负面描述（差评、风险、投诉等）（true/false）
    若上文提供了「语义情绪词表」，须与词表中负面警示、正面优势的语义关系结合判断，不得忽略词表口径。

10. sourceType：回答引用的主要信源类型
    根据回答中出现的平台名/域名/机构名动态判断，如："官网"、"媒体"、"知乎"、"小红书"、
    "百科"、"论坛"、"微博"、"抖音"、"GitHub"等。
    若回答未引用任何外部信源，填"无"。

11. sentimentKeywords：可选精炼摘要，0-8 个短词，概括回答中与品牌情绪相关的焦点（string[]；报告词云以服务端对回答正文的分词统计为准，本字段供矩阵与其它判定参考）
    若上文提供了「语义情绪词表」，可优先纳入与回答语义相关的词表词或其同义表达。

输出（严格 JSON，不含任何其他内容）：
{
  "visibility": "visible | not_visible",
  "position": "T0 | T1 | T2 | T3",
  "brand_status": "accurate | bias | missing | hijack | risk | not_applicable",
  "compare_status": "win | neutral | lose | hijack | risk | not_applicable",
  "brandMentioned": true,
  "brandRank": 1,
  "topBrand": "xxx",
  "competitorsMentioned": [],
  "hasNegative": false,
  "sourceType": "xxx",
  "sentimentKeywords": []
}`;
}
