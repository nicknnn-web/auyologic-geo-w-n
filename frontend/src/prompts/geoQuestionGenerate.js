/**
 * [拓展问题 - GEO 50 题生成 Prompt]
 *
 * 用途：用户填入（品牌 / 产品 / 客户群体）后，让 AI 生成 50 道模拟真实用户对 AI 的提问。
 * 调用方：frontend/src/views/Questions.vue （GEO 问题生成弹窗）
 * 另含：buildGeoKeywordAnchoredPrompt — 关键词库批量生成（与 GEO 同源约束 + 关键词锚点）
 * 输出 JSON：
 *   {
 *     brand: string,
 *     competitors: string[],
 *     questions: [{ type: 'price'|'brand'|'product'|'scenario'|'enterprise', question: string }]
 *   }
 */

const escapePromptText = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')

const KEYWORD_LIB_TYPE_LABEL = {
  '01': '品牌词',
  '02': '产品/服务词',
  '03': '场景/需求词',
  '04': '企业/公司词',
  '05': '价格词',
}

/** 关键词库 data_key（01–05）→ 生成 JSON 中 type 枚举（与 GEO 五类一致） */
const KEYWORD_LIB_TO_GEO_TYPE = {
  '01': 'brand',
  '02': 'product',
  '03': 'scenario',
  '04': 'enterprise',
  '05': 'price',
}

const geoTypeBriefZh = {
  brand: '围绕品牌认知、口碑、主营业务（可出现品牌名）',
  product: '围绕功能、技术、成分、品类特性（一般不提品牌名）',
  scenario: '泛需求、选购犹豫、求推荐（宽场景、口语；勿过细小众场景）',
  enterprise: '须同时包含本品牌与竞品名的对比或二选一',
  price: '预算、价位、性价比、高端/平价等（多数可不出现品牌名）',
}

/**
 * [关键词库 → 拓展问题批量生成]
 *
 * 与 buildGeoQuestionPrompt 同一套「真实用户问 AI」语气与约束，并强制每条问题锚定关键词库中的词，
 * 避免脱离品牌/业务的胡编问题。
 *
 * 调用方：frontend/src/views/Questions.vue（从关键词页跳转批量生成）
 *
 * @param {object} p
 * @param {string} p.brand
 * @param {string} p.product
 * @param {string} p.targetCustomer
 * @param {{ keyword: string, typeKey: string }[]} p.keywordEntries — typeKey 为字典 data_key，如 01、02
 * @param {number} [p.questionsPerKeyword=5]
 * @param {string} [p.extraBusinessHints=''] — 如搜索识别的业务词、去重提示等
 *
 * 输出 JSON：
 *   { questions: [{ type: 'price'|'brand'|'product'|'scenario'|'enterprise', question: string, sourceKeyword: string }] }
 *   每条 type 必须与对应关键词的库内类型（01–05）按 KEYWORD_LIB_TO_GEO_TYPE 一致，禁止交叉混用。
 */
export const buildGeoKeywordAnchoredPrompt = ({
  brand,
  product,
  targetCustomer,
  keywordEntries,
  questionsPerKeyword = 5,
  extraBusinessHints = '',
}) => {
  const b = escapePromptText(brand)
  const prod = escapePromptText(product)
  const tc = escapePromptText(targetCustomer)
  const hints = escapePromptText(extraBusinessHints)
  const per = Math.max(1, Math.min(8, Number(questionsPerKeyword) || 5))
  const lines = (keywordEntries || [])
    .map(({ keyword, typeKey }) => {
      const raw = String(keyword || '').trim()
      if (!raw) return null
      const k = String(typeKey || '02').trim().padStart(2, '0')
      const label = KEYWORD_LIB_TYPE_LABEL[k] || KEYWORD_LIB_TYPE_LABEL['02']
      const geo = KEYWORD_LIB_TO_GEO_TYPE[k] || 'product'
      const geoZh = geoTypeBriefZh[geo] || geoTypeBriefZh.product
      return `- 「${escapePromptText(raw)}」（库内类型：${label}）→ 为该词生成的 ${per} 条问题：JSON 里 type 必须全部为 "${geo}"；内容须 ${geoZh}。`
    })
    .filter(Boolean)
    .join('\n')

  const n = (keywordEntries || []).filter((e) => String(e?.keyword || '').trim()).length
  const total = n * per

  return `【角色定义】
你是一个"AI搜索行为建模专家 + GEO优化专家"。

【任务说明】
根据下方「我是谁 / 我卖什么 / 我卖给谁」与「关键词锚点清单」，生成模拟真实用户向 AI 搜索工具提问的句子。
⚠️ 所有问题必须与该企业业务强相关；禁止无厘头、脑筋急转弯、与业务无关的虚构场景。

---

【输入参数】
- 我是谁：${b}
- 我卖什么：${prod}
- 我卖给谁：${tc}
${hints ? `\n【补充线索】\n${hints}\n` : ''}
---

【关键词锚点清单】（下列词条来自用户关键词库，须逐条覆盖；禁止忽略）
${lines || '（无有效关键词）'}

---

【生成规则（严格执行，与 GEO 标准一致）】

1. 数量：共 ${total} 个问题 = 锚点词条数（${n}）× 每词 ${per} 条。
2. 锚定：每个问题的 sourceKeyword 必须是清单中某一条的原文（与清单中的「」内文字完全一致），且问题语义必须明显围绕该词与上述企业业务展开；禁止套用万能模板导致词频贴标签但话题跑偏。
3. 【类型强制】每条问题的 type 由「该条 sourceKeyword 在锚点清单上标注的库内类型」唯一决定，必须与该行箭头后的英文 type 一致（例如品牌词对应 brand、产品词对应 product）。禁止把品牌词写成 price、把场景词写成 enterprise 等错配。
4. 语气：真实用户问搜索型 AI；口语化、可略碎片化；禁止市场调研腔、论文腔。
5. 禁止：你们${b}、直接向品牌客服说话的句式；AI能不能 / AI帮我 / AI你觉得；占位符；照抄本提示中的任何示例句。
6. 五类 type 写作要领（仅作该类型下的内容约束）：
   - price：${geoTypeBriefZh.price}
   - brand：${geoTypeBriefZh.brand}
   - product：${geoTypeBriefZh.product}
   - scenario：${geoTypeBriefZh.scenario}
   - enterprise：${geoTypeBriefZh.enterprise}
7. 业务一致性：问题里涉及的产品/服务类别须与「我卖什么」一致，客群侧重与「我卖给谁」一致；不要为了凑类型编造与企业无关的品类。

---

【输出格式】

仅输出合法 JSON，不要解释：

{
  "questions": [
    {
      "type": "<必须与该行关键词规定的英文 type 一致>",
      "question": "<string>",
      "sourceKeyword": "<string，须与锚点清单原文一致>"
    }
  ]
}

问题条数必须恰好为 ${total}。`
}

export const buildGeoQuestionPrompt = ({ brand, product, targetCustomer }) => `【角色定义】
你是一个"AI搜索行为建模专家 + 竞品分析专家 + GEO优化专家"。

【任务说明】
你的任务是：在接收到具体输入参数后，才开始生成用户问题。
⚠️ 在未收到输入参数前，禁止进行任何推理、生成或示例输出。

---

【输入参数（必须提供后才执行）】
- 我是谁：${brand}（品牌名称）
- 我卖什么：${product}（产品类型）
- 我卖给谁：${targetCustomer}（目标客户）

---

【执行流程】

Step 1：竞品推断
- 如果未提供竞品，请自动推断 3-5 个同赛道竞品

Step 2：问题生成
- 生成 50 个问题

---

【问题分类要求（必须满足）】

每类10个：

1. price（价格类：(决策词)
指标释义：明确指示购买预算、价格区间、金钱限制，或表达对价格敏感度与价值评估的词汇（如：“500元以内”、“高性价比”、“平价”、“高端”、“预算不够”）。
核心逻辑：测试在特定的预算限制语境下大模型的推荐逻辑，模拟用户处于购买漏斗最底端“看重预算、准备掏钱”的决策行为。
（仅作参考）生成逻辑：不含品牌名。提问必须包含明确的【金额范围】、【预算限制】或【性价比/高端/平价】等价格修饰词。
生成问题示例：“预算在[XXXX元]以内，有哪些高性价比的XX推荐？”、“学生党预算有限，求平价好用的XX。”、“一万块钱左右的高端XX，买哪个好？”）
2. brand（核心类： (品牌词)
指标释义：指代客户品牌的最直接标识/名称。包括品牌的官方中文名、外文名、简称、别称，以及具有识别性的产品/业务专属名称。
核心逻辑：测试大模型对客户品牌的基础认知、信息准确度及整体评价，模拟用户“已经知道品牌，想深入了解”的检索行为。
（仅作参考）生成逻辑：提问中必须明确包含【核心品牌词】。围绕品牌背景、整体评价、主营业务、口碑等维度发问。
生成问题示例：“[品牌名]这个牌子的XX怎么样？”、“[品牌名]的核心业务有哪些？”、“网上对[产品名]的评价好吗？”）
3. product（功能类： (产品词)
指标释义：描述产品或服务的具体物理属性、核心技术、特定成分、材质或细分品类通用名称的客观词汇（如：“降噪”、“玻色因”、“全金属机身”、“CRM系统”）。它定义了产品“是什么”或“具备什么特性/卖点”。
核心逻辑：测试客户的产品特性、核心技术在大模型中的心智占有率，模拟用户“目标明确，寻找特定功能或材质”的检索行为。
（仅作参考）生成逻辑：不含品牌名。提问必须聚焦于某种【核心技术】、【特定成分】、【材质】或【细分功能】。
生成问题示例：“市面上有哪些支持[某项特定技术]的设备？”、“成分包含[某特定成分]的护肤品有哪些好用的？”、“想要一款具备[某核心功能]的软件，求推荐。”）
4. scenario（场景类：需求词）

指标释义：
描述用户在日常生活、工作或消费过程中产生的泛需求、模糊购买意向或常见选择困扰，而不是非常具体的小众场景。

核心逻辑：
测试在用户“尚未明确品牌、也未完全确定产品”的情况下，大模型是否会主动推荐客户品牌或相关产品方案。

模拟真实用户：
- 想换
- 想买
- 想尝试
- 不知道怎么选
- 求推荐
- 看别人都在用什么

这类典型 AI 搜索行为。

【生成规则（严格执行）】

- 不允许生成过细场景
- 不允许生成小众身份/职业场景
- 不允许生成具体地点/节日/事件场景
- 不允许生成极强痛点类问题
- 场景必须宽泛、自然、口语化
- 更像真人真实提问
- 必须具备“推荐倾向”
- 必须带有“选择犹豫感”
- 必须像用户在问搜索型 AI
- 不要像市场调研问卷

【推荐表达风格】

优先生成：
- 最近想换个XX，有推荐吗
- XX现在买哪个好
- 有没有比较靠谱的XX
- 现在大家都用什么XX
- XX到底怎么选
- 想入手XX，求推荐
- 第一次买XX有什么建议
- 哪种XX更适合日常使用
- 目前主流XX有哪些
- XX哪个体验更好
- 有没有不容易踩坑的XX
- 最近比较火的XX有哪些
- 想长期用的话选哪种XX更合适
- 现在性价比高的XX有哪些
- 哪类XX更值得入手

【禁止生成】

不要生成：
- 经常出差适合什么XX
- 宝妈适合什么XX
- 健身人群适合什么XX
- 新房装修怎么XX
- 公司年会送什么XX
- 户外露营适合什么XX
- 熬夜党适合什么XX
- 学生党必备XX

因为这类问题场景过细，不符合真实 AI 搜索的大盘用户行为。

【额外要求】

- scenario 类问题默认不出现品牌名
- scenario 类问题更强调“推荐”“选择”“犹豫”
- 不强调参数、配置、技术
- 与 product 类形成明显区分
- 问题长度尽量自然
- 避免模板化重复句式
5. enterprise（对比类：(竞品词)
指标释义：指代与客户品牌在市场上存在直接竞争关系的品牌名称、平替方案，以及表达比较、对立关系的词汇（如：“VS”、“哪个好”、“区别”）。
核心逻辑：测试大模型在面临“二选一”或“多选一”的商业遭遇战时，对客户品牌与核心竞品的推荐倾向性。
（仅作参考）生成逻辑：提问必须同时包含【客户品牌/产品/业务名】与至少一个系统预设的【指定竞品名】。围绕优缺点比较、购买建议发问。
生成问题示例：“[客户品牌]和[竞品A]相比，哪个更值得买？”、“[竞品B]与[客户品牌]的核心区别是什么？”、“预算充足的情况下，选[客户品牌]还是[竞品A]？”）

---

【生成规则（严格执行）】

- 必须是"真实用户问AI"的语气
- 至少30%问题不能出现品牌名
- 至少40%问题包含竞品对比
- 对比问题必须出现2-3个竞品
- 必须具备"引导AI推荐"的倾向
- 包含口语化、长尾、决策型问题
- 禁止重复或模板化
- 禁止出现：你们{{品牌名}} 防止这种直接向品牌对话的问题
- 禁止出现：AI能不能，AI帮我，AI你觉得
- 除了品牌类和企业类问题可以出现品牌名称 其他类型应该是开放问题不出现具体品牌指向
---

【输出格式要求】

⚠️ 以下仅为格式定义，不是示例数据
⚠️ 禁止照抄或填充示例内容

最终输出必须是 JSON，结构如下：

{
  "brand": "<string>",
  "competitors": ["<string>"],
  "questions": [
    {
      "type": "<price|brand|product|scenario|enterprise>",
      "question": "<string>"
    }
  ]
}

---

【强制约束】

- 未提供输入参数时：只回复 "请提供输入参数"
- 必须返回合法 JSON
- 禁止输出解释、说明、示例
- 问题数量必须 = 50
- 每个问题必须包含 type 字段
- 不允许输出任何占位符（如 {{brand}}）`
