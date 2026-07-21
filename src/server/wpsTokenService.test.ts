import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptSecret } from './secretCrypto.ts';
import {
  getValidWpsAccessToken,
  setWpsCredentialsCollectionForTests,
} from './wpsTokenService.ts';

const key = Buffer.alloc(32, 3);

test.afterEach(() => {
  setWpsCredentialsCollectionForTests(null);
});

test('token service returns non-expired encrypted access token without refreshing', async () => {
  let updateCalled = false;
  setWpsCredentialsCollectionForTests(async () => ({
    findOne: async () => ({
      _id: 'global',
      apiBase: 'https://openapi.wps.cn',
      appId: 'app-id',
      redirectUri: 'https://app.example.com/api/admin/wps/callback',
      appKeyEncrypted: encryptSecret('app-key', key),
      refreshTokenEncrypted: encryptSecret('refresh-token', key),
      accessTokenEncrypted: encryptSecret('access-token', key),
      accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      updatedAt: new Date(),
      updatedBy: 'admin',
    }),
    updateOne: async () => {
      updateCalled = true;
      return { acknowledged: true };
    },
  }));

  const token = await getValidWpsAccessToken({ encryptionKey: key, fetchImpl: async () => new Response(null) });

  assert.equal(token.accessToken, 'access-token');
  assert.equal(updateCalled, false);
});

test('token service refreshes before expiry and persists encrypted rotated tokens', async () => {
  let persisted: Record<string, unknown> | null = null;
  setWpsCredentialsCollectionForTests(async () => ({
    findOne: async () => ({
      _id: 'global',
      apiBase: 'https://openapi.wps.cn',
      appId: 'app-id',
      redirectUri: 'https://app.example.com/api/admin/wps/callback',
      appKeyEncrypted: encryptSecret('app-key', key),
      refreshTokenEncrypted: encryptSecret('refresh-old', key),
      accessTokenEncrypted: encryptSecret('access-old', key),
      accessExpiresAt: new Date(Date.now() + 60 * 1000),
      updatedAt: new Date(),
      updatedBy: 'admin',
    }),
    updateOne: async (_filter, update) => {
      persisted = update.$set;
      return { acknowledged: true };
    },
  }));

  const token = await getValidWpsAccessToken({
    encryptionKey: key,
    fetchImpl: async (_url, init) => {
      const body = init?.body?.toString() || '';
      assert.match(body, /grant_type=refresh_token/);
      assert.match(body, /client_secret=app-key/);
      return new Response(
        JSON.stringify({
          access_token: 'access-new',
          refresh_token: 'refresh-new',
          expires_in: 3600,
          refresh_expires_in: 7200,
        }),
        { status: 200 },
      );
    },
  });

  assert.equal(token.accessToken, 'access-new');
  assert.ok(persisted?.accessTokenEncrypted);
  assert.ok(persisted?.refreshTokenEncrypted);
});
