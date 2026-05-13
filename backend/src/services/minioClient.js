import * as Minio from 'minio';

/**
 * MinIO 客户端配置
 * 用于文件上传和公开 URL 生成
 */

/** MinIO SDK 的 endPoint 只要主机名，不要带 https://、路径或 :port（端口单独用 MINIO_PORT） */
export function normalizeMinioEndpoint(raw) {
  let h = String(raw || '').trim();
  if (!h) return '';
  if (/^https?:\/\//i.test(h)) {
    try {
      return new URL(h).hostname;
    } catch {
      h = h.replace(/^https?:\/\//i, '');
    }
  }
  const noPath = h.split('/')[0];
  return noPath.split(':')[0].trim();
}

export function resolveMinioAccessKey() {
  return String(process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '').trim();
}

export function resolveMinioSecretKey() {
  return String(process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '').trim();
}

/** MINIO_USE_SSL=false / 0 / off 时走 HTTP（内网 MinIO 常见） */
function resolveMinioUseSSL() {
  const v = String(process.env.MINIO_USE_SSL ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return true;
}

/** 未设置或无效时：HTTPS 默认 443，HTTP 默认 9000（与常见 MinIO 部署一致） */
export function resolveMinioPort() {
  const raw = process.env.MINIO_PORT;
  if (raw != null && String(raw).trim() !== '') {
    const n = parseInt(String(raw).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return resolveMinioUseSSL() ? 443 : 9000;
}

const ENDPOINT = normalizeMinioEndpoint(process.env.MINIO_ENDPOINT);

/** Logo / 图库等上传前校验：与客户端实际使用同一套解析规则 */
export function isMinioEnvReadyForUpload() {
  return !!(
    ENDPOINT &&
    process.env.MINIO_BUCKET &&
    String(process.env.MINIO_BUCKET).trim() &&
    process.env.MINIO_PUBLIC_URL &&
    String(process.env.MINIO_PUBLIC_URL).trim() &&
    resolveMinioAccessKey() &&
    resolveMinioSecretKey()
  );
}

// 初始化 MinIO 客户端
console.log('MINIO_ENDPOINT(raw) =', process.env.MINIO_ENDPOINT, '→ normalized =', ENDPOINT);
const minioClient = new Minio.Client({
  endPoint: ENDPOINT || '127.0.0.1',
  port: resolveMinioPort(),
  useSSL: resolveMinioUseSSL(),
  accessKey: resolveMinioAccessKey(),
  secretKey: resolveMinioSecretKey(),
});

// Bucket 配置
const BUCKET_NAME = process.env.MINIO_BUCKET;
const PUBLIC_URL_PREFIX = process.env.MINIO_PUBLIC_URL;

/**
 * 初始化 Bucket（确保 Bucket 存在并设置公开访问策略）
 */
async function initializeBucket() {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);

    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME);
      console.log(`✅ MinIO Bucket "${BUCKET_NAME}" 创建成功`);
    } else {
      console.log(`✅ MinIO Bucket "${BUCKET_NAME}" 已存在`);
    }

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
        },
      ],
    };

    await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
    console.log(`✅ Bucket "${BUCKET_NAME}" 公开访问策略已设置`);
  } catch (error) {
    console.error('❌ MinIO Bucket 初始化失败:', error);
    throw error;
  }
}

/**
 * 上传文件到 MinIO
 *
 * 返回的是「固定形态的公开对象 URL」（MINIO_PUBLIC_URL + bucket + key 拼接），
 * 不是预签名 URL，不含过期参数；只要对象未被删除且 Bucket 保持匿名可读策略，链接长期有效。
 *
 * @param {Buffer|string} fileBuffer - 文件内容
 * @param {string} objectName - 存储对象名称（包含路径）
 * @param {string} contentType - 文件 MIME 类型
 * @returns {Promise<string>} 可长期使用的公开访问 URL（非预签名、无过期时间）
 */
async function uploadFile(fileBuffer, objectName, contentType = 'application/octet-stream') {
  try {
    await minioClient.putObject(BUCKET_NAME, objectName, fileBuffer, null, contentType);

    const publicUrl = `${PUBLIC_URL_PREFIX}/${BUCKET_NAME}/${objectName}`;

    console.log(`✅ 文件上传成功: ${objectName}`);

    return publicUrl;
  } catch (error) {
    console.error('❌ 文件上传失败:', error);
    throw error;
  }
}

/**
 * 删除文件
 * @param {string} objectName - 存储对象名称
 */
async function deleteFile(objectName) {
  try {
    await minioClient.removeObject(BUCKET_NAME, objectName);
    console.log(`✅ 文件删除成功: ${objectName}`);
  } catch (error) {
    console.error('❌ 文件删除失败:', error);
    throw error;
  }
}

/**
 * 获取文件的公开 URL
 * @param {string} objectName - 存储对象名称
 * @returns {string} 公开访问 URL
 */
function getPublicUrl(objectName) {
  return `${PUBLIC_URL_PREFIX}/${BUCKET_NAME}/${objectName}`;
}

/**
 * 从本服务生成的 MinIO 公开 URL 解析出对象键（用于删除）
 * 与 uploadFile 拼接规则一致：PUBLIC_URL_PREFIX + '/' + BUCKET + '/' + objectName
 */
export function objectNameFromPublicUrl(fullUrl) {
  const u = String(fullUrl || '').split('?')[0].trim();
  if (!u || !PUBLIC_URL_PREFIX || !BUCKET_NAME) return null;
  const base = String(PUBLIC_URL_PREFIX).replace(/\/$/, '');
  const pfx = `${base}/${BUCKET_NAME}/`;
  if (!u.startsWith(pfx)) return null;
  try {
    return decodeURIComponent(u.slice(pfx.length));
  } catch {
    return u.slice(pfx.length);
  }
}

export {
  minioClient,
  initializeBucket,
  uploadFile,
  deleteFile,
  getPublicUrl,
  BUCKET_NAME,
  PUBLIC_URL_PREFIX,
};
