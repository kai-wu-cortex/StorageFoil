import type { InventoryBatch } from '../types.ts';

export const STAGED_INVENTORY_RETENTION_SECONDS = 2 * 60 * 60;
export const HTTP_STAGED_INVENTORY_RETENTION_SECONDS = 24 * 60 * 60;

export interface InventoryPublisherCollections {
  inventoryBatches: {
    bulkWrite(ops: unknown[], options?: { ordered?: boolean }): Promise<{ insertedCount?: number; modifiedCount?: number; upsertedCount?: number }>;
    deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount?: number }>;
    updateMany(
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> },
    ): Promise<{ modifiedCount?: number }>;
  };
  inventoryPublications: {
    updateOne(filter: { _id: string }, update: { $set: Record<string, unknown> }, options?: { upsert?: boolean }): Promise<{ acknowledged: boolean }>;
    findOne(filter: { _id: string }): Promise<{ syncRunId: string } | null>;
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
  retentionSeconds?: number;
}

export async function stageInventoryBatches(
  collections: InventoryPublisherCollections,
  input: StageInventoryInput,
  now = new Date(),
): Promise<number> {
  if (!input.batches.length) return 0;
  const retentionSeconds = input.retentionSeconds ?? STAGED_INVENTORY_RETENTION_SECONDS;
  const ops = input.batches.map((batch, index) => {
    const recordKey = batch.id || `${input.worksheetId}:${index}`;
    const productModel = batch.productModel.trim() || input.sourceName;
    return {
      replaceOne: {
        filter: { _id: `${input.syncRunId}:${input.sourceId}:${recordKey}` },
        replacement: {
          ...batch,
          _id: `${input.syncRunId}:${input.sourceId}:${recordKey}`,
          syncRunId: input.syncRunId,
          sourceId: input.sourceId,
          sourceName: input.sourceName,
          productModel,
          month: input.month,
          recordKey,
          worksheetId: input.worksheetId,
          worksheetName: input.worksheetName,
          sourceRow: index + 1,
          syncedAt: now,
          expiresAt: new Date(now.getTime() + retentionSeconds * 1000),
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
  const previousPublication = await collections.inventoryPublications.findOne({ _id: input.month });
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
  await collections.inventoryBatches.updateMany(
    { syncRunId: input.syncRunId, month: input.month },
    { $unset: { expiresAt: '' } },
  );
  if (previousPublication && previousPublication.syncRunId !== input.syncRunId) {
    await collections.inventoryBatches.updateMany(
      {
        syncRunId: previousPublication.syncRunId,
        month: input.month,
      },
      {
        $set: {
          expiresAt: now,
        },
      },
    );
    await collections.inventoryBatches.deleteMany({
      syncRunId: previousPublication.syncRunId,
      month: input.month,
    });
  }
}

export async function cleanupUnreferencedInventoryVersions(
  collections: InventoryPublisherCollections,
  now = new Date(),
  retentionDays = 2,
): Promise<number> {
  const liveRunIds = await collections.inventoryPublications.distinct('syncRunId');
  const filter: Record<string, unknown> = retentionDays > 0
    ? {
        syncRunId: { $nin: liveRunIds },
        syncedAt: { $lt: new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000) },
      }
    : {
        $or: [
          { syncRunId: { $nin: liveRunIds } },
          { expiresAt: { $type: 'date' } },
        ],
      };
  const result = await collections.inventoryBatches.deleteMany(filter);
  return result.deletedCount || 0;
}
