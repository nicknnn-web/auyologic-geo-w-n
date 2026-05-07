/**
 * [关键词提取相关 Prompt]
 *
 * 1) buildBusinessTermsPrompt — 业务专业词汇提取（拓展问题页使用）
 *    调用方：frontend/src/views/Questions.vue → analyzeEnterpriseProfileForQuestions
 *
 * 2) buildCoreKeywordsPrompt  — 企业核心业务关键词提取（企业设置页使用）
 *    调用方：frontend/src/views/EnterpriseSettings.vue → analyzeEnterpriseProfile
 */

/**
 * 业务专业词汇提取（10-15 不设死限，输出每行一个）
 */
export const buildBusinessTermsPrompt = ({ name, industry, description }) => `你是一个企业业务分析师。请根据以下企业信息，提取出该企业核心从事的业务领域的专业词汇。

企业名称：${name}
所属行业：${industry}
企业描述：${description || '无'}

要求：
- 只输出业务关键词，每行一个
- 必须是该企业实际从事的业务领域的专业词汇
- 包含中英文（如SEO、GEO、SaaS、跨境电商等）
- 不要输出"公司"、"服务"等泛泛的词
- 如果企业描述中提到了具体业务词，必须包含进去

直接输出关键词列表，不要解释。`

/**
 * 企业核心关键词提取（10-15 个，强调 GEO / SEO 等重点词必须出现）
 */
export const buildCoreKeywordsPrompt = ({ name, industry, description }) => `你是一个企业业务关键词分析师。请根据以下企业信息，提取出10-15个核心业务关键词。

【重要】如果企业描述中提到了以下任何术语，必须包含在关键词列表中：
- GEO、SEO、搜索优化、搜索引擎优化、谷歌优化
- 数字化营销、海外营销、跨境营销
- SaaS、软件开发、小程序
- 独立站、跨境电商、亚马逊

企业名称：${name}
所属行业：${industry}
企业描述：${description || '无'}

要求：
- 只输出关键词，每行一个（2–12 字为宜）
- 必须是该企业实际从事的业务领域的专业词汇或行业常用检索词
- 必须包含企业描述中提到的所有专业术语（如 GEO、SEO、SaaS、Google 优化等）
- 支持中英文专业词（如 SaaS、API、GEO、SEO）
- 不要输出企业名称本身
- 不要输出句子片段、半句话、地名+年级等残缺词
- 不要输出"公司""服务""我们"等空泛词

直接输出关键词列表，不要编号、不要解释。若描述中出现 GEO 或 SEO，列表中必须出现与之直接相关的词。`
