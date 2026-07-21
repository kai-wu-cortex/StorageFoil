import type { InventoryBatch } from '../types.ts';

export interface InventoryPublisherCollections {
  inventoryBatches: {
    bulkWrite(ops: unknown[], options?: { ordered?: boolean }): Promise<{ insertedCount?: number; modifiedCount?: number; upsertedCount?: number }>;
    deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount?: number }>;
  };
  inventoryPublications: {
    updateOne(filter: { _id: string }, update: { $set: Record<string, unknown> }, options?: { upsert?: boolean }): Promise<{ acknowledged: boolean }>;
    distinct(field: string): Promise<string[]>;
  };
}

export interface StageInventoryInput {
  syncRunId: string;
  sourceId: string;
  sourceName: string;
  month: string;
  worksheetId: number;
  worksheetName: string;
  batches: InventoryBatch[];
}

export async function stageInventoryBatches(
  collections: InventoryPublisherCollections,
  input: StageInventoryInput,
  now = new Date(),
): Promise<number> {
  if (!input.batches.length) return 0;
  const ops = input.batches.map((batch, index) => {
    const recordKey = batch.id || `${input.worksheetId}:${index}`;
    return {
      replaceOne: {
        filter: { _id: `${input.syncRunId}:${input.sourceId}:${recordKey}` },
        replacement: {
          ...batch,
          _id: `${input.syncRunId}:${input.sourceId}:${recordKey}`,
          syncRunId: input.syncRunId,
          sourceId: input.sourceId,
          sourceName: input.sourceName,
          month: input.month,
          recordKey,
          worksheetId: input.worksheetId,
          worksheetName: input.worksheetName,
          sourceRow: index + 1,
          syncedAt: now,
          createdAt: new Date(batch.createdAt),
        },
        upsert: true,
      },
    };
  });
  await collections.inventoryBatches.bulkWrite(ops, { ordered: false });
  return input.batches.length;
}

export async function publishMonth(
  collections: InventoryPublisherCollections,
  input: { month: string; syncRunId: string; sourceIds: string[]; publishedBy: string },
  now = new Date(),
): Promise<void> {
  await collections.inventoryPublications.updateOne(
    { _id: input.month },
    {
      $set: {
        month: input.month,
        syncRunId: input.syncRunId,
        sourceIds: input.sourceIds,
        publishedBy: input.publishedBy,
        publishedAt: now,
      },
    },
    { upsert: true },
  );
}

export async function cleanupUnreferencedInventoryVersions(
  collections: InventoryPublisherCollections,
  now = new Date(),
  retentionDays = 30,
): Promise<number> {
  const liveRunIds = await collections.inventoryPublications.distinct('syncRunId');
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await collections.inventoryBatches.deleteMany({
    syncRunId: { $nin: liveRunIds },
    syncedAt: { $lt: cutoff },
  });
  return result.deletedCount || 0;
}
