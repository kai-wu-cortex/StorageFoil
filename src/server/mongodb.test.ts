import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COLLECTION_NAMES,
  STORAGE_FOIL_COLLECTION_PREFIX,
  getStorageFoilCollections,
} from './collections.ts';
import {
  createMongoRuntime,
  resolveMongoDbName,
  resolveMongoUris,
  sanitizeMongoError,
} from './mongodb.ts';

test('resolves Mongo URI priority without leaking secret values', () => {
  assert.deepEqual(
    resolveMongoUris({
      MONGODB_URI: 'mongodb+srv://user:password@cluster.example/db',
      MONGODB_DIRECT_URI: 'mongodb://direct.example/db',
    }),
    {
      primaryUri: 'mongodb+srv://user:password@cluster.example/db',
      fallbackUri: 'mongodb://direct.example/db',
    },
  );

  assert.deepEqual(resolveMongoUris({ MONGODB_DIRECT_URI: 'mongodb://direct.example/db' }), {
    primaryUri: 'mongodb://direct.example/db',
    fallbackUri: undefined,
  });

  assert.throws(
    () => resolveMongoUris({}),
    error => error instanceof Error && !error.message.includes('password'),
  );
});

test('resolves the StorageFoil database name with Duo Cloud fallback', () => {
  assert.equal(resolveMongoDbName({ STORAGE_FOIL_DB_NAME: 'storageFoil' }), 'storageFoil');
  assert.equal(resolveMongoDbName({ KNOWLEDGE_DB_NAME: 'duocloudDB' }), 'duocloudDB');
  assert.equal(resolveMongoDbName({}), 'duocloudDB');
});

test('caches the client promise, attaches the database pool, and resets after failure', async () => {
  const attempts: string[] = [];
  const attached: unknown[] = [];
  const clients = new Map<string, { uri: string; close: () => Promise<void> }>();
  const runtime = createMongoRuntime({
    env: {
      MONGODB_URI: 'mongodb+srv://primary.example/db',
      MONGODB_DIRECT_URI: 'mongodb://direct.example/db',
    },
    attachPool: client => attached.push(client),
    createClient: (uri, options) => {
      assert.equal(options.serverSelectionTimeoutMS, 8000);
      const client = {
        uri,
        connect: async () => {
          attempts.push(uri);
          if (uri.includes('primary')) {
            throw new Error(`failed ${uri}`);
          }
          return client;
        },
        close: async () => undefined,
        db: (name: string) => ({ name, collection: (collectionName: string) => collectionName }),
      };
      clients.set(uri, client);
      return client;
    },
  });

  const first = await runtime.getMongoClient();
  const second = await runtime.getMongoClient();

  assert.equal(first, second);
  assert.deepEqual(attempts, ['mongodb+srv://primary.example/db', 'mongodb://direct.example/db']);
  assert.equal(attached.length, 2);
  assert.equal(first, clients.get('mongodb://direct.example/db'));

  const failingRuntime = createMongoRuntime({
    env: { MONGODB_URI: 'mongodb+srv://primary.example/db' },
    attachPool: () => undefined,
    createClient: uri => ({
      connect: async () => {
        attempts.push(uri);
        throw new Error('network timeout');
      },
      close: async () => undefined,
      db: (name: string) => ({ name, collection: (collectionName: string) => collectionName }),
    }),
  });

  await assert.rejects(() => failingRuntime.getMongoClient(), /network timeout/);
  await assert.rejects(() => failingRuntime.getMongoClient(), /network timeout/);
  assert.equal(attempts.filter(uri => uri === 'mongodb+srv://primary.example/db').length, 3);
});

test('keeps collection names prefixed and exposes typed getters', () => {
  assert.equal(STORAGE_FOIL_COLLECTION_PREFIX, 'storage_foil_');
  assert.deepEqual(Object.values(COLLECTION_NAMES).sort(), [
    'storage_foil_inventory_batches',
    'storage_foil_inventory_publications',
    'storage_foil_sync_locks',
    'storage_foil_sync_runs',
    'storage_foil_sync_sources',
    'storage_foil_users',
    'storage_foil_wps_credentials',
  ]);

  const requested: string[] = [];
  const collections = getStorageFoilCollections({
    collection: (name: string) => {
      requested.push(name);
      return { name };
    },
  });

  assert.deepEqual(
    Object.values(collections).map(collection => collection.name),
    Object.values(COLLECTION_NAMES),
  );
  assert.deepEqual(requested, Object.values(COLLECTION_NAMES));
});

test('sanitizes Mongo errors before exposing messages', () => {
  const sanitized = sanitizeMongoError(
    new Error('could not connect mongodb+srv://user:password@cluster.example/db'),
  );

  assert.equal(sanitized.message.includes('password'), false);
  assert.equal(sanitized.message.includes('user'), false);
  assert.match(sanitized.message, /<redacted-mongodb-uri>/);
});
