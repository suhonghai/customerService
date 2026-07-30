import * as crypto from 'crypto';

/**
 * AI API Key 加密工具(AES-256-GCM)
 *
 * 格式:ivHex(32):authTagHex(32):ciphertextHex
 * - iv 16 字节随机
 * - authTag 16 字节(GCM 完整性校验)
 * - 密钥:从 .env 读 AI_API_KEY_ENCRYPT_KEY,必须是 64 个 hex 字符(32 字节)
 *
 * 使用:
 *   const enc = encryptApiKey(plain);
 *   const dec = decryptApiKey(enc);
 *   const masked = maskApiKey(plain);
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 16;
const KEY_HEX_LENGTH = 64; // 32 字节 = 64 hex chars

/**
 * 懒加载密钥(避免启动时强制要求,首调用时校验)
 */
function getKey(): Buffer {
  const hex = process.env.AI_API_KEY_ENCRYPT_KEY || '';
  if (hex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `AI_API_KEY_ENCRYPT_KEY must be ${KEY_HEX_LENGTH} hex chars (32 bytes), got ${hex.length}`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('AI_API_KEY_ENCRYPT_KEY must be valid hex');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * 加密明文 API key
 * @returns iv:tag:ciphertext(都 hex)
 */
export function encryptApiKey(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('encryptApiKey: plain must be non-empty string');
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  let enc = cipher.update(plain, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;
}

/**
 * 解密 API key(内部用,外部接口返脱敏)
 * @throws 格式错误 / tag 校验失败
 */
export function decryptApiKey(encrypted: string): string {
  if (typeof encrypted !== 'string' || encrypted.length === 0) {
    throw new Error('decryptApiKey: encrypted must be non-empty string');
  }
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('decryptApiKey: invalid format (expected iv:tag:ciphertext)');
  }
  const [ivHex, tagHex, enc] = parts;
  if (!ivHex || !tagHex || !enc) {
    throw new Error('decryptApiKey: invalid format (empty parts)');
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

/**
 * 脱敏显示(sk-1234-abcd → sk-****-****-****-1234)
 * 短 key 一律 '****'
 */
export function maskApiKey(plain: string): string {
  if (!plain || plain.length <= 8) return '****';
  if (plain.length <= 12) {
    return `${plain.slice(0, 2)}****${plain.slice(-2)}`;
  }
  return `${plain.slice(0, 3)}-****-****-****-${plain.slice(-4)}`;
}

/**
 * 同步加密(供 seed 等 CLI 场景用,内部已调用)
 */
export function isCryptoReady(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
