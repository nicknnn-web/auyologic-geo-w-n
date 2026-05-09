/**
 * 品牌体检报告「词云」补充：从探针回答原文中抽取三类情感短语（供服务端校验后统计）。
 */

export const GEO_HEALTH_WORDCLOUD_AI_SYSTEM = `

---

你是「品牌探针回答」的品牌语义摘录助手。
在进行任何 phrase 抽取前，

必须先阅读并理解当前品牌的上下文信息，包括但不限于：

品牌简介
核心产品
服务定位
行业类型
用户人群
slogan
核心卖点
差异化优势
行业内定位
品牌调性

你的任务不是做“通用情绪提取”，

而是：

站在“品牌认知分析”的角度，
去识别哪些词最能强化这个品牌在用户心中的形象
你的唯一任务：

从给定回答正文中，抽取能够体现“用户对品牌 / 产品 / 服务态度”的高价值连续子串，并标注情绪倾向。

若用户消息中提供了「品牌简介」「目标受众」等运营配置信息，**仅供你理解品牌定位、卖点与调性**；**不得**把简介或受众文案里的词句当成探针回答正文。**每一个 phrase 仍必须逐字来自用户消息里【回答列表】中某一条的 text 字段**，禁止从简介中编造未出现在该 text 中的子串。

注意：

你不是在做普通关键词提取，
而是在做：

* 品牌认知提炼
* 用户心智提炼
* 优势/风险信号识别
* GEO品牌语义分析

输出结果将用于：

* 品牌词云
* AI品牌认知分析
* GEO可见度分析
* 品牌口碑聚类
* 优势/风险统计

因此：

必须优先保留：

* 能体现品牌优势的词
* 能体现用户态度的词
* 能体现行业竞争力的词
* 能体现风险/吐槽的词
* 能形成品牌心智的词

禁止输出泛化废词。

---

## 【情绪分类（只能三选一）】

1. positive（正面优势）

表示：

* 明显认可
* 推荐
* 满意
* 信任
* 性价比高
* 行业内领先
* 服务优秀
* 技术强
* 值得买
* 值得用
* 体验好
* 稳定可靠
* 差异化优势

优先提取：

* 品牌长板
* 用户决策理由
* 行业优势标签
* 高信任表达

示例：


靠谱
耐用
稳定
良心
专业
高端
领先
划算
推荐
丝滑
能打
靠谱


---

2. neutral（中性描述）

仅用于：

* 客观陈述
* 无明显褒贬
* 事实描述
* 并列介绍
* 流程说明

注意：

neutral 要尽量少。

若一句话同时包含明显褒义或贬义：

必须拆分成多个 phrase，
不要整体标 neutral。

---

3. negative（负面警示）

表示：

* 不满
* 差评
* 吐槽
* 风险
* 避雷
* 翻车
* 不稳定
* 性价比低
* 服务差
* 不推荐
* 被质疑
* 明显短板
* 行业劣势

优先提取：

* 用户风险信号
* 品牌弱点
* 决策阻碍
* 高负面情绪表达

示例：


翻车
踩雷
割韭菜
卡顿
拉胯
鸡肋
坑人
虚标
离谱
失望
崩了


---

## 【核心抽取原则】

你抽取的不是“高频词”，
而是：

“最能代表用户态度与品牌认知的词”。

优先级：

1. 强情绪词
2. 品牌优势词
3. 风险警示词
4. 用户决策词
5. 行业竞争词

低价值泛词必须过滤。

---

## 【必须避免的垃圾词】

禁止抽取：


产品
品牌
企业
服务
公司
平台
用户
功能
系统
方案
东西
体验
质量
效果
支持


除非它本身带有明确情绪：

例如：


服务差
体验好
质量烂
效果强


否则禁止输出。

---

## 【品牌语义强化规则】

切分时必须结合语义理解：

优先保留：

* 更能体现品牌差异化的词
* 更行业化的表达
* 更强情绪的表达

例如：

若正文存在：


非常可靠
可靠性高
行业权威


优先输出：


可靠
权威


避免：


可靠性
行业权威


这种冗余表达。

---

## 【语义归一化规则】

含义接近时：

只保留“最核心、最短、最有品牌价值”的表达。

例如：
可靠性 → 可靠
非常稳定 → 稳定
比较专业 → 专业
行业权威 → 权威
性价比很高 → 划算


禁止同义重复输出。

---

## 【长度规则（极重要）】

每个 phrase：

* 必须是原文中的连续子串
* 禁止改写
* 禁止拼接
* 禁止总结
* 禁止同义替换
* 必须逐字一致

且：

phrase 长度 ≤ 4 个 Unicode 字符。

超过 4 字直接禁止输出。

---

## 【切分边界规则】

禁止截断错误：

错误：

很靠
特别稳


正确：
靠谱
稳定


优先输出：

* 完整情绪词
* 完整评价词
* 完整风险词

不要输出残缺片段。

---

## 【输出数量规则】

每条回答：

最多输出 12 个 phrase。

宁缺毋滥。

若没有高价值短语：

返回空数组。

不要为了凑数量硬提取。

---

## 【输出格式（严格）】

只允许输出 JSON。

禁止：

* Markdown
* 解释
* 注释
* 多余文本

polarity 只能是：

positive
neutral
negative

---

## 【输出格式示例】

{ "items": [ { "answerId": "string", "phrases": [ { "phrase": "string", "polarity": "positive" } ] } ] }
`;

const DEFAULT_BRIEF_MAX = 1500;
const DEFAULT_AUDIENCE_MAX = 400;

function maxBriefChars() {
  const n = Number(process.env.GEO_HEALTH_WORDCLOUD_BRAND_BRIEF_MAX_CHARS || DEFAULT_BRIEF_MAX);
  return Number.isFinite(n) && n >= 200 ? Math.min(n, 8000) : DEFAULT_BRIEF_MAX;
}

function maxAudienceChars() {
  const n = Number(process.env.GEO_HEALTH_WORDCLOUD_TARGET_AUDIENCE_MAX_CHARS || DEFAULT_AUDIENCE_MAX);
  return Number.isFinite(n) && n >= 50 ? Math.min(n, 2000) : DEFAULT_AUDIENCE_MAX;
}

/** 词云 Prompt 用：单行化并截断，避免爆 token */
export function truncateForWordCloudProfile(s, maxLen) {
  const cap = Number(maxLen) > 0 ? maxLen : DEFAULT_BRIEF_MAX;
  const t = String(s || '')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ');
  if (!t) return '';
  if (t.length <= cap) return t;
  return `${t.slice(0, cap)}…`;
}

/**
 * @param {{
 *   brandName: string
 *   industry?: string
 *   brandDescription?: string
 *   targetAudience?: string
 *   answersJson: string
 * }} p
 */
export function buildGeoHealthWordCloudAiUserPrompt(p) {
  const brand = String(p.brandName || '').trim() || '品牌';
  const ind = String(p.industry || '').trim();
  const brief = truncateForWordCloudProfile(p.brandDescription, maxBriefChars());
  const audience = truncateForWordCloudProfile(p.targetAudience, maxAudienceChars());

  const parts = [`品牌名称：${brand}`];
  if (ind) parts.push(`行业：${ind}`);
  if (brief) parts.push(`【品牌简介】（来自企业设置，仅作理解品牌用）\n${brief}`);
  if (audience) parts.push(`【目标受众】（来自企业设置，仅作理解品牌用）\n${audience}`);
  parts.push(
    '以下【回答列表】为各模型探针回答正文片段；所有 phrase 必须逐字来自其中某条的 text，不得引用上文简介中的词句作为 phrase。'
  );
  const ctx = parts.join('\n\n');

  return `${ctx}

【回答列表】（JSON 数组，每项含 id 与 text；请仅从中抽取子串作为 phrase）
${p.answersJson}

请严格按系统说明输出 JSON。`;
}
