import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseAccountManifest,
  provisionStorageFoilUsers,
  type AccountManifestInput,
} from './seedStorageFoilUsers';

function validManifest(): AccountManifestInput {
  return {
    accounts: [
      { username: 'admin', displayName: 'Admin', role: 'admin', passwordEnv: 'SF_ADMIN_PASSWORD' },
      ...Array.from({ length: 10 }, (_, index) => ({
        username: `viewer${index + 1}`,
        displayName: `Viewer ${index + 1}`,
        role: 'viewer' as const,
        passwordEnv: `SF_VIEWER_${index + 1}_PASSWORD`,
      })),
    ],
  };
}

function validEnv(): Record<string, string> {
  return Object.fromEntries(
    validManifest().accounts.map(account => [account.passwordEnv, `${account.username}-secret`]),
  );
}

test('parses exactly ten viewers and one admin without exposing plaintext passwords', () => {
  const parsed = parseAccountManifest(validManifest(), validEnv());

  assert.equal(parsed.accounts.filter(account => account.role === 'viewer').length, 10);
  assert.equal(parsed.accounts.filter(account => account.role === 'admin').length, 1);
  assert.deepEqual(parsed.accounts.map(account => account.username), [
    'admin',
    'viewer1',
    'viewer2',
    'viewer3',
    'viewer4',
    'viewer5',
    'viewer6',
    'viewer7',
    'viewer8',
    'viewer9',
    'viewer10',
  ]);
  assert.equal(JSON.stringify(parsed).includes('viewer1-secret'), false);
});

test('rejects duplicate normalized usernames', () => {
  const manifest = validManifest();
  manifest.accounts[1] = { ...manifest.accounts[1], username: ' Admin ' };

  assert.throws(() => parseAccountManifest(manifest, validEnv()), /Duplicate username/);
});

test('rejects unsupported roles and incorrect account counts', () => {
  const unsupportedRole = validManifest();
  unsupportedRole.accounts[1] = {
    ...unsupportedRole.accounts[1],
    role: 'operator' as 'viewer',
  };
  assert.throws(() => parseAccountManifest(unsupportedRole, validEnv()), /Unsupported role/);

  const missingViewer = validManifest();
  missingViewer.accounts.pop();
  assert.throws(() => parseAccountManifest(missingViewer, validEnv()), /exactly 10 viewer/);

  const extraAdmin = validManifest();
  extraAdmin.accounts.push({
    username: 'admin2',
    displayName: 'Admin 2',
    role: 'admin',
    passwordEnv: 'SF_ADMIN_2_PASSWORD',
  });
  assert.throws(
    () => parseAccountManifest(extraAdmin, { ...validEnv(), SF_ADMIN_2_PASSWORD: 'secret' }),
    /exactly 1 admin/,
  );
});

test('rejects missing password environment variables', () => {
  const env = validEnv();
  delete env.SF_VIEWER_7_PASSWORD;

  assert.throws(() => parseAccountManifest(validManifest(), env), /Missing password env/);
});

test('dry-run reports account actions without writing or hashing passwords', async () => {
  let writes = 0;
  const result = await provisionStorageFoilUsers({
    manifest: validManifest(),
    env: validEnv(),
    dryRun: true,
    resolvedDbName: 'duocloudDB',
    collection: {
      updateOne: async () => {
        writes += 1;
        return { acknowledged: true };
      },
    },
  });

  assert.equal(writes, 0);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.accounts.length, 11);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('apply requires matching confirm-db and upserts all accounts without deleting others', async () => {
  const operations: Array<{ filter: unknown; update: unknown; options: unknown }> = [];

  await assert.rejects(
    () =>
      provisionStorageFoilUsers({
        manifest: validManifest(),
        env: validEnv(),
        dryRun: false,
        resolvedDbName: 'duocloudDB',
        confirmDbName: 'wrongDB',
        collection: {
          updateOne: async () => ({ acknowledged: true }),
        },
      }),
    /--confirm-db duocloudDB/,
  );

  const result = await provisionStorageFoilUsers({
    manifest: validManifest(),
    env: validEnv(),
    dryRun: false,
    resolvedDbName: 'duocloudDB',
    confirmDbName: 'duocloudDB',
    collection: {
      updateOne: async (filter, update, options) => {
        operations.push({ filter, update, options });
        return { acknowledged: true };
      },
    },
  });

  assert.equal(result.mode, 'apply');
  assert.equal(operations.length, 11);
  assert.deepEqual(operations[0].filter, { _id: 'admin' });
  assert.deepEqual(operations[0].options, { upsert: true });
  assert.equal(JSON.stringify(operations).includes('admin-secret'), false);
});
