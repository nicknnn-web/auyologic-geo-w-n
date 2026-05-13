import * as Minio from 'minio';

/**
 * MinIO 客户端（运行时读环境变量 + 懒创建客户端）
 * 避免进程启动瞬间未注入变量导致整进程内「永远未配置」；与 Zeabur 等云平台行为对齐。
 */

/** 从若干常见环境变量中取第一个非空的连接主机/URL 原文 */
function resolveMinioEndpointRaw() {
  const keys = [
    'MINIO_ENDPOINT',
    'MINIO_SERVER_URL',
    'MINIO_HOST',
    'MINIO_INTERNAL_HOST',
    'S3_ENDPOINT',
    'AWS_ENDPOINT_URL',
  ];
  for (const k of keys) {
    const t = String(process.env[k] || '').trim();
    if (t) return t;
  }
  return '';
}

/** Bucket 名：兼容多种命名 */
function resolveMinioBucket() {
  const keys = ['MINIO_BUCKET', 'S3_BUCKET', 'AWS_S3_BUCKET', 'BUCKET_NAME'];
  for (const k of keys) {
    const t = String(process.env[k] || '').trim();
    if (t) return t;
  }
  const def = String(process.env.MINIO_DEFAULT_BUCKETS || '').trim();
  if (def) {
    const first = def.split(',')[0].trim();
    if (first) return first;
  }
  return '';
}

function stripTrailingSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

/**
 * 对外访问 URL 前缀（与 putObject 后拼接给前端的规则一致）
 * 若平台只给了「公网主机名」，可配 MINIO_PUBLIC_HOST（无协议时默认补 https://）
 */
function resolveMinioPublicUrlPrefix() {
  const keys = [
    'MINIO_PUBLIC_URL',
    'MINIO_PUBLIC_ENDPOINT',
    'S3_PUBLIC_URL',
    'MINIO_BROWSER_REDIRECT_URL',
    'MINIO_PUBLIC_BASE_URL',
    'MINIO_EXTERNAL_URL',
    'PUBLIC_ASSET_ORIGIN',
    'APP_PUBLIC_URL',
    'ASSET_PUBLIC_BASE_URL',
  ];
  for (const k of keys) {
    const t = String(process.env[k] || '').trim();
    if (t) return stripTrailingSlash(t);
  }
  const hostOnly = String(process.env.MINIO_PUBLIC_HOST || '').trim();
  if (hostOnly) {
    if (/^https?:\/\//i.test(hostOnly)) return stripTrailingSlash(hostOnly);
    return stripTrailingSlash(`https://${hostOnly}`);
  }
  /**
   * Zeabur：后端常只绑定集群内 MINIO_ENDPOINT，公网域名（如 https://minio-storage.zeabur.app）
   * 需在「运行 Node 的后端服务」里单独配 MINIO_PUBLIC_URL。若 S3 连接地址本身就是 https 且主机为 *.zeabur.app，
   * 则与浏览器访问对象同源，可在此自动作为公网前缀，避免漏配 MINIO_PUBLIC_URL。
   */
  const fromZeaburHttpsEndpoint = inferPublicPrefixFromZeaburHttpsEndpoint();
  if (fromZeaburHttpsEndpoint) return fromZeaburHttpsEndpoint;
  return '';
}

/** 当 MINIO_ENDPOINT / S3_ENDPOINT 等为 https://*.zeabur.app 时，用其 origin 作为对象公网前缀 */
function inferPublicPrefixFromZeaburHttpsEndpoint() {
  const raw = resolveMinioEndpointRaw();
  const s = String(raw || '').trim();
  if (!/^https:\/\//i.test(s)) return '';
  try {
    const u = new URL(s);
    if (!/\.zeabur\.app$/i.test(u.hostname)) return '';
    const path = (u.pathname || '').replace(/\/+$/, '');
    if (path && path !== '/') return '';
    return stripTrailingSlash(u.origin);
  } catch {
    return '';
  }
}

/** MinIO SDK 的 endPoint 只要主机名（无协议、无端口） */
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

/**
 * 从连接地址原文解析主机、URL 内端口、是否 HTTPS
 * @returns {{ host: string, portFromUrl: number|null, schemeIsHttps: boolean|null }}
 */
function parseMinioConnectionFromRaw(raw) {
  const s = String(raw || '').trim();
  if (!s) return { host: '', portFromUrl: null, schemeIsHttps: null };
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const p = u.port ? parseInt(u.port, 10) : null;
      return {
        host: u.hostname,
        portFromUrl: Number.isFinite(p) && p > 0 ? p : null,
        schemeIsHttps: u.protocol === 'https:',
      };
    } catch {
      return { host: normalizeMinioEndpoint(s), portFromUrl: null, schemeIsHttps: null };
    }
  }
  return { host: normalizeMinioEndpoint(s), portFromUrl: null, schemeIsHttps: null };
}

export function resolveMinioAccessKey() {
  return String(
      process.env.MINIO_ACCESS_KEY ||
      process.env.MINIO_ROOT_USER ||
      process.env.AWS_ACCESS_KEY_ID ||
      ''
  ).trim();
}

export function resolveMinioSecretKey() {
  return String(
      process.env.MINIO_SECRET_KEY ||
      process.env.MINIO_ROOT_PASSWORD ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      ''
  ).trim();
}

function resolveMinioUseSSLFromParsed(parsed) {
  const v = String(process.env.MINIO_USE_SSL ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (parsed.schemeIsHttps === true) return true;
  if (parsed.schemeIsHttps === false) return false;
  return true;
}

function resolveMinioPortFromParsed(parsed, useSSL) {
  const raw = process.env.MINIO_PORT;
  if (raw != null && String(raw).trim() !== '') {
    const n = parseInt(String(raw).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (parsed.portFromUrl != null && parsed.portFromUrl > 0) return parsed.portFromUrl;
  return useSSL ? 443 : 9000;
}

/**
 * 当前进程环境下的 MinIO 连接与拼接用配置（每次调用重新读 env）
 */
export function getMinioConfig() {
  const rawEp = resolveMinioEndpointRaw();
  const parsed = parseMinioConnectionFromRaw(rawEp);
  const host = String(parsed.host || '').trim();
  const bucket = resolveMinioBucket();
  const publicPrefix = resolveMinioPublicUrlPrefix();
  const accessKey = resolveMinioAccessKey();
  const secretKey = resolveMinioSecretKey();
  const useSSL = resolveMinioUseSSLFromParsed(parsed);
  const port = resolveMinioPortFromParsed(parsed, useSSL);
  return {
    host,
    bucket,
    publicPrefix,
    accessKey,
    secretKey,
    port,
    useSSL,
    rawEndpoint: rawEp,
  };
}

/**
 * 将 images.image_path 等字段规范为浏览器可用的绝对 http(s) URL。
 * 已是绝对地址（含协议相对 //host/...）则补全或原样返回；仅为对象键或含 bucket 前缀的相对路径时按当前 MinIO 公网前缀拼接。
 * 若未配置 MINIO_PUBLIC_URL 等导致无法拼接，则返回原字符串。
 */
export function normalizeImagePathForApi(stored) {
  let raw = String(stored ?? '').trim();
  if (!raw) return raw;
  const qIdx = raw.indexOf('?');
  const pathOnly = qIdx === -1 ? raw : raw.slice(0, qIdx);
  const query = qIdx === -1 ? '' : raw.slice(qIdx);

  if (/^\/\//.test(pathOnly)) {
    raw = `https:${pathOnly}${query}`;
  }
  const qIdx2 = raw.indexOf('?');
  const pathPart = qIdx2 === -1 ? raw : raw.slice(0, qIdx2);
  const query2 = qIdx2 === -1 ? '' : raw.slice(qIdx2);

  if (/^https?:\/\//i.test(pathPart)) {
    return qIdx2 === -1 ? pathPart : `${pathPart}${query2}`;
  }

  const c = getMinioConfig();
  const prefix = stripTrailingSlash(c.publicPrefix || '');
  const bucket = String(c.bucket || '').trim();
  if (!prefix || !bucket) return String(stored ?? '').trim();

  let key = pathPart.replace(/^\/+/, '');
  const bucketPrefix = `${bucket}/`;
  if (key.startsWith(bucketPrefix)) {
    key = key.slice(bucketPrefix.length);
  } else if (key === bucket) {
    key = '';
  }
  if (!key) return String(stored ?? '').trim();

  const abs = `${prefix}/${bucket}/${key}`;
  return `${abs}${query2}`;
}

/** Logo / 图库等上传前校验（运行时） */
export function isMinioEnvReadyForUpload() {
  const c = getMinioConfig();
  return !!(c.host && c.bucket && c.publicPrefix && c.accessKey && c.secretKey);
}

let _cachedClient = null;
let _cacheSig = '';

function clientSignature(c) {
  return [c.host, c.port, c.useSSL, c.accessKey, c.secretKey, process.env.MINIO_REGION || ''].join('\0');
}

export function getMinioClient() {
  const c = getMinioConfig();
  const sig = clientSignature(c);
  if (!_cachedClient || _cacheSig !== sig) {
    const prev = _cacheSig;
    _cacheSig = sig;
    _cachedClient = new Minio.Client({
      endPoint: c.host || '127.0.0.1',
      port: c.port,
      useSSL: c.useSSL,
      accessKey: c.accessKey,
      secretKey: c.secretKey,
      region: String(process.env.MINIO_REGION || process.env.AWS_REGION || 'us-east-1').trim() || 'us-east-1',
    });
    if (!prev || prev !== sig) {
      console.log(
          'MinIO env → raw:',
          c.rawEndpoint || '(empty)',
          'host:',
          c.host || '(empty)',
          'port:',
          c.port,
          'useSSL:',
          c.useSSL,
          'bucket:',
          c.bucket || '(empty)',
          'publicPrefix:',
          c.publicPrefix ? '(set)' : '(empty)'
      );
    }
  }
  return _cachedClient;
}

/** 兼容旧代码：等价于 getMinioClient() */
export const minioClient = new Proxy(
    {},
    {
      get(_t, prop) {
        const real = getMinioClient();
        const v = real[prop];
        return typeof v === 'function' ? v.bind(real) : v;
      },
    }
);

/**
 * 初始化 Bucket（确保 Bucket 存在并设置公开访问策略）
 */
async function initializeBucket() {
  const c = getMinioConfig();
  if (!c.bucket) throw new Error('未配置 MINIO_BUCKET（或等价变量）');
  const client = getMinioClient();
  try {
    const exists = await client.bucketExists(c.bucket);

    if (!exists) {
      await client.makeBucket(c.bucket);
      console.log(`✅ MinIO Bucket "${c.bucket}" 创建成功`);
    } else {
      console.log(`✅ MinIO Bucket "${c.bucket}" 已存在`);
    }

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${c.bucket}/*`],
        },
      ],
    };

    await client.setBucketPolicy(c.bucket, JSON.stringify(policy));
    console.log(`✅ Bucket "${c.bucket}" 公开访问策略已设置`);
  } catch (error) {
    console.error('❌ MinIO Bucket 初始化失败:', error);
    throw error;
  }
}

/**
 * 上传文件到 MinIO
 * @returns {Promise<string>} 公开访问 URL
 */
async function uploadFile(fileBuffer, objectName, contentType = 'application/octet-stream') {
  const c = getMinioConfig();
  if (!c.bucket || !c.publicPrefix) {
    throw new Error(
      'MinIO 未配置完整：需要 bucket 与浏览器可访问的公网前缀。请在运行本后端的 Zeabur 服务环境变量中设置 MINIO_PUBLIC_URL（例如 https://minio-storage.zeabur.app，与对象存储的公网域名一致，不要末尾 /）。' +
        '若 MINIO_ENDPOINT 已是 https://xxx.zeabur.app 且与对外访问同源，可不设 MINIO_PUBLIC_URL；若 ENDPOINT 为集群内地址，则必须单独设置 MINIO_PUBLIC_URL。'
    );
  }
  try {
    const client = getMinioClient();
    await client.putObject(c.bucket, objectName, fileBuffer, null, contentType);

    const publicUrl = normalizeImagePathForApi(`${c.publicPrefix}/${c.bucket}/${objectName}`);

    console.log(`✅ 文件上传成功: ${objectName}`);

    return publicUrl;
  } catch (error) {
    console.error('❌ 文件上传失败:', error);
    throw error;
  }
}

async function deleteFile(objectName) {
  const c = getMinioConfig();
  if (!c.bucket) return;
  try {
    const client = getMinioClient();
    await client.removeObject(c.bucket, objectName);
    console.log(`✅ 文件删除成功: ${objectName}`);
  } catch (error) {
    console.error('❌ 文件删除失败:', error);
    throw error;
  }
}

function getPublicUrl(objectName) {
  const c = getMinioConfig();
  return normalizeImagePathForApi(`${c.publicPrefix}/${c.bucket}/${objectName}`);
}

/**
 * 从公开 URL 解析对象键（用于删除）
 */
export function objectNameFromPublicUrl(fullUrl) {
  const c = getMinioConfig();
  const u = String(fullUrl || '').split('?')[0].trim();
  if (!u || !c.publicPrefix || !c.bucket) return null;
  const base = String(c.publicPrefix).replace(/\/$/, '');
  const pfx = `${base}/${c.bucket}/`;
  if (!u.startsWith(pfx)) return null;
  try {
    return decodeURIComponent(u.slice(pfx.length));
  } catch {
    return u.slice(pfx.length);
  }
}

/** 与历史代码兼容：端口按当前 env 计算 */
export function resolveMinioPort() {
  const c = getMinioConfig();
  return c.port;
}

export { initializeBucket, uploadFile, deleteFile, getPublicUrl };
