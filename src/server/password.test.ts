import assert from 'node:assert/strict';
import test from 'node:test';
import { createPasswordHash, verifyPassword } from './password.ts';

test('creates scrypt-v1 password records with random salts', async () => {
  const first = await createPasswordHash('secret');
  const second = await createPasswordHash('secret');

  assert.equal(first.algorithm, 'scrypt-v1');
  assert.equal(first.salt.length > 0, true);
  assert.equal(first.hash.length > 0, true);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
});

test('verifies passwords in constant algorithm format only', async () => {
  const stored = await createPasswordHash('secret');

  assert.equal(await verifyPassword('secret', stored), true);
  assert.equal(await verifyPassword('wrong', stored), false);
  assert.equal(
    await verifyPassword('secret', { algorithm: 'sha256' as 'scrypt-v1', salt: stored.salt, hash: stored.hash }),
    false,
  );
});
