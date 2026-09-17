import 'dotenv/config';
import type { Collection, Document } from 'mongodb';
import { COLLECTION_NAMES } from '../src/server/collections.ts';
import { closeMongoClient, getMongoDb, resolveMongoDbName } from '../src/server/mongodb.ts';
import { OPERATION_LOG_RETENTION_SECONDS } from '../src/server/schemaDefinitions.ts';

const ONE_DAY_MS = OPERATION_LOG_RETENTION_SECONDS * 1000;
const LEGACY_LOG_TTL_INDEX = 'createdAt_7d_ttl';
const LOG_TTL_INDEX = 'createdAt_1d_ttl';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function describeState(now: Date) {
  const db = await getMongoDb();
  const inventory = db.collection(COLLECTION_NAMES.inventoryBatches);
  const publications = db.collection(COLLECTION_NAMES.inventoryPublications);
  const logs = db.collection(COLLECTION_NAMES.operationLogs);
  const liveRunIds = (await publications.distinct('syncRunId')).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (liveRunIds.length === 0) {
    throw new Error('Safety check failed: no published syncRunId values were found.');
  }

  const staleInventoryFilter = { syncRunId: { $nin: liveRunIds } };
  const currentInventoryFilter = { syncRunId: { $in: liveRunIds } };
  const logCutoff = new Date(now.getTime() - ONE_DAY_MS);
  const staleLogFilter = { createdAt: { $lt: logCutoff } };
  const [inventoryTotal, currentInventory, staleInventory, logsTotal, staleLogs, indexes] =
    await Promise.all([
      inventory.countDocuments(),
      inventory.countDocuments(currentInventoryFilter),
      inventory.countDocuments(staleInventoryFilter),
      logs.countDocuments(),
      logs.countDocuments(staleLogFilter),
      logs.indexes(),
    ]);

  return {
    db,
    inventory,
    logs,
    liveRunIds,
    staleInventoryFilter,
    currentInventoryFilter,
    staleLogFilter,
    report: {
      database: resolveMongoDbName(),
      checkedAt: now.toISOString(),
      logCutoff: logCutoff.toISOString(),
      publishedRunIds: liveRunIds.length,
      counts: { inventoryTotal, currentInventory, staleInventory, logsTotal, staleLogs },
      logTtlIndexes: indexes
        .filter(index => index.key?.createdAt === 1 && index.expireAfterSeconds !== undefined)
        .map(index => ({ name: index.name, expireAfterSeconds: index.expireAfterSeconds })),
    },
  };
}

async function replaceLogTtlIndex(logs: Collection<Document>): Promise<string> {
  const indexes = await logs.indexes();
  for (const index of indexes) {
    if (
      index.name &&
      index.name !== '_id_' &&
      index.key?.createdAt === 1 &&
      index.expireAfterSeconds !== undefined &&
      (index.name === LEGACY_LOG_TTL_INDEX || index.name !== LOG_TTL_INDEX)
    ) {
      await logs.dropIndex(index.name);
    }
  }
  return logs.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: OPERATION_LOG_RETENTION_SECONDS, name: LOG_TTL_INDEX },
  );
}

async function main(): Promise<void> {
  const apply = hasFlag('--apply');
  const now = new Date();
  const before = await describeState(now);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', before: before.report }, null, 2));
  if (!apply) return;

  const currentCountBefore = before.report.counts.currentInventory;
  const deletedInventory = await before.inventory.deleteMany(before.staleInventoryFilter);
  console.log(`Deleted stale inventory snapshots: ${deletedInventory.deletedCount}`);
  const deletedLogs = await before.logs.deleteMany(before.staleLogFilter);
  console.log(`Deleted operation logs older than 24 hours: ${deletedLogs.deletedCount}`);
  const ttlIndex = await replaceLogTtlIndex(before.logs);

  const after = await describeState(now);
  if (after.report.counts.staleInventory !== 0 || after.report.counts.staleLogs !== 0) {
    throw new Error('Post-cleanup verification failed: stale documents remain.');
  }
  if (after.report.counts.currentInventory !== currentCountBefore) {
    throw new Error('Post-cleanup verification failed: current publication count changed.');
  }
  console.log(JSON.stringify({
    result: {
      deletedInventory: deletedInventory.deletedCount,
      deletedLogs: deletedLogs.deletedCount,
      ttlIndex,
      ttlSeconds: OPERATION_LOG_RETENTION_SECONDS,
    },
    after: after.report,
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
