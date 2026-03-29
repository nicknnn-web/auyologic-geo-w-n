import Joi from 'joi';

/**
 * 通用验证中间件
 * @param {Joi.Schema} schema - Joi 验证规则
 * @param {string} property - 要验证的属性（body/query/params）
 */
export const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const data = req[property];
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: '参数验证失败',
        details: errors
      });
    }

    // 替换为验证后的值
    req[property] = value;
    next();
  };
};

/**
 * 常用表验证规则
 */
export const schemas = {
  // 关键词验证
  keyword: Joi.object({
    keyword: Joi.string().min(1).max(500).required(),
    type: Joi.string().valid('品牌', '产品', '场景', '企业').default('品牌'),
    source: Joi.string().max(100).optional(),
    status: Joi.string().max(20).default('active')
  }),

  // 问题验证
  question: Joi.object({
    question: Joi.string().min(1).max(1000).required(),
    keywordType: Joi.string().valid('品牌', '产品', '场景').default('品牌'),
    sourceKeyword: Joi.string().max(255).optional(),
    status: Joi.string().valid('待审核', '已审核', '已拒绝').default('待审核')
  }),

  // 知识库文档验证
  knowledge: Joi.object({
    name: Joi.string().min(1).max(500).required(),
    filename: Joi.string().max(500).optional(),
    type: Joi.string().valid('pdf', 'txt', 'doc', 'docx', 'html', 'md', 'mdx').required(),
    fileType: Joi.string().max(50).optional(),
    size: Joi.number().integer().min(0).max(10 * 1024 * 1024).optional(), // 最大 10MB
    content: Joi.string().max(5 * 1024 * 1024).optional(), // 最大 5MB
    summary: Joi.string().max(1000).optional(),
    keywords: Joi.array().items(Joi.string().max(100)).max(50).optional(),
    keyPoints: Joi.array().items(Joi.string().max(500)).max(20).optional()
  }),

  // 创作指令验证
  instructionTemplate: Joi.object({
    name: Joi.string().min(1).max(500).required(),
    content: Joi.string().min(1).max(10000).required(),
    contentType: Joi.string().valid('产品创作', '种草推荐', '短视频脚本').default('产品创作')
  }),

  // 草稿验证
  draft: Joi.object({
    title: Joi.string().min(1).max(500).required(),
    brand: Joi.string().max(255).optional(),
    content: Joi.string().max(50000).optional(),
    audience: Joi.string().max(1000).optional(),
    platforms: Joi.array().items(Joi.string().max(100)).max(10).optional(),
    commandId: Joi.number().integer().optional(),
    extra: Joi.string().max(1000).optional(),
    selectedDocs: Joi.string().max(1000).optional(),
    selectedImages: Joi.string().max(1000).optional(),
    status: Joi.string().max(50).default('draft')
  }),

  // 用户设置验证
  settings: Joi.object({
    companyName: Joi.string().max(500).optional(),
    website: Joi.string().uri().max(500).optional(),
    industry: Joi.string().max(200).optional(),
    description: Joi.string().max(2000).optional(),
    targetAudience: Joi.string().max(1000).optional(),
    deepseekApiKey: Joi.string().max(500).optional(),
    doubaoApiKey: Joi.string().max(500).optional(),
    kimiApiKey: Joi.string().max(500).optional(),
    defaultAiModel: Joi.string().max(50).default('deepseek-chat')
  })
};
