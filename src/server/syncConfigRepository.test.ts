import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig.ts';
import { decryptSecret, resolveEncryptionKey } from './secretCrypto.ts';
import {
  getPublicSyncConfig,
  updateSyncConfig,
  validateSyncConfigInput,
  type SyncConfigCollections,
} from './syncConfigRepository.ts';

function collections(): SyncConfigCollections & { state: { credentials: unknown; sources: unknown[] } } {
  const state: { credentials: unknown; sources: unknown[] } = {
    credentials: null,
    sources: [],
  };
  return {
    state,
    wpsCredentials: {
      findOne: async () => state.credentials,
      updateOne: async (_filter, update) => {
        state.credentials = { _id: 'global', ...(state.credentials as object | null), ...update.$set };
        return { acknowledged: true };
      },
    },
    syncSources: {
      find: () => ({ sort: () => ({ toArray: async () => state.sources }) }),
      updateOne: async (filter, update) => {
        const existingIndex = state.sources.findIndex(source => (source as { _id: string })._id === filter._id);
        const next = {
          _id: filter._id,
          ...(existingIndex >= 0 ? state.sources[existingIndex] as object : {}),
          ...update.$set,
          ...(existingIndex >= 0 ? {} : update.$setOnInsert),
        };
        if (existingIndex >= 0) state.sources[existingIndex] = next;
        else state.sources.push(next);
        return { acknowledged: true };
      },
      updateMany: async (filter, update) => {
        state.sources = state.sources.map(source =>
          !(filter._id.$nin as string[]).includes((source as { _id: string })._id)
            ? { ...source as object, ...update.$set }
            : source,
        );
        return { acknowledged: true };
      },
      deleteMany: async filter => {
        const before = state.sources.length;
        state.sources = state.sources.filter(source =>
          (filter._id.$nin as string[]).includes((source as { _id: string })._id),
        );
        return { acknowledged: true, deletedCount: before - state.sources.length };
      },
    },
  };
}

function validInput(count = 2) {
  return {
    revision: '',
    credentials: {
      apiBase: 'https://openapi.wps.cn',
      appId: 'app-id',
      appKey: 'new-app-key',
      redirectUri: 'https://storage.example.com/api/admin/wps/callback',
    },
    sources: Array.from({ length: count }, (_, index) => ({
      id: `source-${index + 1}`,
      name: `来源${index + 1}`,
      alias: index === 0 ? 'PL 主表' : '',
      address: index === 0 ? 'https://kdocs.cn/l/pl-file' : '',
      enabled: true,
      fileId: `file-${index + 1}`,
      worksheetIdStart: index % 2 === 0 ? 12 : 1,
      worksheetIdEnd: index % 2 === 0 ? 1 : 12,
      rowFrom: 1,
      rowTo: 300,
      colFrom: 1,
      colTo: 80,
      fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
    })),
  };
}

test('validates unlimited dynamic sources with unique IDs file IDs and normalized ranges', () => {
  const parsed = validateSyncConfigInput(validInput(25));
  assert.equal(parsed.sources.length, 25);
  assert.equal(parsed.sources[0].worksheetIdStart, 1);
  assert.equal(parsed.sources[0].worksheetIdEnd, 12);

  const duplicate = validInput();
  duplicate.sources[1].id = duplicate.sources[0].id;
  assert.throws(() => validateSyncConfigInput(duplicate), /Duplicate source ID/);

  const missingFile = validInput();
  missingFile.sources[0].fileId = '';
  assert.throws(() => validateSyncConfigInput(missingFile), /File ID is required/);
});

test('updates credentials with encrypted secrets and redacts public config', async () => {
  const coll = collections();
  const key = resolveEncryptionKey(randomBytes(32).toString('base64'));

  await updateSyncConfig(coll, validInput(), {
    encryptionKey: key,
    updatedBy: 'admin',
    expectedRevision: '',
  });

  const stored = coll.state.credentials as {
    appKeyEncrypted: { iv: string; authTag: string; ciphertext: string };
  };
  assert.equal(decryptSecret(stored.appKeyEncrypted, key), 'new-app-key');

  const publicConfig = await getPublicSyncConfig(coll);
  assert.equal(publicConfig.credentials.hasAppKey, true);
  assert.equal(JSON.stringify(publicConfig).includes('new-app-key'), false);
  assert.equal(publicConfig.sources.length, 2);
  assert.equal(publicConfig.sources[0].alias, 'PL 主表');
  assert.equal(publicConfig.sources[0].address, 'https://kdocs.cn/l/pl-file');
});

test('returns every saved sync source including disabled sources with aliases', async () => {
  const coll = collections();
  const key = resolveEncryptionKey(randomBytes(32).toString('base64'));
  const input = validInput(3);
  input.sources[1].alias = 'PC 粉箔别名';
  input.sources[2].enabled = false;

  const config = await updateSyncConfig(coll, input, {
    encryptionKey: key,
    updatedBy: 'admin',
    expectedRevision: '',
  });

  assert.equal(config.sources.length, 3);
  assert.equal(config.sources[1].alias, 'PC 粉箔别名');
  assert.equal(config.sources[2].enabled, false);
});

test('preserves existing secrets and rejects stale revisions', async () => {
  const coll = collections();
  const key = resolveEncryptionKey(randomBytes(32).toString('base64'));
  const first = await updateSyncConfig(coll, validInput(), {
    encryptionKey: key,
    updatedBy: 'admin',
    expectedRevision: '',
  });

  const storedBefore = (coll.state.credentials as { appKeyEncrypted: unknown }).appKeyEncrypted;
  const next = validInput();
  delete (next.credentials as { appKey?: string }).appKey;
  await updateSyncConfig(coll, next, {
    encryptionKey: key,
    updatedBy: 'admin',
    expectedRevision: first.revision,
  });
  assert.deepEqual((coll.state.credentials as { appKeyEncrypted: unknown }).appKeyEncrypted, storedBefore);

  await assert.rejects(
    () =>
      updateSyncConfig(coll, validInput(), {
        encryptionKey: key,
        updatedBy: 'admin',
        expectedRevision: 'stale',
      }),
    /CONFIG_CONFLICT/,
  );
});

test('source-only updates preserve existing WPS App ID redirect and App Key', async () => {
  const coll = collections();
  const key = resolveEncryptionKey(randomBytes(32).toString('base64'));
  const first = await updateSyncConfig(coll, validInput(), {
    encryptionKey: key,
    updatedBy: 'admin',
    expectedRevision: '',
  });

  const storedBefore = coll.state.credentials as {
    appId: string;
    apiBase: string;
    redirectUri: string;
    appKeyEncrypted: { iv: string; authTag: string; ciphertext: string };
  };
  const sourceOnly = validInput();
  sourceOnly.credentials = {} as typeof sourceOnly.credentials;
  sourceOnly.sources[0].alias = '只更新来源';

  await updateSyncConfig(coll, sourceOnly, {
    encryptionKey: key,
    updatedBy: 'admin',
    expectedRevision: first.revision,
  });

  const storedAfter = coll.state.credentials as typeof storedBefore;
  assert.equal(storedAfter.appId, 'app-id');
  assert.equal(storedAfter.apiBase, 'https://openapi.wps.cn');
  assert.equal(storedAfter.redirectUri, 'https://storage.example.com/api/admin/wps/callback');
  assert.equal(decryptSecret(storedAfter.appKeyEncrypted, key), 'new-app-key');
});

test('source updates delete removed source documents instead of disabling them', async () => {
  const coll = collections();
  const key = resolveEncryptionKey(randomBytes(32).toString('base64'));
  const first = await updateSyncConfig(coll, validInput(3), {
    encryptionKey: key,
    updatedBy: 'admin',
    expectedRevision: '',
  });

  const next = validInput(2);
  next.credentials = {} as typeof next.credentials;
  await updateSyncConfig(coll, next, {
    encryptionKey: key,
    updatedBy: 'admin',
    expectedRevision: first.revision,
  });

  const publicConfig = await getPublicSyncConfig(coll);
  assert.deepEqual(publicConfig.sources.map(source => source.id), ['source-1', 'source-2']);
});
