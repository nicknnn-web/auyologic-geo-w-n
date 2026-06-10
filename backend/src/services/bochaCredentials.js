/**
 * 博查密钥：优先 ai_provider_connection（provider_key=bocha），否则 BOCHA_API_KEY 环境变量
 */
import pool from '../db.js';
import { decryptSecret, isEncryptionConfigured } from './credentialCrypto.js';

const DEFAULT_BASE_URL = 'https://api.bocha.cn/v1/web-search';

function strEnv(name, fallback = '') {
  const v = process.env[name];
  return v !== undefined && String(v).trim() !== '' ? String(v).trim() : fallback;
}

export function getBochaApiKeyFromEnv() {
  let key = strEnv('BOCHA_API_KEY');
  if (!key) return '';
  if (/^bearer\s+/i.test(key)) key = key.replace(/^bearer\s+/i, '').trim();
  return key;
}

export function getBochaBaseUrlFromEnv() {
  return strEnv('BOCHA_BASE_URL', DEFAULT_BASE_URL);
}

/**
 * @returns {Promise<{ apiKey: string, baseUrl: string, source: 'db'|'env'|'none' }>}
 */
export async function resolveBochaCredentials(userId) {
  const envKey = getBochaApiKeyFromEnv();
  const envBase = getBochaBaseUrlFromEnv();

  const secret = process.env.AI_CREDENTIALS_SECRET;
  if (!isEncryptionConfigured(secret)) {
    return {
      apiKey: envKey,
      baseUrl: envBase,
      source: envKey ? 'env' : 'none',
    };
  }

  try {
    const { rows } = await pool.query(
      `SELECT api_key_cipher, base_url_override, enabled
       FROM ai_provider_connection
       WHERE provider_key = 'bocha' AND enabled = true
       LIMIT 1`
    );
    const row = rows[0];
    if (row && row.enabled !== false && row.api_key_cipher) {
      const apiKey = decryptSecret(row.api_key_cipher, secret);
      const baseUrl = String(row.base_url_override || '').trim() || envBase;
      if (apiKey) {
        return { apiKey, baseUrl, source: 'db' };
      }
    }
  } catch (e) {
    console.warn('[bocha] resolve credentials:', e.message);
  }

  return {
    apiKey: envKey,
    baseUrl: envBase,
    source: envKey ? 'env' : 'none',
  };
}

export async function isBochaConfiguredForUser(userId) {
  const { apiKey } = await resolveBochaCredentials(userId);
  return !!apiKey;
}
