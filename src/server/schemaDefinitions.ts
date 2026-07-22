import type { CreateIndexesOptions, Document, IndexSpecification } from 'mongodb';
import { COLLECTION_NAMES } from './collections.ts';

export const STORAGE_FOIL_SCHEMA_VERSION = 1;
export const OPERATION_LOG_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export interface StorageFoilIndexDefinition {
  key: IndexSpecification;
  options?: CreateIndexesOptions;
}

export interface StorageFoilCollectionSchema {
  name: string;
  validator: Document;
  indexes: StorageFoilIndexDefinition[];
}

const encryptedSecretSchema = {
  bsonType: 'object',
  required: ['iv', 'authTag', 'ciphertext'],
  additionalProperties: false,
  properties: {
    iv: { bsonType: 'string' },
    authTag: { bsonType: 'string' },
    ciphertext: { bsonType: 'string' },
  },
};

const fieldConfigSchema = {
  bsonType: 'array',
  maxItems: 20,
  items: {
    bsonType: 'object',
    required: ['fieldId', 'displayName', 'mappedColumn'],
    properties: {
      fieldId: { bsonType: 'string' },
      displayName: { bsonType: 'string' },
      mappedColumn: { bsonType: 'string' },
      required: { bsonType: 'bool' },
    },
  },
};

export const STORAGE_FOIL_COLLECTION_SCHEMAS: StorageFoilCollectionSchema[] = [
  {
    name: COLLECTION_NAMES.users,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'username', 'displayName', 'role', 'enabled', 'password', 'createdAt', 'updatedAt'],
        properties: {
          _id: { bsonType: 'string' },
          username: { bsonType: 'string' },
          displayName: { bsonType: 'string' },
          role: { enum: ['viewer', 'admin'] },
          enabled: { bsonType: 'bool' },
          password: {
            bsonType: 'object',
            required: ['algorithm', 'salt', 'hash'],
            properties: {
              algorithm: { enum: ['scrypt-v1'] },
              salt: { bsonType: 'string' },
              hash: { bsonType: 'string' },
            },
          },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          lastLoginAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [{ key: { username: 1 }, options: { unique: true, name: 'username_unique' } }],
  },
  {
    name: COLLECTION_NAMES.wpsCredentials,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'apiBase', 'appId', 'redirectUri', 'updatedAt', 'updatedBy'],
        properties: {
          _id: { enum: ['global'] },
          apiBase: { bsonType: 'string' },
          appId: { bsonType: 'string' },
          redirectUri: { bsonType: 'string' },
          appKeyEncrypted: encryptedSecretSchema,
          refreshTokenEncrypted: encryptedSecretSchema,
          accessTokenEncrypted: encryptedSecretSchema,
          accessExpiresAt: { bsonType: 'date' },
          refreshExpiresAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          updatedBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [],
  },
  {
    name: COLLECTION_NAMES.syncSources,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          '_id',
          'name',
          'enabled',
          'fileId',
          'worksheetIdStart',
          'worksheetIdEnd',
          'rowFrom',
          'rowTo',
          'colFrom',
          'colTo',
          'fieldConfig',
          'createdAt',
          'updatedAt',
          'updatedBy',
        ],
        properties: {
          _id: { bsonType: 'string' },
          name: { bsonType: 'string' },
          alias: { bsonType: 'string' },
          address: { bsonType: 'string' },
          enabled: { bsonType: 'bool' },
          fileId: { bsonType: 'string' },
          worksheetIdStart: { bsonType: 'int', minimum: 1 },
          worksheetIdEnd: { bsonType: 'int', minimum: 1 },
          rowFrom: { bsonType: 'int', minimum: 1 },
          rowTo: { bsonType: 'int', minimum: 1 },
          colFrom: { bsonType: 'int', minimum: 1 },
          colTo: { bsonType: 'int', minimum: 1 },
          fieldConfig: fieldConfigSchema,
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          updatedBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [{ key: { enabled: 1, name: 1 }, options: { name: 'enabled_name' } }],
  },
  {
    name: COLLECTION_NAMES.syncRuns,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'status', 'trigger', 'triggeredBy', 'idempotencyKey', 'configRevision', 'startedAt', 'sourceResults', 'totals'],
        properties: {
          _id: { bsonType: 'string' },
          status: { enum: ['queued', 'running', 'validated', 'published', 'failed'] },
          trigger: { enum: ['admin', 'webhook'] },
          triggeredBy: { bsonType: 'string' },
          requestedFileId: { bsonType: 'string' },
          idempotencyKey: { bsonType: 'string' },
          configRevision: { bsonType: 'string' },
          startedAt: { bsonType: 'date' },
          finishedAt: { bsonType: 'date' },
          sourceResults: { bsonType: 'array', maxItems: 200 },
          totals: {
            bsonType: 'object',
            required: ['sources', 'worksheets', 'records', 'failures'],
            properties: {
              sources: { bsonType: 'int' },
              worksheets: { bsonType: 'int' },
              records: { bsonType: 'int' },
              failures: { bsonType: 'int' },
            },
          },
          errorSummary: { bsonType: 'string' },
        },
      },
    },
    indexes: [
      { key: { idempotencyKey: 1 }, options: { unique: true, sparse: true, name: 'idempotency_unique' } },
      { key: { status: 1, startedAt: -1 }, options: { name: 'status_startedAt' } },
    ],
  },
  {
    name: COLLECTION_NAMES.inventoryBatches,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'syncRunId', 'sourceId', 'sourceName', 'month', 'recordKey', 'worksheetId', 'worksheetName', 'sourceRow', 'syncedAt'],
        properties: {
          _id: { bsonType: 'string' },
          syncRunId: { bsonType: 'string' },
          sourceId: { bsonType: 'string' },
          sourceName: { bsonType: 'string' },
          month: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}$' },
          recordKey: { bsonType: 'string' },
          dailyActivities: { bsonType: 'array', maxItems: 31 },
          worksheetId: { bsonType: 'int' },
          worksheetName: { bsonType: 'string' },
          sourceRow: { bsonType: 'int' },
          syncedAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      {
        key: { syncRunId: 1, sourceId: 1, recordKey: 1 },
        options: { unique: true, name: 'run_source_record_unique' },
      },
      { key: { syncRunId: 1, month: 1, sourceId: 1 }, options: { name: 'run_month_source' } },
    ],
  },
  {
    name: COLLECTION_NAMES.inventoryPublications,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'month', 'syncRunId', 'publishedAt', 'publishedBy', 'sourceIds'],
        properties: {
          _id: { bsonType: 'string' },
          month: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}$' },
          syncRunId: { bsonType: 'string' },
          publishedAt: { bsonType: 'date' },
          publishedBy: { bsonType: 'string' },
          sourceIds: { bsonType: 'array', maxItems: 200, items: { bsonType: 'string' } },
        },
      },
    },
    indexes: [{ key: { publishedAt: -1 }, options: { name: 'publishedAt' } }],
  },
  {
    name: COLLECTION_NAMES.syncLocks,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'ownerRunId', 'expiresAt', 'acquiredAt'],
        properties: {
          _id: { enum: ['wps-full-sync'] },
          ownerRunId: { bsonType: 'string' },
          expiresAt: { bsonType: 'date' },
          acquiredAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [{ key: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: 'expiresAt_ttl' } }],
  },
  {
    name: COLLECTION_NAMES.operationLogs,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'type', 'level', 'message', 'triggeredBy', 'createdAt'],
        properties: {
          _id: { bsonType: 'string' },
          type: { enum: ['sync_received', 'sync_started', 'source_synced', 'inventory_activity', 'sync_published', 'sync_failed'] },
          level: { enum: ['info', 'success', 'warning', 'error'] },
          syncRunId: { bsonType: 'string' },
          sourceId: { bsonType: 'string' },
          sourceName: { bsonType: 'string' },
          fileId: { bsonType: 'string' },
          worksheetId: { bsonType: 'int' },
          worksheetName: { bsonType: 'string' },
          month: { bsonType: 'string' },
          batchCode: { bsonType: 'string' },
          productModel: { bsonType: 'string' },
          specification: { bsonType: 'string' },
          shelf: { bsonType: 'string' },
          inQty: { bsonType: ['int', 'double'] },
          outQty: { bsonType: ['int', 'double'] },
          stock: { bsonType: ['int', 'double'] },
          sourceRow: { bsonType: 'int' },
          message: { bsonType: 'string' },
          triggeredBy: { bsonType: 'string' },
          createdAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      {
        key: { createdAt: 1 },
        options: {
          expireAfterSeconds: OPERATION_LOG_RETENTION_SECONDS,
          name: 'createdAt_7d_ttl',
        },
      },
      { key: { createdAt: -1 }, options: { name: 'createdAt_desc' } },
      { key: { syncRunId: 1, createdAt: -1 }, options: { name: 'syncRun_createdAt' } },
      { key: { sourceId: 1, month: 1, createdAt: -1 }, options: { name: 'source_month_createdAt' } },
      { key: { type: 1, createdAt: -1 }, options: { name: 'type_createdAt' } },
    ],
  },
];
