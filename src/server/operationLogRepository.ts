import { randomUUID } from 'node:crypto';
import type { Collection, CreateIndexesOptions, Filter, IndexSpecification } from 'mongodb';
import type { OperationLogEntry, OperationLogLevel, OperationLogType } from '../shared/syncTypes.ts';
import { COLLECTION_NAMES, type StorageFoilOperationLogDocument } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
import { OPERATION_LOG_RETENTION_SECONDS } from './schemaDefinitions.ts';

export interface OperationLogInput {
  type: OperationLogType;
  level: OperationLogLevel;
  syncRunId?: string;
  sourceId?: string;
  sourceName?: string;
  fileId?: string;
  worksheetId?: number;
  worksheetName?: string;
  month?: string;
  batchCode?: string;
  productModel?: string;
  specification?: string;
  shelf?: string;
  inQty?: number;
  outQty?: number;
  stock?: number;
  sourceRow?: number;
  message: string;
  triggeredBy: string;
  createdAt?: Date;
}

export interface OperationLogQuery {
  limit?: number;
  type?: OperationLogType;
  sourceId?: string;
  month?: string;
  syncRunId?: string;
}

export interface OperationLogCollection {
  insertOne(doc: StorageFoilOperationLogDocument): Promise<unknown>;
  insertMany(docs: StorageFoilOperationLogDocument[], options?: { ordered?: boolean }): Promise<unknown>;
  createIndex?(key: IndexSpecification, options?: CreateIndexesOptions): Promise<string>;
  find(filter: Filter<StorageFoilOperationLogDocument>): {
    sort(sort: Record<string, 1 | -1>): {
      limit(limit: number): {
        toArray(): Promise<StorageFoilOperationLogDocument[]>;
      };
    };
  };
}

async function defaultCollection(): Promise<OperationLogCollection> {
  return await getMongoCollection(COLLECTION_NAMES.operationLogs) as unknown as OperationLogCollection;
}

let retentionIndexPromise: Promise<void> | null = null;

function ensureOperationLogRetentionIndex(collection: OperationLogCollection): Promise<void> {
  if (!collection.createIndex) return Promise.resolve();
  if (!retentionIndexPromise) {
    retentionIndexPromise = collection.createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: OPERATION_LOG_RETENTION_SECONDS,
        name: 'createdAt_7d_ttl',
      },
    ).then(() => undefined).catch(() => undefined);
  }
  return retentionIndexPromise;
}

function cleanString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function cleanNumber(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

export function toOperationLogDocument(input: OperationLogInput): StorageFoilOperationLogDocument {
  const doc = {
    _id: randomUUID(),
    type: input.type,
    level: input.level,
    syncRunId: cleanString(input.syncRunId),
    sourceId: cleanString(input.sourceId),
    sourceName: cleanString(input.sourceName),
    fileId: cleanString(input.fileId),
    worksheetId: cleanNumber(input.worksheetId),
    worksheetName: cleanString(input.worksheetName),
    month: cleanString(input.month),
    batchCode: cleanString(input.batchCode),
    productModel: cleanString(input.productModel),
    specification: cleanString(input.specification),
    shelf: cleanString(input.shelf),
    inQty: cleanNumber(input.inQty),
    outQty: cleanNumber(input.outQty),
    stock: cleanNumber(input.stock),
    sourceRow: cleanNumber(input.sourceRow),
    message: input.message,
    triggeredBy: input.triggeredBy,
    createdAt: input.createdAt || new Date(),
  } as Record<string, unknown>;
  Object.keys(doc).forEach(key => {
    if (doc[key] === undefined) delete doc[key];
  });
  return doc as StorageFoilOperationLogDocument;
}

export function serializeOperationLog(doc: StorageFoilOperationLogDocument): OperationLogEntry {
  return {
    id: doc._id,
    type: doc.type,
    level: doc.level,
    syncRunId: doc.syncRunId,
    sourceId: doc.sourceId,
    sourceName: doc.sourceName,
    fileId: doc.fileId,
    worksheetId: doc.worksheetId,
    worksheetName: doc.worksheetName,
    month: doc.month,
    batchCode: doc.batchCode,
    productModel: doc.productModel,
    specification: doc.specification,
    shelf: doc.shelf,
    inQty: doc.inQty,
    outQty: doc.outQty,
    stock: doc.stock,
    sourceRow: doc.sourceRow,
    message: doc.message,
    triggeredBy: doc.triggeredBy,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function writeOperationLog(
  input: OperationLogInput,
  collectionPromise: Promise<OperationLogCollection> = defaultCollection(),
): Promise<void> {
  try {
    const collection = await collectionPromise;
    void ensureOperationLogRetentionIndex(collection);
    await collection.insertOne(toOperationLogDocument(input));
  } catch {
    // Operation logs must never make WPS sync fail.
  }
}

export async function writeOperationLogs(
  inputs: OperationLogInput[],
  collectionPromise: Promise<OperationLogCollection> = defaultCollection(),
): Promise<void> {
  if (!inputs.length) return;
  try {
    const collection = await collectionPromise;
    void ensureOperationLogRetentionIndex(collection);
    await collection.insertMany(inputs.map(toOperationLogDocument), { ordered: false });
  } catch {
    // Operation logs must never make WPS sync fail.
  }
}

export async function listOperationLogs(
  query: OperationLogQuery = {},
  collectionPromise: Promise<OperationLogCollection> = defaultCollection(),
): Promise<OperationLogEntry[]> {
  const filter: Filter<StorageFoilOperationLogDocument> = {};
  if (query.type) filter.type = query.type;
  if (query.sourceId) filter.sourceId = query.sourceId;
  if (query.month) filter.month = query.month;
  if (query.syncRunId) filter.syncRunId = query.syncRunId;
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
  const collection = await collectionPromise;
  void ensureOperationLogRetentionIndex(collection);
  const docs = await collection.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return docs.map(serializeOperationLog);
}
