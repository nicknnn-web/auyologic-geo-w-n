/**
 * API Key 对称加密（AES-256-GCM），服务端仅存密文。
 * 依赖环境变量 AI_CREDENTIALS_SECRET（建议 32+ 字符随机串）。
 */
import crypto from 'crypto';

const IV_LEN = 12; // GCM 推荐 12
const AUTH_TAG_LEN = 16;
const SCRYPT_SALT = 'auyo-ai-cred-v1';

function getKey(secret) {
  if (!secret || String(secret).length < 16) {
    throw new Error('AI_CREDENTIALS_SECRET 未配置或过短（至少 16 字符）');
  }
  return crypto.scryptSync(String(secret), SCRYPT_SALT, 32);
}

/**
 * @param {string} plain
 * @param {string} secret - process.env.AI_CREDENTIALS_SECRET
 * @returns {string} base64 (iv + tag + ciphertext)
 */
export function encryptSecret(plain, secret) {
  if (plain == null || plain === '') {
    throw new Error('待加密内容不能为空');
  }
  const key = getKey(secret);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * @param {string} cipherB64
 * @param {string} secret
 * @returns {string}
 */
export function decryptSecret(cipherB64, secret) {
  if (!cipherB64) return '';
  const buf = Buffer.from(String(cipherB64), 'base64');
  if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
    throw new Error('密文格式无效');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const data = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const key = getKey(secret);
  const dec = crypto.createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(data), dec.final()]).toString('utf8');
}

export function isEncryptionConfigured(secret) {
  return !!secret && String(secret).length >= 16;
}
