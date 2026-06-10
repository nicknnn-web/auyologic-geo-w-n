/**
 * 草稿箱：文件夹树 + 列表筛选条件（分页列表在 index.js fetchPagedCrudList）
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

export async function ensureDraftFoldersSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS draft_folders (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL DEFAULT 'default_user',
      parent_id INTEGER REFERENCES draft_folders(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_draft_folders_user_parent ON draft_folders(user_id, parent_id)`
  );
  await pool.query(`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS folder_id INTEGER`);
  await pool.query(`
    DO $fk$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_drafts_folder') THEN
        ALTER TABLE drafts
          ADD CONSTRAINT fk_drafts_folder
          FOREIGN KEY (folder_id) REFERENCES draft_folders(id) ON DELETE SET NULL;
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

/** 草稿分页列表 WHERE（表别名 d） */
export function buildDraftListWhere(req) {
  const userId = getUserId(req);
  const parts = [
    `(d.user_id = $1 OR d.user_id IS NULL OR trim(coalesce(d.user_id::text, '')) = '')`,
  ];
  const params = [userId];
  let pi = 2;

  if (req.query.status) {
    parts.push(`d.status = $${pi}`);
    params.push(String(req.query.status));
    pi += 1;
  }

  const q = String(req.query.q ?? '').trim();
  if (q) {
    parts.push(`(
      coalesce(d.title, '') ILIKE '%' || $${pi} || '%'
      OR coalesce(d.brand, '') ILIKE '%' || $${pi} || '%'
      OR coalesce(d.content, '') ILIKE '%' || $${pi} || '%'
      OR coalesce(d.extra, '') ILIKE '%' || $${pi} || '%'
    )`);
    params.push(q);
    pi += 1;
  }

  const folderKey = String(req.query.folderId ?? req.query.folder_id ?? '__all__').trim();
  if (!q || folderKey !== '__all__') {
    if (folderKey === '__uncategorized__') {
      parts.push('d.folder_id IS NULL');
    } else if (folderKey !== '__all__' && folderKey !== '') {
      const fid = parseInt(folderKey, 10);
      if (Number.isFinite(fid) && fid > 0) {
        parts.push(`d.folder_id = $${pi}`);
        params.push(fid);
        pi += 1;
      }
    }
  }

  return { where: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

router.get('/draft-folders/tree', async (req, res) => {
  try {
    await ensureDraftFoldersSchema();
    const userId = getUserId(req);
    const { rows } = await pool.query(
      `SELECT id, parent_id, name, sort_order, created_at
       FROM draft_folders
       WHERE user_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [userId]
    );
    res.json({
      success: true,
      tree: [
        { id: '__all__', label: '全部草稿', parentId: null, children: [] },
        { id: '__uncategorized__', label: '未分类', parentId: null, children: [] },
        ...buildFolderTree(rows),
      ],
    });
  } catch (err) {
    console.error('[draft-folders/tree]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/draft-folders', async (req, res) => {
  try {
    await ensureDraftFoldersSchema();
    const userId = getUserId(req);
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ success: false, error: '文件夹名称不能为空' });
    let parentId = req.body?.parentId ?? req.body?.parent_id ?? null;
    if (parentId === '' || parentId === '__all__' || parentId === '__uncategorized__') parentId = null;
    parentId = parentId == null ? null : parseInt(String(parentId), 10);
    if (parentId != null && (!Number.isFinite(parentId) || parentId <= 0)) {
      return res.status(400).json({ success: false, error: '无效的父文件夹' });
    }
    if (parentId != null) {
      const p = await pool.query(
        `SELECT id FROM draft_folders WHERE id = $1 AND user_id = $2`,
        [parentId, userId]
      );
      if (!p.rows.length) return res.status(404).json({ success: false, error: '父文件夹不存在' });
    }
    const ins = await pool.query(
      `INSERT INTO draft_folders (user_id, parent_id, name) VALUES ($1, $2, $3) RETURNING *`,
      [userId, parentId, name]
    );
    res.json({ success: true, folder: toCamelCase(ins.rows[0]) });
  } catch (err) {
    console.error('[draft-folders POST]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/draft-folders/:id', async (req, res) => {
  try {
    await ensureDraftFoldersSchema();
    const userId = getUserId(req);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: '无效的文件夹 id' });
    }
    const name = req.body?.name != null ? String(req.body.name).trim() : null;
    if (name !== null && !name) {
      return res.status(400).json({ success: false, error: '文件夹名称不能为空' });
    }
    if (!name) return res.status(400).json({ success: false, error: '无更新字段' });
    const r = await pool.query(
      `UPDATE draft_folders SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [name, id, userId]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: '文件夹不存在' });
    res.json({ success: true, folder: toCamelCase(r.rows[0]) });
  } catch (err) {
    console.error('[draft-folders PUT]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/draft-folders/:id', async (req, res) => {
  try {
    await ensureDraftFoldersSchema();
    const userId = getUserId(req);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: '无效的文件夹 id' });
    }
    const r = await pool.query(
      `DELETE FROM draft_folders WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: '文件夹不存在' });
    res.json({ success: true, deletedId: r.rows[0].id });
  } catch (err) {
    console.error('[draft-folders DELETE]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
