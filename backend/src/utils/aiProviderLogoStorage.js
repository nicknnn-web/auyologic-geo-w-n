/**
 * 大模型接入 Logo：仅使用 MinIO，数据库 logo_relpath 存完整可访问的 https 预览地址。
 */
import path from 'path';
import { uploadFile, deleteFile, objectNameFromPublicUrl } from '../services/minioClient.js';

function safePathSegment(s) {
  return String(s || 'user')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80) || 'user';
}

export function canUseMinioForLogos() {
  return [process.env.MINIO_ENDPOINT, process.env.MINIO_ACCESS_KEY, process.env.MINIO_SECRET_KEY, process.env.MINIO_BUCKET, process.env.MINIO_PUBLIC_URL].every(
    (v) => v != null && String(v).trim() !== ''
  );
}

/**
 * 库内仅存完整 http(s) 地址；非 http(s) 视为无效（需重新上传）
 * @param {string|null|undefined} stored
 * @returns {string|null}
 */
export function resolveAiLogoPublicUrl(stored) {
  const s = String(stored || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

/**
 * 根据库中保存的预览 URL 删除 MinIO 对象（仅识别本服务 MINIO_PUBLIC_URL 规则生成的地址）
 * @param {string|null|undefined} storedUrl
 */
export function removeAiLogoStored(storedUrl) {
  const key = objectNameFromPublicUrl(storedUrl);
  if (!key) return;
  deleteFile(key).catch((e) => console.warn('[removeAiLogoStored] MinIO', e?.message || e));
}

/**
 * @param {{ userId: string, connectionId: number, originalName: string, buffer: Buffer, mimetype?: string }} opts
 * @returns {Promise<string>} 写入 logo_relpath 的完整预览 URL
 */
export async function saveAiLogoFromBuffer(opts) {
  if (!canUseMinioForLogos()) {
    throw new Error(
      '未配置 MinIO，无法上传 AI Logo。请设置 MINIO_ENDPOINT、MINIO_ACCESS_KEY、MINIO_SECRET_KEY、MINIO_BUCKET、MINIO_PUBLIC_URL（MINIO_PORT 可省略，未设置时默认 443）。'
    );
  }
  const { userId, connectionId, originalName, buffer, mimetype } = opts;
  const uid = safePathSegment(userId);
  const ext0 = path.extname(originalName || '').toLowerCase() || '.png';
  const allowed = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
  const ext = allowed.has(ext0) ? ext0 : '.png';

  const objectName = `ai-logos/${uid}/${connectionId}${ext}`;
  const mt =
    mimetype && String(mimetype).trim()
      ? String(mimetype)
      : ext === '.svg'
        ? 'image/svg+xml'
        : `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`;

  const publicUrl = await uploadFile(buffer, objectName, mt);
  return publicUrl;
}
