import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiFailure,
  createApiSuccess,
  isStorageFoilRole,
  normalizeWorksheetRange,
  parseInventoryMonth,
  toPublicSyncConfig,
} from './apiTypes.ts';

test('accepts only StorageFoil viewer and admin roles', () => {
  assert.equal(isStorageFoilRole('viewer'), true);
  assert.equal(isStorageFoilRole('admin'), true);
  assert.equal(isStorageFoilRole('operator'), false);
  assert.equal(isStorageFoilRole(''), false);
  assert.equal(isStorageFoilRole(null), false);
});

test('creates typed API success and failure envelopes', () => {
  assert.deepEqual(createApiSuccess({ month: '2026-07' }), {
    success: true,
    data: { month: '2026-07' },
  });

  assert.deepEqual(createApiFailure('BAD_MONTH', 'Invalid month', 'req-123'), {
    success: false,
    error: { code: 'BAD_MONTH', requestId: 'req-123' },
    message: 'Invalid month',
  });
});

test('validates inventory months as YYYY-MM with a real month number', () => {
  assert.equal(parseInventoryMonth('2026-01'), '2026-01');
  assert.equal(parseInventoryMonth('2026-12'), '2026-12');

  assert.throws(() => parseInventoryMonth('2026-00'), /Invalid inventory month/);
  assert.throws(() => parseInventoryMonth('2026-13'), /Invalid inventory month/);
  assert.throws(() => parseInventoryMonth('2026-7'), /Invalid inventory month/);
});

test('normalizes worksheet ranges without allowing an unbounded scan', () => {
  assert.deepEqual(normalizeWorksheetRange(12, 1), {
    worksheetIdStart: 1,
    worksheetIdEnd: 12,
  });

  assert.deepEqual(normalizeWorksheetRange('2', '7'), {
    worksheetIdStart: 2,
    worksheetIdEnd: 7,
  });

  assert.throws(() => normalizeWorksheetRange(0, 12), /Invalid worksheet range/);
  assert.throws(() => normalizeWorksheetRange(1, 200), /Invalid worksheet range/);
  assert.throws(() => normalizeWorksheetRange(1.5, 12), /Invalid worksheet range/);
});

test('omits secret fields from the public sync configuration', () => {
  const publicConfig = toPublicSyncConfig({
    credentials: {
      apiBase: 'https://openapi.wps.cn',
      appId: 'app-id',
      appKeyEncrypted: { iv: 'iv', authTag: 'tag', ciphertext: 'secret-app-key' },
      redirectUri: 'https://storage.example.com/api/admin/wps/callback',
      refreshTokenEncrypted: { iv: 'iv', authTag: 'tag', ciphertext: 'secret-refresh' },
      accessTokenEncrypted: { iv: 'iv', authTag: 'tag', ciphertext: 'secret-access' },
      accessExpiresAt: '2026-07-21T00:00:00.000Z',
      refreshExpiresAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      updatedBy: 'admin',
    },
    sources: [
      {
        id: 'pl',
        name: 'PL',
        enabled: true,
        fileId: 'file-pl',
        worksheetIdStart: 1,
        worksheetIdEnd: 12,
        rowFrom: 1,
        rowTo: 300,
        colFrom: 1,
        colTo: 80,
        fieldConfig: [],
        updatedAt: '2026-07-20T00:00:00.000Z',
        updatedBy: 'admin',
      },
    ],
  });

  assert.deepEqual(publicConfig.credentials, {
    apiBase: 'https://openapi.wps.cn',
    appId: 'app-id',
    redirectUri: 'https://storage.example.com/api/admin/wps/callback',
    hasAppKey: true,
    hasRefreshToken: true,
    accessExpiresAt: '2026-07-21T00:00:00.000Z',
    refreshExpiresAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    updatedBy: 'admin',
  });
  assert.equal(JSON.stringify(publicConfig).includes('secret'), false);
});
