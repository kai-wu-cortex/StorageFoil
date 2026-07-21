import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { decryptSecret, encryptSecret, resolveEncryptionKey } from './secretCrypto.ts';

test('encrypts and decrypts secrets with AES-256-GCM', () => {
  const key = resolveEncryptionKey(randomBytes(32).toString('base64'));
  const encrypted = encryptSecret('wps-app-key', key);

  assert.equal(decryptSecret(encrypted, key), 'wps-app-key');
  assert.equal(JSON.stringify(encrypted).includes('wps-app-key'), false);
});

test('uses unique IVs and rejects the wrong key', () => {
  const key = resolveEncryptionKey(randomBytes(32).toString('base64'));
  const otherKey = resolveEncryptionKey(randomBytes(32).toString('base64'));
  const first = encryptSecret('same-secret', key);
  const second = encryptSecret('same-secret', key);

  assert.notEqual(first.iv, second.iv);
  assert.throws(() => decryptSecret(first, otherKey), /Unable to decrypt secret/);
});

test('rejects invalid keys and malformed ciphertext', () => {
  assert.throws(() => resolveEncryptionKey('too-short'), /32 bytes/);

  const key = resolveEncryptionKey(randomBytes(32).toString('base64'));
  assert.throws(
    () => decryptSecret({ iv: '', authTag: 'bad', ciphertext: 'bad' }, key),
    /Malformed encrypted secret/,
  );
});
