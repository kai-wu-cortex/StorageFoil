import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedSecret } from '../shared/syncTypes.ts';

function decodeKey(value: string): Buffer {
  for (const encoding of ['base64', 'hex'] as const) {
    const decoded = Buffer.from(value, encoding);
    if (decoded.length === 32) return decoded;
  }
  return Buffer.from(value, 'utf8');
}

export function resolveEncryptionKey(value = process.env.STORAGE_FOIL_CONFIG_ENCRYPTION_KEY || ''): Buffer {
  const key = decodeKey(value);
  if (key.length !== 32) {
    throw new Error('STORAGE_FOIL_CONFIG_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

export function decryptSecret(secret: EncryptedSecret, key: Buffer): string {
  if (!secret.iv || !secret.authTag || !secret.ciphertext) {
    throw new Error('Malformed encrypted secret.');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Unable to decrypt secret.');
  }
}
