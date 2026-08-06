import assert from 'node:assert/strict';
import test from 'node:test';
import { COLLECTION_NAMES } from './collections.ts';
import {
  INVENTORY_HISTORY_RETENTION_SECONDS,
  OPERATION_LOG_RETENTION_SECONDS,
  STORAGE_FOIL_COLLECTION_SCHEMAS,
  SYNC_RUN_RETENTION_SECONDS,
} from './schemaDefinitions.ts';

test('operation logs declare a seven day TTL index', () => {
  const operationLogsSchema = STORAGE_FOIL_COLLECTION_SCHEMAS.find(
    schema => schema.name === COLLECTION_NAMES.operationLogs,
  );

  assert.ok(operationLogsSchema);
  assert.equal(OPERATION_LOG_RETENTION_SECONDS, 7 * 24 * 60 * 60);
  assert.deepEqual(
    operationLogsSchema.indexes.find(index => index.options?.name === 'createdAt_7d_ttl'),
    {
      key: { createdAt: 1 },
      options: {
        expireAfterSeconds: OPERATION_LOG_RETENTION_SECONDS,
        name: 'createdAt_7d_ttl',
      },
    },
  );
});

test('inventory history and sync runs declare two day TTL indexes', () => {
  const inventorySchema = STORAGE_FOIL_COLLECTION_SCHEMAS.find(
    schema => schema.name === COLLECTION_NAMES.inventoryBatches,
  );
  const syncRunsSchema = STORAGE_FOIL_COLLECTION_SCHEMAS.find(
    schema => schema.name === COLLECTION_NAMES.syncRuns,
  );

  assert.ok(inventorySchema);
  assert.ok(syncRunsSchema);
  assert.equal(INVENTORY_HISTORY_RETENTION_SECONDS, 2 * 24 * 60 * 60);
  assert.equal(SYNC_RUN_RETENTION_SECONDS, 2 * 24 * 60 * 60);
  assert.deepEqual(
    inventorySchema.indexes.find(index => index.options?.name === 'expiresAt_history_2d_ttl'),
    {
      key: { expiresAt: 1 },
      options: {
        expireAfterSeconds: 0,
        name: 'expiresAt_history_2d_ttl',
      },
    },
  );
  assert.deepEqual(
    syncRunsSchema.indexes.find(index => index.options?.name === 'startedAt_2d_ttl'),
    {
      key: { startedAt: 1 },
      options: {
        expireAfterSeconds: SYNC_RUN_RETENTION_SECONDS,
        name: 'startedAt_2d_ttl',
      },
    },
  );
});

test('sync sources allow the zero-based WPS product model column', () => {
  const syncSourcesSchema = STORAGE_FOIL_COLLECTION_SCHEMAS.find(
    schema => schema.name === COLLECTION_NAMES.syncSources,
  );

  assert.ok(syncSourcesSchema);
  const validator = syncSourcesSchema.validator as {
    $jsonSchema: { properties: { colFrom: { minimum: number } } };
  };
  assert.equal(validator.$jsonSchema.properties.colFrom.minimum, 0);
});
