// AI内容生成服务

export async function generateContent(prompt, apiKey) {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: '你是一个专业的GEO智能营销内容创作助手。请根据用户需求，生成高质量的品牌营销软文。要求：语言自然流畅、结构清晰、符合平台调性。'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  return response.choices[0]?.message?.content || '生成失败，请重试';
}
