/**
 * 企业知识库：文件夹树 + 文档列表（筛选 / 搜索）
 */
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

function getUserId(req) {
  return req.userId;
}

function toCamelCase(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map((item) => toCamelCase(item));
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      result[camelKey] = toCamelCase(value);
    }
    return result;
  }
  return obj;
}

export async function ensureKnowledgeFoldersSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_folders (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL DEFAULT 'default_user',
      parent_id INTEGER REFERENCES knowledge_folders(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_knowledge_folders_user_parent ON knowledge_folders(user_id, parent_id)`
  );
  await pool.query(`ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS folder_id INTEGER`);
  await pool.query(`
    DO $fk$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_knowledge_folder') THEN
        ALTER TABLE knowledge
          ADD CONSTRAINT fk_knowledge_folder
          FOREIGN KEY (folder_id) REFERENCES knowledge_folders(id) ON DELETE SET NULL;
      END IF;
    END
    $fk$;
  `).catch(() => {});
}

function buildFolderTree(flatRows) {
  const byParent = new Map();
  for (const row of flatRows) {
    const pid = row.parent_id == null ? 'root' : String(row.parent_id);
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(row);
  }
  const walk = (parentKey) => {
    const list = byParent.get(parentKey) || [];
    list.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
    return list.map((r) => ({
      id: r.id,
      label: r.name,
      parentId: r.parent_id,
      children: walk(String(r.id)),
    }));
  };
  return walk('root');
}

/** GET /api/knowledge-folders/tree */
router.get('/knowledge-folders/tree', async (req, res) => {
  try {
    await ensureKnowledgeFoldersSchema();
    const userId = getUserId(req);
    const { rows } = await pool.query(
      `SELECT id, parent_id, name, sort_order, created_at
       FROM knowledge_folders
       WHERE user_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [userId]
    );
    const folderNodes = buildFolderTree(rows);
    res.json({
      success: true,
      tree: [
        { id: '__all__', label: '全部文档', parentId: null, children: [] },
        {
          id: '__uncategorized__',
          label: '未分类',
          parentId: null,
          children: [],
        },
        ...folderNodes,
      ],
    });
  } catch (err) {
    console.error('[knowledge-folders/tree]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/knowledge-folders */
router.post('/knowledge-folders', async (req, res) => {
  try {
    await ensureKnowledgeFoldersSchema();
    const userId = getUserId(req);
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ success: false, error: '文件夹名称不能为空' });
    if (name.length > 255) return res.status(400).json({ success: false, error: '名称过长' });
    let parentId = req.body?.parentId ?? req.body?.parent_id ?? null;
    if (parentId === '' || parentId === '__all__' || parentId === '__uncategorized__') parentId = null;
    parentId = parentId == null ? null : parseInt(String(parentId), 10);
    if (parentId != null && (!Number.isFinite(parentId) || parentId <= 0)) {
      return res.status(400).json({ success: false, error: '无效的父文件夹' });
    }
    if (parentId != null) {
      const p = await pool.query(
        `SELECT id FROM knowledge_folders WHERE id = $1 AND user_id = $2`,
        [parentId, userId]
      );
      if (!p.rows.length) return res.status(404).json({ success: false, error: '父文件夹不存在' });
    }
    const ins = await pool.query(
      `INSERT INTO knowledge_folders (user_id, parent_id, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, parentId, name]
    );
    res.json({ success: true, folder: toCamelCase(ins.rows[0]) });
  } catch (err) {
    console.error('[knowledge-folders POST]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** PUT /api/knowledge-folders/:id */
router.put('/knowledge-folders/:id', async (req, res) => {
  try {
    await ensureKnowledgeFoldersSchema();
    const userId = getUserId(req);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: '无效的文件夹 id' });
    }
    const name = req.body?.name != null ? String(req.body.name).trim() : null;
    if (name !== null && !name) {
      return res.status(400).json({ success: false, error: '文件夹名称不能为空' });
    }
    const sets = [];
    const vals = [];
    let pi = 1;
    if (name) {
      sets.push(`name = $${pi++}`);
      vals.push(name);
    }
    if (!sets.length) return res.status(400).json({ success: false, error: '无更新字段' });
    vals.push(id, userId);
    const r = await pool.query(
      `UPDATE knowledge_folders SET ${sets.join(', ')} WHERE id = $${pi} AND user_id = $${pi + 1} RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: '文件夹不存在' });
    res.json({ success: true, folder: toCamelCase(r.rows[0]) });
  } catch (err) {
    console.error('[knowledge-folders PUT]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** DELETE /api/knowledge-folders/:id */
router.delete('/knowledge-folders/:id', async (req, res) => {
  try {
    await ensureKnowledgeFoldersSchema();
    const userId = getUserId(req);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: '无效的文件夹 id' });
    }
    const r = await pool.query(
      `DELETE FROM knowledge_folders WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: '文件夹不存在' });
    res.json({ success: true, deletedId: r.rows[0].id });
  } catch (err) {
    console.error('[knowledge-folders DELETE]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const KNOWLEDGE_LIST_COLUMNS = `
  k.id, k.user_id, k.name, k.filename, k.type, k.file_type, k.size, k.summary,
  k.file_path, k.keywords, k.key_points, k.analyzed_at, k.created_at, k.folder_id,
  length(coalesce(k.content, ''))::int AS content_length,
  f.name AS folder_name
`;

/**
 * GET /api/knowledge?folderId=&q=
 * folderId: __all__ | __uncategorized__ | 数字；q: 模糊搜索（有 q 时仍可按 folderId 缩小范围）
 */
router.get('/knowledge', async (req, res) => {
  try {
    await ensureKnowledgeFoldersSchema();
    const userId = getUserId(req);
    const q = String(req.query.q ?? '').trim();
    const folderKey = String(req.query.folderId ?? req.query.folder_id ?? '__all__').trim();

    const params = [userId];
    const where = [`k.user_id = $1`];
    let pi = 2;

    if (q) {
      where.push(`(
        k.name ILIKE '%' || $${pi} || '%'
        OR k.filename ILIKE '%' || $${pi} || '%'
        OR coalesce(k.summary, '') ILIKE '%' || $${pi} || '%'
        OR coalesce(k.content, '') ILIKE '%' || $${pi} || '%'
      )`);
      params.push(q);
      pi += 1;
    }

    if (!q || folderKey !== '__all__') {
      if (folderKey === '__uncategorized__') {
        where.push('k.folder_id IS NULL');
      } else if (folderKey !== '__all__' && folderKey !== '') {
        const fid = parseInt(folderKey, 10);
        if (!Number.isFinite(fid) || fid <= 0) {
          return res.status(400).json({ success: false, error: '无效的 folderId' });
        }
        where.push(`k.folder_id = $${pi}`);
        params.push(fid);
        pi += 1;
        // 文件夹须属于当前用户
        where.push(`EXISTS (SELECT 1 FROM knowledge_folders kf WHERE kf.id = $${pi - 1} AND kf.user_id = $1)`);
      }
    }

    const sql = `
      SELECT ${KNOWLEDGE_LIST_COLUMNS}
      FROM knowledge k
      LEFT JOIN knowledge_folders f ON f.id = k.folder_id AND f.user_id = $1
      WHERE ${where.join(' AND ')}
      ORDER BY k.id DESC
    `;
    const { rows } = await pool.query(sql, params);
    const list = rows.map((r) => {
      const row = toCamelCase(r);
      row.words = r.content_length ?? 0;
      row.content = undefined;
      return row;
    });
    res.json(list);
  } catch (err) {
    console.error('[knowledge list]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
