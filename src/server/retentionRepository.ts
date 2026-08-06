import type { Db } from 'mongodb';
import { COLLECTION_NAMES } from './collections.ts';
import { getMongoDb, resolveMongoDbName } from './mongodb.ts';
import {
  INVENTORY_HISTORY_RETENTION_SECONDS,
  OPERATION_LOG_RETENTION_SECONDS,
  SYNC_RUN_RETENTION_SECONDS,
} from './schemaDefinitions.ts';

function subtractSeconds(now: Date, seconds: number): Date {
  return new Date(now.getTime() - seconds * 1000);
}

async function retentionContext(db: Db, now: Date) {
  const inventoryBatches = db.collection(COLLECTION_NAMES.inventoryBatches);
  const inventoryPublications = db.collection(COLLECTION_NAMES.inventoryPublications);
  const syncRuns = db.collection(COLLECTION_NAMES.syncRuns);
  const operationLogs = db.collection(COLLECTION_NAMES.operationLogs);
  const liveRunIds = (await inventoryPublications.distinct('syncRunId')).filter(Boolean);
  const cutoffs = {
    inventoryHistory: subtractSeconds(now, INVENTORY_HISTORY_RETENTION_SECONDS),
    syncRuns: subtractSeconds(now, SYNC_RUN_RETENTION_SECONDS),
    operationLogs: subtractSeconds(now, OPERATION_LOG_RETENTION_SECONDS),
  };
  return {
    collections: { inventoryBatches, syncRuns, operationLogs },
    liveRunIds,
    cutoffs,
    filters: {
      staleInventory: {
        syncRunId: { $nin: liveRunIds },
        syncedAt: { $lt: cutoffs.inventoryHistory },
      },
      recentHistoricalInventory: {
        syncRunId: { $nin: liveRunIds },
        syncedAt: { $gte: cutoffs.inventoryHistory },
        expiresAt: { $exists: false },
      },
      staleSyncRuns: { startedAt: { $lt: cutoffs.syncRuns } },
      staleOperationLogs: { createdAt: { $lt: cutoffs.operationLogs } },
    },
  };
}

export async function inspectStorageFoilRetention(
  db?: Db,
  now = new Date(),
) {
  const database = db ?? await getMongoDb();
  const context = await retentionContext(database, now);
  const { inventoryBatches, syncRuns, operationLogs } = context.collections;
  const dbStats = await database.command({
    dbStats: 1,
    scale: 1024 * 1024,
    freeStorage: 1,
  });
  return {
    database: resolveMongoDbName(),
    now: now.toISOString(),
    storageMb: {
      dataSize: Number(dbStats.dataSize || 0),
      storageSize: Number(dbStats.storageSize || 0),
      indexSize: Number(dbStats.indexSize || 0),
      totalSize: Number(dbStats.totalSize || 0),
      freeStorageSize: Number(dbStats.freeStorageSize || 0),
    },
    cutoffs: {
      inventoryHistory: context.cutoffs.inventoryHistory.toISOString(),
      syncRuns: context.cutoffs.syncRuns.toISOString(),
      operationLogs: context.cutoffs.operationLogs.toISOString(),
    },
    counts: {
      inventoryBatches: await inventoryBatches.estimatedDocumentCount(),
      staleInventoryBatches: await inventoryBatches.countDocuments(context.filters.staleInventory),
      recentHistoricalInventoryBatches: await inventoryBatches.countDocuments(
        context.filters.recentHistoricalInventory,
      ),
      syncRuns: await syncRuns.estimatedDocumentCount(),
      staleSyncRuns: await syncRuns.countDocuments(context.filters.staleSyncRuns),
      operationLogs: await operationLogs.estimatedDocumentCount(),
      staleOperationLogs: await operationLogs.countDocuments(context.filters.staleOperationLogs),
      publishedRunIds: context.liveRunIds.length,
    },
  };
}

export async function applyStorageFoilRetention(
  db?: Db,
  now = new Date(),
) {
  const database = db ?? await getMongoDb();
  const before = await inspectStorageFoilRetention(database, now);
  const context = await retentionContext(database, now);
  const { inventoryBatches, syncRuns, operationLogs } = context.collections;

  // Atlas permits deletions while a cluster is over quota, but blocks index
  // creation and updates. Reclaim space first so the retention indexes can be
  // installed even when this maintenance job is repairing a full cluster.
  const deletedInventory = await inventoryBatches.deleteMany(context.filters.staleInventory);
  const deletedSyncRuns = await syncRuns.deleteMany(context.filters.staleSyncRuns);
  const deletedOperationLogs = await operationLogs.deleteMany(context.filters.staleOperationLogs);
  const markedInventory = await inventoryBatches.updateMany(
    context.filters.recentHistoricalInventory,
    [{
      $set: {
        expiresAt: {
          $dateAdd: {
            startDate: '$syncedAt',
            unit: 'second',
            amount: INVENTORY_HISTORY_RETENTION_SECONDS,
          },
        },
      },
    }],
  );

  const indexNames = await Promise.all([
    inventoryBatches.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'expiresAt_history_2d_ttl' },
    ),
    syncRuns.createIndex(
      { startedAt: 1 },
      { expireAfterSeconds: SYNC_RUN_RETENTION_SECONDS, name: 'startedAt_2d_ttl' },
    ),
    operationLogs.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: OPERATION_LOG_RETENTION_SECONDS, name: 'createdAt_7d_ttl' },
    ),
  ]);

  const after = await inspectStorageFoilRetention(database, now);
  return {
    before,
    appliedIndexes: indexNames,
    deleted: {
      inventoryBatches: deletedInventory.deletedCount,
      syncRuns: deletedSyncRuns.deletedCount,
      operationLogs: deletedOperationLogs.deletedCount,
    },
    markedForInventoryTtl: markedInventory.modifiedCount,
    after,
  };
}
