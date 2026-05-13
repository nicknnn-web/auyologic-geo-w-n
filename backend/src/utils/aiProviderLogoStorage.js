/**
 * 大模型接入 Logo：仅使用 MinIO，数据库 logo_relpath 存完整可访问的 https 预览地址。
 */
import path from 'path';
import { uploadFile, deleteFile, objectNameFromPublicUrl, isMinioEnvReadyForUpload } from '../services/minioClient.js';

function safePathSegment(s) {
  return String(s || 'user')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80) || 'user';
}

export function canUseMinioForLogos() {
  return isMinioEnvReadyForUpload();
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
      '未配置 MinIO，无法上传 AI Logo。请在本服务（运行 Node 的同一服务）环境中绑定变量：地址可用 MINIO_ENDPOINT / MINIO_HOST / MINIO_SERVER_URL / S3_ENDPOINT / AWS_ENDPOINT_URL；Bucket 可用 MINIO_BUCKET / S3_BUCKET；对外访问前缀可用 MINIO_PUBLIC_URL / MINIO_PUBLIC_ENDPOINT / MINIO_PUBLIC_HOST（仅主机名时默认 https）；密钥可用 MINIO_ACCESS_KEY+MINIO_SECRET_KEY 或 MINIO_ROOT_USER+MINIO_ROOT_PASSWORD 或 AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY。完整 https 地址会自动解析主机名；MINIO_PORT 可省略；内网 HTTP 请加 MINIO_USE_SSL=false。'
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
