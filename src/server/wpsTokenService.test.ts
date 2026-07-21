import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptSecret } from './secretCrypto.ts';
import {
  WpsTokenNetworkError,
  getValidWpsAccessToken,
  setWpsCredentialsCollectionForTests,
} from './wpsTokenService.ts';

const key = Buffer.alloc(32, 3);

test.afterEach(() => {
  setWpsCredentialsCollectionForTests(null);
});

test('token service wraps token endpoint network failures clearly', async () => {
  setWpsCredentialsCollectionForTests(async () => ({
    findOne: async () => ({
      _id: 'global',
      apiBase: 'https://openapi.wps.cn',
      appId: 'app-id',
      redirectUri: 'https://app.example.com/api/admin/wps/callback',
      appKeyEncrypted: encryptSecret('app-key', key),
      refreshTokenEncrypted: encryptSecret('refresh-token', key),
      updatedAt: new Date(),
      updatedBy: 'admin',
    }),
    updateOne: async () => ({ acknowledged: true }),
  }));

  await assert.rejects(
    () =>
      getValidWpsAccessToken({
        encryptionKey: key,
        fetchImpl: async () => {
          throw new Error('fetch failed client_secret=top-secret');
        },
      }),
    (error: unknown) =>
      error instanceof WpsTokenNetworkError &&
      error.message.includes('fetch failed') &&
      !error.message.includes('top-secret'),
  );
});

test('token service refreshes on every sync request even when access token is still valid', async () => {
  let persisted: Record<string, unknown> | null = null;
  let refreshCalls = 0;
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
    updateOne: async (_filter, update) => {
      persisted = update.$set;
      return { acknowledged: true };
    },
  }));

  const token = await getValidWpsAccessToken({
    encryptionKey: key,
    fetchImpl: async (_url, init) => {
      refreshCalls += 1;
      const body = init?.body?.toString() || '';
      assert.match(body, /grant_type=refresh_token/);
      assert.match(body, /refresh_token=refresh-token/);
      return new Response(
        JSON.stringify({
          access_token: 'access-refreshed',
          refresh_token: 'refresh-rotated',
          expires_in: 3600,
          refresh_expires_in: 7200,
        }),
        { status: 200 },
      );
    },
  });

  assert.equal(token.accessToken, 'access-refreshed');
  assert.equal(refreshCalls, 1);
  assert.ok(persisted?.accessTokenEncrypted);
  assert.ok(persisted?.refreshTokenEncrypted);
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
