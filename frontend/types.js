/**
 * 类型定义文档
 * 提供 API 响应和前端数据结构的类型说明
 */

/**
 * 用户信息
 * @typedef {Object} User
 * @property {string} userId - 用户ID
 * @property {string} username - 用户名
 * @property {string} companyName - 公司名称
 * @property {string} website - 网站URL
 * @property {string} industry - 行业
 * @property {string} description - 企业描述
 * @property {string} targetAudience - 目标受众
 * @property {string} deepseekApiKey - DeepSeek API Key
 * @property {string} doubaoApiKey - 豆包 API Key
 * @property {string} kimiApiKey - Kimi API Key
 * @property {string} defaultAiModel - 默认AI模型
 * @property {string} createdAt - 创建时间
 * @property {string} updatedAt - 更新时间
 */

/**
 * 关键词
 * @typedef {Object} Keyword
 * @property {number} id - 关键词ID
 * @property {string} userId - 用户ID
 * @property {string} keyword - 关键词内容（1-500字符）
 * @property {'品牌'|'产品'|'场景'|'企业'} type - 关键词类型
 * @property {string} source - 来源（可选）
 * @property {'active'|'inactive'} status - 状态
 * @property {string} createdAt - 创建时间
 */

/**
 * 问题
 * @typedef {Object} Question
 * @property {number} id - 问题ID
 * @property {string} userId - 用户ID
 * @property {number} keywordId - 关键词ID
 * @property {string} question - 问题内容（1-1000字符）
 * @property {string} answer - 答案（可选）
 * @property {'品牌'|'产品'|'场景'} keywordType - 关键词类型
 * @property {string} sourceKeyword - 来源关键词
 * @property {'待审核'|'已审核'|'已拒绝'} status - 状态
 * @property {string} createdAt - 创建时间
 */

/**
 * 知识库文档
 * @typedef {Object} Knowledge
 * @property {number} id - 文档ID
 * @property {string} userId - 用户ID
 * @property {string} name - 文档名称（1-500字符）
 * @property {string} filename - 文件名
 * @property {'pdf'|'txt'|'doc'|'docx'|'html'|'md'|'mdx'} type - 文件类型
 * @property {string} fileType - 文件类型（可选）
 * @property {number} size - 文件大小（最大10MB）
 * @property {string} content - 文档内容（最大5MB）
 * @property {string} summary - 摘要（1000字符）
 * @property {string[]} keywords - 关键词列表（最多50个）
 * @property {string[]} keyPoints - 核心要点（最多20个）
 * @property {string} analyzedAt - 分析时间
 * @property {string} createdAt - 创建时间
 */

/**
 * 图片
 * @typedef {Object} Image
 * @property {number} id - 图片ID
 * @property {string} userId - 用户ID
 * @property {string} title - 图片标题（1-500字符）
 * @property {string} imagePath - 图片路径
 * @property {number} size - 图片大小
 * @property {string} tags - 标签
 * @property {string} createdAt - 创建时间
 */

/**
 * 创作指令
 * @typedef {Object} InstructionTemplate
 * @property {number} id - 指令ID
 * @property {string} userId - 用户ID
 * @property {string} name - 指令名称（1-500字符）
 * @property {string} content - 提示词内容（1-10000字符）
 * @property {'产品创作'|'种草推荐'|'短视频脚本'} contentType - 创作类型
 * @property {string} createdAt - 创建时间
 */

/**
 * 草稿
 * @typedef {Object} Draft
 * @property {number} id - 草稿ID
 * @property {string} userId - 用户ID
 * @property {string} title - 标题（1-500字符）
 * @property {string} brand - 品牌（255字符）
 * @property {string} content - 内容（50000字符）
 * @property {string} audience - 受众（1000字符）
 * @property {string[]} platforms - 平台列表（最多10个）
 * @property {number} commandId - 指令ID
 * @property {string} extra - 补充说明（1000字符）
 * @property {string} selectedDocs - 选中文档
 * @property {string} selectedImages - 选中图片
 * @property {string} status - 状态（50字符）
 * @property {string} createdAt - 创建时间
 */

/**
 * API 响应
 * @typedef {Object} APIResponse
 * @property {boolean} success - 是否成功
 * @property {*} data - 响应数据
 * @property {string} error - 错误信息
 * @property {Object[]} details - 错误详情（验证失败时）
 */

/**
 * 分页响应
 * @typedef {Object} PaginatedResponse
 * @property {T[]} data - 数据列表
 * @property {number} total - 总数
 * @property {number} page - 当前页
 * @property {number} pageSize - 每页大小
 * @property {boolean} hasMore - 是否有更多数据
 */

/**
 * AI 生成请求
 * @typedef {Object} AIGenerateRequest
 * @property {string} prompt - 提示词
 * @property {'content'|'analysis'|'questions'} type - 生成类型
 * @property {string[]} keywords - 关键词列表（可选）
 * @property {string[]} platforms - 平台列表（可选）
 * @property {string} audience - 受众（可选）
 */

/**
 * AI 生成响应
 * @typedef {Object} AIGenerateResponse
 * @property {boolean} success - 是否成功
 * @property {string} content - 生成的内容
 * @property {string} error - 错误信息
 */

/**
 * 表单验证错误
 * @typedef {Object} ValidationError
 * @property {string} field - 字段名
 * @property {string} message - 错误消息
 */

/**
 * 导出所有类型定义（用于 JSDoc）
 */
export const Types = {
  User: {},
  Keyword: {},
  Question: {},
  Knowledge: {},
  Image: {},
  InstructionTemplate: {},
  Draft: {},
  APIResponse: {},
  PaginatedResponse: {},
  AIGenerateRequest: {},
  AIGenerateResponse: {},
  ValidationError: {}
};
