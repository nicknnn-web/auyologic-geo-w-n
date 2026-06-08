/**
 * [GEO 体检 - AI 智能总结 Prompt]
 *
 * 用途：把已算好的报告指标（可见度、负面、竞品、信源、词云等）交给大模型，
 *       生成一段面向业务人员、可直接对客的「结果解读」：发生了什么 + 为什么 + 哪些因素导致。
 * 调用方：backend/src/services/geoHealthAiSummaryService.js
 */

export const GEO_HEALTH_AI_SUMMARY_SYSTEM = `你是一名资深的品牌 GEO（生成式引擎优化）顾问。
你的任务是把一份"品牌在 AI 搜索中的体检数据"翻译成业务人员能直接对客户讲的结论性解读。

【输出格式】必须严格分为三段，每段以加粗小标题开头，标题与正文之间用中文冒号"："连接，段与段之间用一个空行分隔：
**整体判断：**（用 1～2 句话给出总体结论，明确表现属于"优秀 / 一般 / 偏弱"，点出健康分与最关键的现状）
**优势与亮点：**（说明表现好的方面及其原因，如品牌信息覆盖、核心业务描述、权威媒体引用、行业提及频率、正面情绪词、信源结构健康等；用具体数据支撑）
**问题与原因：**（说明问题及其根因，如负面舆情、曝光/提及不足、权威信源少、被竞争对手抢占认知、内容结构失衡等；点名高频竞争对手并解释 AI 为何更倾向引用它们）

【写作要求】
1. 用简体中文，语气专业、客观、可信，像顾问当面汇报。
2. 不要输出三段以外的内容，不要输出 markdown 标题(#)、列表符号、代码块或 JSON。
3. 小标题只用上面三个，正文里关键术语/数据/竞品名可用 **加粗** 强调。
4. 必须基于给定数据，禁止编造数字、竞品名或负面内容；数据没有的不要硬说。
5. 即使整体表现好，"问题与原因"段也要给出仍可优化的点；即使表现差，"优势与亮点"段也要找出相对可取之处。
6. 【结合原文举例】当下方提供了「原文摘录」时，"优势与亮点"和"问题与原因"两段要尽量结合原文佐证：
   - 例如优点写法："在问题《……》中，**XX模型**的回答提到"……（原文片段）"，体现了权威/专业/可靠等认知。"
   - 例如缺点写法："在问题《……》中，**XX模型**给出的结果是"……（原文片段）"，反映出负面舆情/被竞品替代等问题。"
   - 引用的原文片段必须简短（控制在 30 字内）并加引号，且只能取自给定的「原文摘录」，严禁编造或改写原意；每段引用 1～2 处即可，不要堆砌。
7. 每段 3～5 句，全文约 400～700 字。`;

function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v)}%`;
}

function pickList(arr, n) {
  return (Array.isArray(arr) ? arr : []).slice(0, n);
}

function renderExcerptBlock(title, items) {
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.excerpt);
  if (!list.length) return '';
  const body = list
    .map((it, i) => {
      const q = String(it.question || '').replace(/\s+/g, ' ').slice(0, 60);
      const model = String(it.model || '模型');
      const ex = String(it.excerpt || '').replace(/\s+/g, ' ').slice(0, 220);
      return `${i + 1}. 问题《${q}》｜${model}回答原文："${ex}"`;
    })
    .join('\n');
  return `${title}\n${body}`;
}

/**
 * 从报告 payload 抽取关键指标 + 探针原文摘录，拼成给模型的紧凑事实块。
 * @param {object} report 主报告 payload（getGeoTaskReportCache 的返回）
 * @param {{ positives?: Array, negatives?: Array }} [excerpts] 原文摘录（佐证用）
 */
export function buildGeoHealthAiSummaryUserPrompt(report, excerpts = {}) {
  const r = report || {};
  const lines = [];

  lines.push(`品牌名称：${r.brandName || '未知品牌'}`);
  if (r.brandDomain) lines.push(`官网：${r.brandDomain}`);
  lines.push(`AI 健康分（首要模型）：${r.healthScore ?? '—'}`);

  // 可见度 / 提及
  lines.push(
    `品牌提及率：${pct(r.brandMentionRate)}；行业提及率：${pct(r.industryMentionRate)}；` +
      `被拦截率（未提及品牌）：${pct(r.interceptRate)}`
  );
  if (r.blindModelCount != null && r.totalModelCount != null) {
    lines.push(`盲区模型：${r.totalModelCount} 个模型中有 ${r.blindModelCount} 个几乎检索不到品牌`);
  }

  // 各模型可见度
  const cards = pickList(r.modelVisibilityCards, 8).map((c) => {
    const name = c.modelName || c.name || c.platformName || '模型';
    return `${name}=${c.score ?? '—'}分`;
  });
  if (cards.length) lines.push(`各大模型可见度：${cards.join('，')}`);

  // 负面
  lines.push(
    `负面关联：${r.negativeCount ?? 0}/${r.negativeTotal ?? 0} 条（占比 ${pct(
      Number(r.negativeRate)
    )}，风险等级：${r.negativeRiskLevel || '未知'}）`
  );

  // 竞品
  const comps = pickList(r.competitorMentions, 8).map((c) => {
    const name = c.name || c.competitor || '竞品';
    const cnt = c.count ?? c.mentions ?? '';
    return cnt !== '' ? `${name}(${cnt}次)` : name;
  });
  if (comps.length) lines.push(`AI 推荐中高频出现的竞争对手：${comps.join('、')}`);

  // 信源结构
  const src = pickList(r.sourceData, 6)
    .filter((s) => (s.count ?? 0) > 0)
    .map((s) => `${s.type}=${s.count}条(${pct(s.pct)})`);
  if (src.length) lines.push(`信源结构：${src.join('，')}`);
  lines.push(`权威信源得分：${r.authorityScore ?? '—'}`);

  // 词云情绪
  const wc = Array.isArray(r.sentimentWordCloud) ? r.sentimentWordCloud : [];
  if (wc.length) {
    const byPolarity = { positive: [], neutral: [], negative: [] };
    for (const w of wc) {
      const p = String(w.polarity || 'neutral');
      if (byPolarity[p]) byPolarity[p].push(w.text || w.name);
    }
    const fmt = (arr) => pickList(arr.filter(Boolean), 8).join('、');
    if (byPolarity.positive.length) lines.push(`正面情绪词：${fmt(byPolarity.positive)}`);
    if (byPolarity.negative.length) lines.push(`负面/警示词：${fmt(byPolarity.negative)}`);
  }

  // 已有诊断结论（供模型参考，不要照抄）
  const diag = pickList(r.diagnosticSuggestions, 4)
    .map((d) => `${d.title || ''}：${d.diagnosis || ''}`)
    .filter((s) => s.trim() && s.trim() !== '：');
  if (diag.length) lines.push(`系统诊断要点（仅供参考）：\n${diag.join('\n')}`);

  const posBlock = renderExcerptBlock(
    '【原文摘录·正面/品牌被提及】（用于佐证"优势与亮点"，引用须加引号且不得改写）：',
    excerpts.positives
  );
  const negBlock = renderExcerptBlock(
    '【原文摘录·负面/被竞品压制】（用于佐证"问题与原因"，引用须加引号且不得改写）：',
    excerpts.negatives
  );
  const excerptText = [posBlock, negBlock].filter(Boolean).join('\n\n');

  return `以下是该品牌在 AI 搜索场景中的体检数据，请据此生成一段"结果解读"：

${lines.join('\n')}${excerptText ? `\n\n${excerptText}` : ''}

请严格按「整体判断 / 优势与亮点 / 问题与原因」三段式输出面向业务人员的结论性解读，便于他们直接与客户沟通；当上方提供了「原文摘录」时，请在优劣两段中结合原文片段举例佐证。`;
}
