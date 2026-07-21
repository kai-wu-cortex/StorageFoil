import assert from 'node:assert/strict';
import test from 'node:test';
import type { InventoryBatch } from '../types.ts';
import {
  cleanupUnreferencedInventoryVersions,
  publishMonth,
  stageInventoryBatches,
} from './inventoryPublisher.ts';

const batch: InventoryBatch = {
  id: 'row-1',
  productModel: 'PL',
  batchCode: 'B-1',
  specification: '',
  shelf: '',
  totalStock: 1,
  inflowQty: 1,
  outflowQty: 0,
  remarks: '',
  dailyActivities: [],
  createdAt: '2026-07-21T00:00:00.000Z',
};

test('publisher stages records under new syncRunId then switches publication pointer', async () => {
  const writes: unknown[] = [];
  const publications = new Map<string, Record<string, unknown>>();
  const collections = {
    inventoryBatches: { bulkWrite: async ops => { writes.push(...ops); return { insertedCount: ops.length }; }, deleteMany: async () => ({ deletedCount: 0 }) },
    inventoryPublications: {
      updateOne: async (filter, update) => {
        publications.set(filter._id, { _id: filter._id, ...update.$set });
        return { acknowledged: true };
      },
      distinct: async () => ['published-run'],
    },
  };

  const staged = await stageInventoryBatches(collections, {
    syncRunId: 'run-new',
    sourceId: 'pl',
    sourceName: 'PL',
    month: '2026-07',
    worksheetId: 7,
    worksheetName: '7月',
    batches: [batch],
  });
  await publishMonth(collections, {
    month: '2026-07',
    syncRunId: 'run-new',
    sourceIds: ['pl'],
    publishedBy: 'admin',
  });

  assert.equal(staged, 1);
  assert.match(JSON.stringify(writes[0]), /run-new:pl:row-1/);
  assert.equal(publications.get('2026-07')?.syncRunId, 'run-new');
});

test('cleanup preserves published syncRunIds', async () => {
  let deletedFilter: unknown;
  const collections = {
    inventoryBatches: { bulkWrite: async () => ({ insertedCount: 0 }), deleteMany: async filter => { deletedFilter = filter; return { deletedCount: 3 }; } },
    inventoryPublications: { updateOne: async () => ({ acknowledged: true }), distinct: async () => ['run-live'] },
  };

  const deleted = await cleanupUnreferencedInventoryVersions(collections, new Date('2026-07-21T00:00:00Z'), 30);

  assert.equal(deleted, 3);
  assert.match(JSON.stringify(deletedFilter), /run-live/);
});
