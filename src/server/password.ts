import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export interface StoredPassword {
  algorithm: 'scrypt-v1';
  salt: string;
  hash: string;
}

export async function createPasswordHash(password: string): Promise<StoredPassword> {
  const salt = randomBytes(16).toString('base64url');
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return {
    algorithm: 'scrypt-v1',
    salt,
    hash: key.toString('base64url'),
  };
}

export async function verifyPassword(
  password: string,
  stored: StoredPassword,
): Promise<boolean> {
  if (stored.algorithm !== 'scrypt-v1') {
    return false;
  }

  const expected = Buffer.from(stored.hash, 'base64url');
  const actual = (await scrypt(password, stored.salt, expected.length)) as Buffer;
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
