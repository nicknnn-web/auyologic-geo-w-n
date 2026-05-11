/**
 * GET/POST/PUT/DELETE /api/sentiment-lexicon
 * POST /api/sentiment-lexicon/batch-tier：批量修改主词 AI 情感（子词随主词级联）。
 * POST /api/sentiment-lexicon/merge-synonyms：复杂合并（子词、无子主词挂到目标下、有子主词删头并迁子级到目标）。
 * POST /api/sentiment-lexicon/rebuild-word-cloud：从探针原文重跑词云 AI 并覆盖入库。
 * 与前端「情感词管理」路径、字段兼容；幕后数据源为「当前最新已完成体检任务」的
 * geo_health_word_cloud_item（AI 生成 + 用户编辑），不再读写全局 geo_sentiment_lexicon。
 */
import { Router } from 'express';
import pool from '../db.js';
import {
  isSentimentKeywordLengthValid,
  SENTIMENT_KEYWORD_MAX_CODEPOINTS,
  extractProbeAnswerText,
  countProbeKeywordOccurrencesForTask,
} from '../services/sentimentLexiconService.js';
import { resolveLatestReportTaskId, persistAiWordCloudForTask } from '../services/geoHealthWordCloudPersistService.js';
import { mergeKeyForWordCloudPhrase } from '../services/sentimentWordCloudAiService.js';

const router = Router();

function userId(req) {
  return String(req.headers['x-user-id'] || 'default_user').trim() || 'default_user';
}

function normKeyword(s) {
  return String(s || '').trim();
}

async function requireLatestTaskId(uid) {
  const tid = await resolveLatestReportTaskId(pool, uid);
  if (!tid) return null;
  return tid;
}

function rowToDto(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    keyword: r.keyword,
    tier: r.tier,
    enabled: r.enabled,
    sort_order: r.sort_order,
    hit_count: Number(r.hit_count) || 0,
    parent_id: r.parent_id != null ? Number(r.parent_id) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** 将扁平行转为 el-table 树形数据（仅根节点含 children） */
function buildTreeRows(rows) {
  const dtoRows = rows.map(rowToDto);
  const byParent = new Map();
  for (const r of dtoRows) {
    const p = r.parent_id;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(r);
  }
  for (const [, arr] of byParent) {
    arr.sort((a, b) => (b.hit_count || 0) - (a.hit_count || 0) || a.id - b.id);
  }
  const roots = (byParent.get(null) || []).map((r) => ({
    ...r,
    children: byParent.get(r.id) || [],
  }));
  roots.sort((a, b) => (b.hit_count || 0) - (a.hit_count || 0) || a.id - b.id);
  return roots;
}

router.get('/sentiment-lexicon', async (req, res) => {
  try {
    const uid = userId(req);
    const tier = String(req.query.tier || 'all').toLowerCase();

    const taskId = await requireLatestTaskId(uid);
    if (!taskId) {
      return res.json({ success: true, list: [], total: 0 });
    }

    const { rows } = await pool.query(
      `SELECT id, user_id, keyword, tier, enabled, sort_order, hit_count, parent_id, created_at, updated_at
       FROM geo_health_word_cloud_item WHERE task_id = $1`,
      [taskId]
    );
    let roots = buildTreeRows(rows);
    if (tier === 'positive' || tier === 'neutral' || tier === 'negative') {
      roots = roots.filter((r) => r.tier === tier);
    }
    res.json({ success: true, list: roots, total: roots.length });
  } catch (e) {
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/** 溯源：弹窗用原始文本片段（含 analysis_id） */
router.get('/sentiment-lexicon/:id/trace', async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = await requireLatestTaskId(uid);
    if (!taskId) {
      return res.json({ success: true, keyword: '', snippets: [] });
    }
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const { rows: kwRows } = await pool.query(
      `SELECT keyword FROM geo_health_word_cloud_item WHERE id = $1 AND task_id = $2 AND user_id = $3`,
      [id, taskId, uid]
    );
    if (!kwRows.length) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    const keyword = String(kwRows[0].keyword || '').trim();
    const { rows: ans } = await pool.query(
      `SELECT a.id AS analysis_id, ga.raw_json
       FROM geo_health_analysis a
       INNER JOIN geo_health_answer ga ON ga.id = a.answer_id AND ga.task_id = a.task_id
       WHERE a.task_id = $1 AND a.error_text IS NULL`,
      [taskId]
    );
    const CONTEXT = 100;
    const MAX_SNIP = 24;
    const snippets = [];
    outer: for (const ar of ans) {
      const text = extractProbeAnswerText(ar.raw_json);
      if (!text || !keyword) continue;
      let pos = 0;
      while (true) {
        const i = text.indexOf(keyword, pos);
        if (i === -1) break;
        const start = Math.max(0, i - CONTEXT);
        const end = Math.min(text.length, i + keyword.length + CONTEXT);
        const excerpt =
          (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
        snippets.push({
          analysis_id: ar.analysis_id,
          excerpt,
        });
        pos = i + Math.max(1, keyword.length);
        if (snippets.length >= MAX_SNIP) break outer;
      }
    }
    res.json({ success: true, keyword, snippets });
  } catch (e) {
    console.error('[sentiment-lexicon] trace', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST 避免部分代理丢弃 DELETE body */
router.post('/sentiment-lexicon/batch-delete', async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = await requireLatestTaskId(uid);
    if (!taskId) {
      return res.status(400).json({ success: false, error: '暂无已完成的体检报告，请先生成报告后再管理词云词条' });
    }
    const raw = req.body?.ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ success: false, error: 'ids 须为非空数组' });
    }
    const intIds = [
      ...new Set(
        raw
          .map((x) => parseInt(String(x), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      ),
    ];
    if (!intIds.length) {
      return res.status(400).json({ success: false, error: '无有效 id' });
    }
    const del = await pool.query(
      `DELETE FROM geo_health_word_cloud_item WHERE task_id = $1 AND id = ANY($2::int[]) RETURNING id`,
      [taskId, intIds]
    );
    res.json({ success: true, deletedCount: del.rows.length });
  } catch (e) {
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/** 批量修改主词档位；同档下子词一并改为所选情感（与单条编辑主词后级联一致） */
router.post('/sentiment-lexicon/batch-tier', async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = await requireLatestTaskId(uid);
    if (!taskId) {
      return res.status(400).json({ success: false, error: '暂无已完成的体检报告' });
    }
    const tier = String(req.body?.tier || '').toLowerCase();
    if (!['positive', 'neutral', 'negative'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'tier 须为 positive | neutral | negative' });
    }
    const raw = req.body?.ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ success: false, error: 'ids 须为非空数组' });
    }
    const intIds = [
      ...new Set(
        raw
          .map((x) => parseInt(String(x), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      ),
    ];
    if (!intIds.length) {
      return res.status(400).json({ success: false, error: '无有效 id' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const roots = await client.query(
        `SELECT id FROM geo_health_word_cloud_item
         WHERE task_id = $1 AND user_id = $2 AND id = ANY($3::int[]) AND parent_id IS NULL`,
        [taskId, uid, intIds]
      );
      const rootIds = roots.rows.map((r) => r.id);
      if (!rootIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '请至少勾选一条主词（根词条）。子词情感跟随主词，请勾选其父级主词后再批量改档。',
        });
      }
      const upd = await client.query(
        `UPDATE geo_health_word_cloud_item
         SET tier = $1, source = 'user', updated_at = NOW()
         WHERE task_id = $2 AND user_id = $3
           AND (id = ANY($4::int[]) OR parent_id = ANY($4::int[]))
         RETURNING id`,
        [tier, taskId, uid, rootIds]
      );
      await client.query('COMMIT');
      res.json({ success: true, updatedCount: upd.rows.length, rootCount: rootIds.length });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      if (e.code === '23505') {
        return res.status(409).json({ success: false, error: '该档下存在等价词条冲突，请检查后再试' });
      }
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[sentiment-lexicon] batch-tier', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/** 合并同义词：selectedIds 为表格勾选（可含子词、无子主词、有子主词）；目标为 targetRootId 或 targetKeyword+tier（可新建主词）。
 * 规则：有子主词（在勾选内）→ 其名下全部子级挂到目标后删除该主词；无子主词 → 整行改为目标下子词；子词 → 改挂目标。
 * 目标主词行若出现在勾选中会被排除，不参与被合并/删除。 */
router.post('/sentiment-lexicon/merge-synonyms', async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = await requireLatestTaskId(uid);
    if (!taskId) {
      return res.status(400).json({ success: false, error: '暂无已完成的体检报告' });
    }

    const rawSel = req.body?.selectedIds ?? req.body?.childIds ?? req.body?.ids;
    if (!Array.isArray(rawSel) || rawSel.length === 0) {
      return res.status(400).json({ success: false, error: 'selectedIds 须为非空数组' });
    }
    const selectedIds = [
      ...new Set(
        rawSel
          .map((x) => parseInt(String(x), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      ),
    ];
    if (!selectedIds.length) {
      return res.status(400).json({ success: false, error: '无有效 id' });
    }

    const rawTid = req.body?.targetRootId ?? req.body?.target_root_id;
    const tidParsed = parseInt(String(rawTid ?? ''), 10);
    const hasTargetRootId = Number.isFinite(tidParsed) && tidParsed > 0;

    let keyword = '';
    let tier = '';
    if (!hasTargetRootId) {
      keyword = normKeyword(req.body?.targetKeyword ?? req.body?.keyword);
      tier = String(req.body?.tier || '').toLowerCase();
      if (!keyword) {
        return res.status(400).json({ success: false, error: 'targetKeyword 不能为空（或传 targetRootId）' });
      }
      if (!isSentimentKeywordLengthValid(keyword)) {
        return res.status(400).json({
          success: false,
          error: `主词须为 1～${SENTIMENT_KEYWORD_MAX_CODEPOINTS} 个字（与词云一致）`,
        });
      }
      if (!['positive', 'neutral', 'negative'].includes(tier)) {
        return res.status(400).json({ success: false, error: 'tier 须为 positive | neutral | negative' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let rootId;
      let targetTier;
      let createdRoot = false;
      let rootRes = { rows: [] };

      if (hasTargetRootId) {
        const tr = await client.query(
          `SELECT id, tier, keyword, phrase_norm FROM geo_health_word_cloud_item
           WHERE id = $1 AND task_id = $2 AND user_id = $3 AND parent_id IS NULL`,
          [tidParsed, taskId, uid]
        );
        if (!tr.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '目标主词不存在或不是根词条' });
        }
        rootId = tr.rows[0].id;
        targetTier = String(tr.rows[0].tier || 'neutral').toLowerCase();
        keyword = String(tr.rows[0].keyword || '').trim();
      } else {
        const pn = mergeKeyForWordCloudPhrase(keyword);
        if (!pn) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '无效主词' });
        }
        targetTier = tier;
        rootRes = await client.query(
          `SELECT id FROM geo_health_word_cloud_item
           WHERE task_id = $1 AND user_id = $2 AND parent_id IS NULL AND phrase_norm = $3 AND tier = $4
           LIMIT 1`,
          [taskId, uid, pn, targetTier]
        );
        if (rootRes.rows.length) {
          rootId = rootRes.rows[0].id;
        } else {
          const mx = await client.query(
            `SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM geo_health_word_cloud_item WHERE task_id = $1`,
            [taskId]
          );
          const sortOrder = (mx.rows[0]?.m ?? 0) + 1;
          try {
            const ins = await client.query(
              `INSERT INTO geo_health_word_cloud_item (
                 user_id, task_id, keyword, phrase_norm, tier, enabled, sort_order, hit_count, source, parent_id, updated_at
               ) VALUES ($1, $2, $3, $4, $5, true, $6, 0, 'user', NULL, NOW())
               RETURNING id`,
              [uid, taskId, keyword, pn, targetTier, sortOrder]
            );
            rootId = ins.rows[0].id;
            createdRoot = true;
          } catch (e) {
            if (e.code === '23505') {
              await client.query('ROLLBACK');
              return res.status(409).json({ success: false, error: '该档下已存在相同或等价主词' });
            }
            throw e;
          }
        }
      }

      const sources = selectedIds.filter((id) => id !== rootId);
      if (!sources.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '请至少勾选一条除目标主词外的词条（或另选合并目标）',
        });
      }

      const own = await client.query(
        `SELECT id, parent_id, phrase_norm, keyword FROM geo_health_word_cloud_item
         WHERE task_id = $1 AND user_id = $2 AND id = ANY($3::int[])`,
        [taskId, uid, selectedIds]
      );
      if (own.rows.length !== selectedIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: '部分勾选 id 不存在或不属于当前报告' });
      }

      const byId = new Map(own.rows.map((r) => [r.id, r]));
      for (const sid of sources) {
        if (!byId.has(sid)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '勾选与来源集合不一致' });
        }
      }

      const assertNoNormConflict = async (phraseNorm, excludeId) => {
        const viol = await client.query(
          `SELECT 1 FROM geo_health_word_cloud_item
           WHERE task_id = $1 AND tier = $2 AND phrase_norm = $3 AND id <> $4
           LIMIT 1`,
          [taskId, targetTier, phraseNorm, excludeId]
        );
        if (viol.rows.length) {
          const err = new Error('UNIQUE_CONFLICT');
          err.code = 'MERGE_CONFLICT';
          throw err;
        }
      };

      const rootIdsInSources = sources.filter((id) => byId.get(id).parent_id == null);
      const rootWithKids = [];
      for (const rid of rootIdsInSources) {
        const cc = await client.query(
          `SELECT COUNT(*)::int AS c FROM geo_health_word_cloud_item WHERE task_id = $1 AND user_id = $2 AND parent_id = $3`,
          [taskId, uid, rid]
        );
        if ((cc.rows[0]?.c ?? 0) > 0) rootWithKids.push(rid);
      }
      const rootLeaf = rootIdsInSources.filter((id) => !rootWithKids.includes(id));
      const childSources = sources.filter((id) => byId.get(id).parent_id != null);

      let kidsOfHeads = { rows: [] };
      if (rootWithKids.length) {
        kidsOfHeads = await client.query(
          `SELECT id, phrase_norm FROM geo_health_word_cloud_item
           WHERE task_id = $1 AND user_id = $2 AND parent_id = ANY($3::int[])`,
          [taskId, uid, rootWithKids]
        );
      }

      for (const row of kidsOfHeads.rows) {
        await assertNoNormConflict(row.phrase_norm, row.id);
      }
      for (const rid of rootLeaf) {
        await assertNoNormConflict(byId.get(rid).phrase_norm, rid);
      }
      for (const cid of childSources) {
        await assertNoNormConflict(byId.get(cid).phrase_norm, cid);
      }

      let movedFromHeads = 0;
      if (rootWithKids.length) {
        const mv = await client.query(
          `UPDATE geo_health_word_cloud_item
           SET parent_id = $1, tier = $2, source = 'user', updated_at = NOW()
           WHERE task_id = $3 AND user_id = $4 AND parent_id = ANY($5::int[])
           RETURNING id`,
          [rootId, targetTier, taskId, uid, rootWithKids]
        );
        movedFromHeads = mv.rows.length;
      }

      let deletedHeads = 0;
      if (rootWithKids.length) {
        const del = await client.query(
          `DELETE FROM geo_health_word_cloud_item
           WHERE task_id = $1 AND user_id = $2 AND id = ANY($3::int[])
           RETURNING id`,
          [taskId, uid, rootWithKids]
        );
        deletedHeads = del.rows.length;
      }

      let leafToChild = 0;
      if (rootLeaf.length) {
        const up = await client.query(
          `UPDATE geo_health_word_cloud_item
           SET parent_id = $1, tier = $2,
               hit_count = CASE WHEN source = 'user' THEN 0 ELSE hit_count END,
               source = 'user', updated_at = NOW()
           WHERE task_id = $3 AND user_id = $4 AND id = ANY($5::int[]) AND parent_id IS NULL
           RETURNING id`,
          [rootId, targetTier, taskId, uid, rootLeaf]
        );
        leafToChild = up.rows.length;
      }

      let childReattach = 0;
      if (childSources.length) {
        const up = await client.query(
          `UPDATE geo_health_word_cloud_item
           SET parent_id = $1, tier = $2, source = 'user', updated_at = NOW()
           WHERE task_id = $3 AND user_id = $4 AND id = ANY($5::int[])
           RETURNING id`,
          [rootId, targetTier, taskId, uid, childSources]
        );
        childReattach = up.rows.length;
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        parentId: rootId,
        createdRoot,
        deletedHeadCount: deletedHeads,
        movedFromHeadChildren: movedFromHeads,
        leafMergedToChild: leafToChild,
        childRowsUpdated: childReattach,
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      if (e.code === 'MERGE_CONFLICT') {
        return res.status(409).json({
          success: false,
          error: '合并后与已有词条在同档下同形冲突，请调整目标主词、情感或先处理重复词条',
        });
      }
      if (e.code === '23505') {
        return res.status(409).json({ success: false, error: '该档下已存在相同或等价词条' });
      }
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[sentiment-lexicon] merge-synonyms', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * 从本期探针回答原文重新跑词云 AI 并覆盖写入 geo_health_word_cloud_item（与任务完成时 persist 逻辑一致）。
 * 可能耗时数分钟；反向代理需足够 read timeout。
 */
router.post('/sentiment-lexicon/rebuild-word-cloud', async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = await requireLatestTaskId(uid);
    if (!taskId) {
      return res.status(400).json({ success: false, error: '暂无已完成的体检任务，无法重建词云' });
    }
    const entRes = await pool.query(
      `SELECT company_name, industry, description, target_audience FROM users WHERE user_id = $1 LIMIT 1`,
      [uid]
    );
    const e = entRes.rows[0] || {};
    const result = await persistAiWordCloudForTask(pool, taskId, uid, {
      brandName: String(e.company_name || '').trim() || '品牌',
      industry: String(e.industry || '').trim(),
      brandDescription: String(e.description || '').trim(),
      targetAudience: String(e.target_audience || '').trim(),
    });
    if (!result.ok) {
      return res.status(500).json({ success: false, error: result.error || '词云重建失败' });
    }
    res.json({
      success: true,
      taskId,
      wordCount: result.count,
    });
  } catch (e) {
    console.error('[sentiment-lexicon] rebuild-word-cloud', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/sentiment-lexicon', async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = await requireLatestTaskId(uid);
    if (!taskId) {
      return res.status(400).json({ success: false, error: '暂无已完成的体检报告，请先生成报告后再添加词条' });
    }
    const keyword = normKeyword(req.body?.keyword);
    let tier = String(req.body?.tier || '').toLowerCase();
    if (!keyword) return res.status(400).json({ success: false, error: 'keyword 不能为空' });
    if (!isSentimentKeywordLengthValid(keyword)) {
      return res.status(400).json({
        success: false,
        error: `关键词须为 1～${SENTIMENT_KEYWORD_MAX_CODEPOINTS} 个字（含英文按字符计，与词云一致）`,
      });
    }
    if (!['positive', 'neutral', 'negative'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'tier 须为 positive | neutral | negative' });
    }
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
    const pn = mergeKeyForWordCloudPhrase(keyword);
    if (!pn) return res.status(400).json({ success: false, error: '无效关键词' });

    let parentId = null;
    const rawPid = req.body?.parentId ?? req.body?.parent_id;
    if (rawPid != null && rawPid !== '') {
      const pid = parseInt(String(rawPid), 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        return res.status(400).json({ success: false, error: '无效 parentId' });
      }
      const pr = await pool.query(
        `SELECT id, tier FROM geo_health_word_cloud_item
         WHERE id = $1 AND task_id = $2 AND user_id = $3 AND parent_id IS NULL`,
        [pid, taskId, uid]
      );
      if (!pr.rows.length) {
        return res.status(400).json({ success: false, error: '父级须为当前任务下的主词（根词条）' });
      }
      parentId = pid;
      tier = String(pr.rows[0].tier || tier).toLowerCase();
    }

    const probeHits = await countProbeKeywordOccurrencesForTask(pool, taskId, keyword);

    const ins = await pool.query(
      `INSERT INTO geo_health_word_cloud_item (
         user_id, task_id, keyword, phrase_norm, tier, enabled, sort_order, hit_count, source, parent_id, updated_at
       ) VALUES ($1, $2, $3, $4, $5, true, $6, $7, 'user', $8, NOW())
       RETURNING id, user_id, keyword, tier, enabled, sort_order, hit_count, parent_id, created_at, updated_at`,
      [uid, taskId, keyword, pn, tier, sortOrder, probeHits, parentId]
    );
    res.json({ success: true, row: rowToDto(ins.rows[0]) });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ success: false, error: '该档下已存在相同或等价词条' });
    }
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/sentiment-lexicon/:id', async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = await requireLatestTaskId(uid);
    if (!taskId) {
      return res.status(400).json({ success: false, error: '暂无已完成的体检报告' });
    }
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const keyword = req.body?.keyword != null ? normKeyword(req.body.keyword) : null;
    const tier = req.body?.tier != null ? String(req.body.tier).toLowerCase() : null;
    if (tier != null && !['positive', 'neutral', 'negative'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'tier 须为 positive | neutral | negative' });
    }
    const enabled = req.body?.enabled;
    const sortOrder = req.body?.sortOrder;

    const own = await pool.query(
      `SELECT id, parent_id, keyword FROM geo_health_word_cloud_item WHERE id = $1 AND task_id = $2 AND user_id = $3`,
      [id, taskId, uid]
    );
    if (!own.rows.length) {
      return res.status(404).json({ success: false, error: '记录不存在或不属于当前报告' });
    }
    const prevParentId = own.rows[0].parent_id;

    if (tier != null && prevParentId != null) {
      return res
        .status(400)
        .json({ success: false, error: '子词情感跟随主词，请编辑主词档位或先「移除」子词归属' });
    }

    const b = req.body || {};
    const hasParentIdUpdate =
      Object.prototype.hasOwnProperty.call(b, 'parentId') ||
      Object.prototype.hasOwnProperty.call(b, 'parent_id');
    if (hasParentIdUpdate) {
      const rawPid0 = b.parentId !== undefined ? b.parentId : b.parent_id;
      const attaching =
        !(
          rawPid0 === null ||
          rawPid0 === '' ||
          (typeof rawPid0 === 'string' && ['null', 'undefined'].includes(rawPid0.trim().toLowerCase()))
        );
      if (attaching) {
        const { rows: cc } = await pool.query(
          `SELECT COUNT(*)::int AS c FROM geo_health_word_cloud_item WHERE parent_id = $1 AND task_id = $2`,
          [id, taskId]
        );
        if ((cc.rows[0]?.c ?? 0) > 0) {
          return res.status(400).json({
            success: false,
            error: '该词下仍有子词，请先移除子词后再变更归属',
          });
        }
      }
    }

    const sets = [];
    const vals = [];
    let n = 1;
    let tierHandled = false;

    if (keyword !== null) {
      if (!keyword) return res.status(400).json({ success: false, error: 'keyword 不能为空' });
      if (!isSentimentKeywordLengthValid(keyword)) {
        return res.status(400).json({
          success: false,
          error: `关键词须为 1～${SENTIMENT_KEYWORD_MAX_CODEPOINTS} 个字（含英文按字符计，与词云一致）`,
        });
      }
      const nextPn = mergeKeyForWordCloudPhrase(keyword);
      if (!nextPn) return res.status(400).json({ success: false, error: '无效关键词' });
      sets.push(`keyword = $${n++}`);
      vals.push(keyword);
      sets.push(`phrase_norm = $${n++}`);
      vals.push(nextPn);
      if (normKeyword(String(own.rows[0].keyword || '')) !== keyword) {
        const probeHits = await countProbeKeywordOccurrencesForTask(pool, taskId, keyword);
        sets.push(`hit_count = $${n++}`);
        vals.push(probeHits);
      }
    }

    if (hasParentIdUpdate) {
      const rawPid = b.parentId !== undefined ? b.parentId : b.parent_id;
      const wantsDetach =
        rawPid === null ||
        rawPid === '' ||
        (typeof rawPid === 'string' && ['null', 'undefined'].includes(rawPid.trim().toLowerCase()));
      if (wantsDetach) {
        sets.push(`parent_id = $${n++}`);
        vals.push(null);
      } else {
        const pid = parseInt(String(rawPid), 10);
        if (!Number.isFinite(pid) || pid <= 0 || pid === id) {
          return res.status(400).json({ success: false, error: '无效 parentId' });
        }
        const pr = await pool.query(
          `SELECT id, parent_id, tier FROM geo_health_word_cloud_item WHERE id = $1 AND task_id = $2 AND user_id = $3`,
          [pid, taskId, uid]
        );
        if (!pr.rows.length) return res.status(400).json({ success: false, error: '父级不存在' });
        if (pr.rows[0].parent_id != null) {
          return res.status(400).json({ success: false, error: '仅允许挂接到主词（根词条）' });
        }
        sets.push(`parent_id = $${n++}`);
        vals.push(pid);
        sets.push(`tier = $${n++}`);
        vals.push(String(pr.rows[0].tier || 'neutral').toLowerCase());
        tierHandled = true;
      }
    }

    if (tier != null && !tierHandled) {
      sets.push(`tier = $${n++}`);
      vals.push(tier);
    }
    if (typeof enabled === 'boolean') {
      sets.push(`enabled = $${n++}`);
      vals.push(enabled);
    }
    if (sortOrder != null && Number.isFinite(Number(sortOrder))) {
      sets.push(`sort_order = $${n++}`);
      vals.push(Number(sortOrder));
    }
    sets.push(`source = 'user'`);
    sets.push('updated_at = NOW()');
    const effectiveSets = sets.filter((s) => !s.includes('source') && !s.includes('updated_at'));
    if (effectiveSets.length === 0) {
      return res.status(400).json({ success: false, error: '无有效更新字段' });
    }
    vals.push(id, taskId, uid);
    const idP = vals.length - 2;
    const tidP = vals.length - 1;
    const uidP = vals.length;
    const sql = `UPDATE geo_health_word_cloud_item SET ${sets.join(
      ', '
    )} WHERE id = $${idP} AND task_id = $${tidP} AND user_id = $${uidP} RETURNING id, user_id, keyword, tier, enabled, sort_order, hit_count, parent_id, created_at, updated_at`;
    try {
      const { rows } = await pool.query(sql, vals);
      if (!rows.length) return res.status(404).json({ success: false, error: '记录不存在' });
      if (tier != null && prevParentId == null) {
        await pool.query(
          `UPDATE geo_health_word_cloud_item SET tier = $1, updated_at = NOW()
           WHERE task_id = $2 AND parent_id = $3 AND user_id = $4`,
          [rows[0].tier, taskId, id, uid]
        );
      }
      res.json({ success: true, row: rowToDto(rows[0]) });
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ success: false, error: '该档下已存在相同或等价词条' });
      }
      throw e;
    }
  } catch (e) {
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/sentiment-lexicon/:id', async (req, res) => {
  try {
    const uid = userId(req);
    const taskId = await requireLatestTaskId(uid);
    if (!taskId) {
      return res.status(400).json({ success: false, error: '暂无已完成的体检报告' });
    }
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const del = await pool.query(
      `DELETE FROM geo_health_word_cloud_item WHERE id = $1 AND task_id = $2 AND user_id = $3 RETURNING id`,
      [id, taskId, uid]
    );
    if (!del.rows.length) return res.status(404).json({ success: false, error: '记录不存在' });
    res.json({ success: true });
  } catch (e) {
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
