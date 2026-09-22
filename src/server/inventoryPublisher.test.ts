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
  const updates: unknown[] = [];
  const deletions: unknown[] = [];
  const publications = new Map<string, Record<string, unknown>>();
  const collections = {
    inventoryBatches: {
      bulkWrite: async ops => { writes.push(...ops); return { insertedCount: ops.length }; },
      deleteMany: async filter => { deletions.push(filter); return { deletedCount: 1 }; },
      updateMany: async (filter, update) => { updates.push({ filter, update }); return { modifiedCount: 1 }; },
    },
    inventoryPublications: {
      findOne: async () => ({ syncRunId: 'run-old' }),
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
  }, new Date('2026-07-21T00:00:00.000Z'));
  await publishMonth(collections, {
    month: '2026-07',
    syncRunId: 'run-new',
    sourceIds: ['pl'],
    publishedBy: 'admin',
  }, new Date('2026-09-18T00:00:00.000Z'));

  assert.equal(staged, 1);
  const replacement = (writes[0] as { replaceOne: { replacement: Record<string, unknown> } }).replaceOne.replacement;
  assert.equal(replacement._id, 'run-new:pl:row-1');
  assert.equal((replacement.expiresAt as Date).toISOString(), '2026-07-21T02:00:00.000Z');
  assert.equal(publications.get('2026-07')?.syncRunId, 'run-new');
  assert.deepEqual(updates[0], {
    filter: { syncRunId: 'run-new', month: '2026-07' },
    update: { $unset: { expiresAt: '' } },
  });
  assert.deepEqual(updates[1], {
    filter: { syncRunId: 'run-old', month: '2026-07' },
    update: { $set: { expiresAt: new Date('2026-09-18T00:00:00.000Z') } },
  });
  assert.deepEqual(deletions[0], { syncRunId: 'run-old', month: '2026-07' });
});

test('publisher falls back to source name when product model is missing', async () => {
  const writes: unknown[] = [];
  const collections = {
    inventoryBatches: {
      bulkWrite: async ops => { writes.push(...ops); return { insertedCount: ops.length }; },
      deleteMany: async () => ({ deletedCount: 0 }),
      updateMany: async () => ({ modifiedCount: 0 }),
    },
    inventoryPublications: { findOne: async () => null, updateOne: async () => ({ acknowledged: true }), distinct: async () => [] },
  };

  await stageInventoryBatches(collections, {
    syncRunId: 'run-new',
    sourceId: 'pc',
    sourceName: 'PC',
    month: '2026-07',
    worksheetId: 7,
    worksheetName: '7月',
    batches: [{ ...batch, productModel: '' }],
  });

  const replacement = (writes[0] as { replaceOne: { replacement: InventoryBatch } }).replaceOne.replacement;
  assert.equal(replacement.productModel, 'PC');
});

test('publisher uses the requested retention period for HTTP staged inventory', async () => {
  const writes: unknown[] = [];
  const collections = {
    inventoryBatches: {
      bulkWrite: async ops => { writes.push(...ops); return { insertedCount: ops.length }; },
      deleteMany: async () => ({ deletedCount: 0 }),
      updateMany: async () => ({ modifiedCount: 0 }),
    },
    inventoryPublications: { findOne: async () => null, updateOne: async () => ({ acknowledged: true }), distinct: async () => [] },
  };

  await stageInventoryBatches(collections, {
    syncRunId: 'run-http',
    sourceId: 'pc',
    sourceName: 'PC',
    month: '2026-09',
    worksheetId: 9,
    worksheetName: '9月',
    batches: [batch],
    retentionSeconds: 24 * 60 * 60,
  }, new Date('2026-09-22T00:00:00.000Z'));

  const replacement = (writes[0] as { replaceOne: { replacement: Record<string, unknown> } }).replaceOne.replacement;
  assert.equal((replacement.expiresAt as Date).toISOString(), '2026-09-23T00:00:00.000Z');
});

test('cleanup preserves published syncRunIds', async () => {
  let deletedFilter: unknown;
  const collections = {
    inventoryBatches: {
      bulkWrite: async () => ({ insertedCount: 0 }),
      deleteMany: async filter => { deletedFilter = filter; return { deletedCount: 3 }; },
      updateMany: async () => ({ modifiedCount: 0 }),
    },
    inventoryPublications: { findOne: async () => null, updateOne: async () => ({ acknowledged: true }), distinct: async () => ['run-live'] },
  };

  const deleted = await cleanupUnreferencedInventoryVersions(collections, new Date('2026-07-21T00:00:00Z'), 30);

  assert.equal(deleted, 3);
  assert.match(JSON.stringify(deletedFilter), /run-live/);
});

test('immediate cleanup deletes every unreferenced run without an age cutoff', async () => {
  let deletedFilter: Record<string, unknown> | undefined;
  const collections = {
    inventoryBatches: {
      bulkWrite: async () => ({ insertedCount: 0 }),
      deleteMany: async (filter: Record<string, unknown>) => { deletedFilter = filter; return { deletedCount: 9 }; },
      updateMany: async () => ({ modifiedCount: 0 }),
    },
    inventoryPublications: { findOne: async () => null, updateOne: async () => ({ acknowledged: true }), distinct: async () => ['run-live'] },
  };

  const deleted = await cleanupUnreferencedInventoryVersions(
    collections,
    new Date('2026-09-18T00:00:00.000Z'),
    0,
  );

  assert.equal(deleted, 9);
  assert.deepEqual(deletedFilter, {
    $or: [
      { syncRunId: { $nin: ['run-live'] } },
      { expiresAt: { $type: 'date' } },
    ],
  });
});
