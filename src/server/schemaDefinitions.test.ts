import assert from 'node:assert/strict';
import test from 'node:test';
import { COLLECTION_NAMES } from './collections.ts';
import {
  OPERATION_LOG_RETENTION_SECONDS,
  STORAGE_FOIL_COLLECTION_SCHEMAS,
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
