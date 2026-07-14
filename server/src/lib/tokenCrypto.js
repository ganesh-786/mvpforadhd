import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error('GOOGLE_TOKEN_ENC_KEY is not configured on the server.');
  }
  // Accepts a 32-byte key expressed as base64 (openssl rand -base64 32).
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENC_KEY must decode to exactly 32 bytes (base64 of `openssl rand -base64 32`).');
  }
  return key;
}

/** Encrypts a refresh token for storage; returns iv:authTag:ciphertext, all base64. */
export function encryptToken(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

/** Reverses encryptToken(). Throws if the ciphertext was tampered with or the key is wrong. */
export function decryptToken(packed) {
  const key = getKey();
  const [ivB64, authTagB64, dataB64] = packed.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
