/**
 * 品牌体检 API（当前仅 DeepSeek，见 services/deepseekClient.js）
 *
 * GET    /api/geo-brand/config            当前抽题量、并发等（只读，便于联调）
 * POST   /api/geo-brand/tasks             创建任务 + 抽样 + 立即返回；后台分批跑探针
 * GET    /api/geo-brand/tasks/:id         查询任务基本信息
 * GET    /api/geo-brand/tasks/:id/progress 轮询进度（总数/成功/失败/待处理）
 * GET    /api/geo-brand/tasks/:id/questions  列出任务下的题目
 * GET    /api/geo-brand/tasks/:id/results     题目 + 入库答案 + 解析文章
 * POST   /api/geo-brand/tasks/:taskId/probe  手动单题探针（一般不必调，后台已跑批）
 */
import { Router } from 'express';
import pool from '../db.js';
import {
  GEO_HEALTH_PROBE_BATCH_DELAY_MS,
  GEO_HEALTH_PROBE_CONCURRENCY,
  GEO_HEALTH_QUESTIONS_PER_TYPE,
} from '../config/geoBrandTaskConfig.js';
import {
  createGeoTaskAndQuestions,
  getGeoHealthTaskProgress,
  probeWithDeepseekAndStore,
  runAllProbesForTask,
} from '../services/geoBrandTaskService.js';

const router = Router();

function getUserId(req) {
  return req.headers['x-user-id'] || 'default_user';
}

function taskRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    keyword: r.keyword,
    status: r.status,
    createdAt: r.created_at,
  };
}

/** 只读：当前抽题/并发配置（与 config/geoBrandTaskConfig.js 一致） */
router.get('/geo-brand/config', (req, res) => {
  res.json({
    success: true,
    questionsPerType: GEO_HEALTH_QUESTIONS_PER_TYPE,
    probeConcurrency: GEO_HEALTH_PROBE_CONCURRENCY,
    probeBatchDelayMs: GEO_HEALTH_PROBE_BATCH_DELAY_MS,
    hint: '改 backend/src/config/geoBrandTaskConfig.js 或对应环境变量后重启服务',
  });
});

/** 创建任务并从 questions 抽样；响应立即返回，探针在后台分批执行 */
router.post('/geo-brand/tasks', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await createGeoTaskAndQuestions(pool, { userId });
    const taskId = result.taskId;
    setImmediate(() => {
      runAllProbesForTask(pool, taskId).catch((err) => {
        console.error('[geo-brand] 后台探针未正常结束 taskId=', taskId, err);
      });
    });
    res.json({
      success: true,
      ...result,
      backgroundProbe: true,
      message: '任务已创建，DeepSeek 探针在后台分批执行，请轮询 GET .../tasks/:id/progress',
    });
  } catch (e) {
    console.error('geo-brand POST /tasks:', e);
    res.status(400).json({ success: false, error: e.message || String(e) });
  }
});

/** 轮询进度：totalQuestions / successCount / failedCount / pendingCount / status */
router.get('/geo-brand/tasks/:id/progress', async (req, res) => {
  try {
    const userId = getUserId(req);
    const taskId = Number(req.params.id);
    const progress = await getGeoHealthTaskProgress(pool, { taskId, userId });
    if (!progress) return res.status(404).json({ success: false, error: '任务不存在' });
    res.json({ success: true, ...progress });
  } catch (e) {
    console.error('geo-brand GET /tasks/:id/progress:', e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

/** 单个任务详情 */
router.get('/geo-brand/tasks/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { rows } = await pool.query(`SELECT * FROM geo_health_task WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      userId,
    ]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: '任务不存在' });
    res.json({ success: true, task: taskRow(rows[0]) });
  } catch (e) {
    console.error('geo-brand GET /tasks/:id:', e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

/** 任务下的题目列表 */
router.get('/geo-brand/tasks/:id/questions', async (req, res) => {
  try {
    const userId = getUserId(req);
    const taskId = Number(req.params.id);
    const t = await pool.query(`SELECT id FROM geo_health_task WHERE id = $1 AND user_id = $2`, [taskId, userId]);
    if (t.rows.length === 0) return res.status(404).json({ success: false, error: '任务不存在' });

    const { rows } = await pool.query(
      `SELECT id, task_id, source_question_id, question, question_type, created_at
       FROM geo_health_question WHERE task_id = $1 ORDER BY id ASC`,
      [taskId]
    );
    res.json({
      success: true,
      questions: rows.map((q) => ({
        id: q.id,
        taskId: q.task_id,
        sourceQuestionId: q.source_question_id,
        question: q.question,
        questionType: q.question_type,
        createdAt: q.created_at,
      })),
    });
  } catch (e) {
    console.error('geo-brand GET /tasks/:id/questions:', e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

/** 任务入库结果：每题 + geo_health_answer.raw_json + geo_health_article */
router.get('/geo-brand/tasks/:id/results', async (req, res) => {
  try {
    const userId = getUserId(req);
    const taskId = Number(req.params.id);
    const t = await pool.query(
      `SELECT id, user_id, keyword, status, created_at FROM geo_health_task WHERE id = $1 AND user_id = $2`,
      [taskId, userId]
    );
    if (t.rows.length === 0) return res.status(404).json({ success: false, error: '任务不存在' });

    const qRes = await pool.query(
      `SELECT
         gq.id,
         gq.task_id,
         gq.source_question_id,
         gq.question,
         gq.question_type,
         gq.created_at,
         ga.model_name,
         ga.raw_json,
         ga.valid_count,
         ga.error_text,
         ga.created_at AS answer_created_at
       FROM geo_health_question gq
       LEFT JOIN geo_health_answer ga ON ga.question_id = gq.id AND ga.task_id = gq.task_id
       WHERE gq.task_id = $1
       ORDER BY gq.id ASC`,
      [taskId]
    );

    const aRes = await pool.query(
      `SELECT id, question_id, model_name, platform, title, url, publish_time, summary, created_at
       FROM geo_health_article
       WHERE task_id = $1
       ORDER BY question_id ASC, id ASC`,
      [taskId]
    );

    const articlesByQuestion = new Map();
    for (const a of aRes.rows) {
      const qid = a.question_id;
      if (!articlesByQuestion.has(qid)) articlesByQuestion.set(qid, []);
      articlesByQuestion.get(qid).push({
        id: a.id,
        modelName: a.model_name,
        platform: a.platform,
        title: a.title,
        url: a.url,
        publishTime: a.publish_time,
        summary: a.summary,
        createdAt: a.created_at,
      });
    }

    const items = qRes.rows.map((row) => ({
      questionId: row.id,
      taskId: row.task_id,
      sourceQuestionId: row.source_question_id,
      question: row.question,
      questionType: row.question_type,
      questionCreatedAt: row.created_at,
      answer: row.model_name
        ? {
            modelName: row.model_name,
            validCount: row.valid_count,
            errorText: row.error_text,
            rawJson: row.raw_json,
            createdAt: row.answer_created_at,
          }
        : null,
      articles: articlesByQuestion.get(row.id) || [],
    }));

    res.json({
      success: true,
      task: taskRow(t.rows[0]),
      articleTotal: aRes.rows.length,
      items,
    });
  } catch (e) {
    console.error('geo-brand GET /tasks/:id/results:', e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

/**
 * 对某一题调用 DeepSeek（模型固定 deepseek-chat）
 * body: { questionId, systemPrompt?, userPrompt?, maxTokens?, temperature? }
 */
router.post('/geo-brand/tasks/:taskId/probe', async (req, res) => {
  try {
    const userId = getUserId(req);
    const taskId = Number(req.params.taskId);
    const { questionId, systemPrompt, userPrompt, maxTokens, temperature } = req.body || {};

    if (!questionId) {
      return res.status(400).json({ success: false, error: 'body.questionId 必填' });
    }

    const t = await pool.query(`SELECT id FROM geo_health_task WHERE id = $1 AND user_id = $2`, [taskId, userId]);
    if (t.rows.length === 0) return res.status(404).json({ success: false, error: '任务不存在' });

    const result = await probeWithDeepseekAndStore(pool, {
      taskId,
      questionId: Number(questionId),
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('geo-brand POST /probe:', e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

export default router;
