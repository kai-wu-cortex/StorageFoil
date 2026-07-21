import assert from 'node:assert/strict';
import test from 'node:test';
import { getInventoryBootstrap, getPublishedInventory } from './inventoryRepository.ts';

const batchBase = {
  productModel: 'PL-001',
  batchCode: 'B-001',
  specification: '0.64*120M',
  shelf: '19-3A',
  totalStock: 7,
  inflowQty: 10,
  outflowQty: 3,
  remarks: '',
  dailyActivities: [{ day: 1, inQty: 10, outQty: 3 }],
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

function createCollections() {
  const calls: string[] = [];
  const publications = [
    {
      _id: '2026-07',
      month: '2026-07',
      syncRunId: 'run-july',
      publishedAt: new Date('2026-07-20T00:00:00.000Z'),
      publishedBy: 'admin',
      sourceIds: ['pl'],
    },
    {
      _id: '2026-06',
      month: '2026-06',
      syncRunId: 'run-june',
      publishedAt: new Date('2026-06-30T00:00:00.000Z'),
      publishedBy: 'admin',
      sourceIds: ['pc'],
    },
  ];
  const batches = [
    {
      ...batchBase,
      _id: 'run-july:pl:1',
      syncRunId: 'run-july',
      sourceId: 'pl',
      sourceName: 'PL',
      month: '2026-07',
      recordKey: '1',
      worksheetId: 7,
      worksheetName: '7月',
      sourceRow: 4,
      syncedAt: new Date('2026-07-20T00:01:00.000Z'),
    },
    {
      ...batchBase,
      _id: 'draft:pl:1',
      syncRunId: 'draft-run',
      sourceId: 'pl',
      sourceName: 'PL',
      month: '2026-07',
      recordKey: '1',
      worksheetId: 7,
      worksheetName: '7月',
      sourceRow: 4,
      syncedAt: new Date('2026-07-20T00:02:00.000Z'),
    },
    {
      ...batchBase,
      _id: 'run-june:pc:1',
      syncRunId: 'run-june',
      sourceId: 'pc',
      sourceName: 'PC',
      month: '2026-06',
      recordKey: '1',
      worksheetId: 6,
      worksheetName: '6月',
      sourceRow: 4,
      syncedAt: new Date('2026-06-30T00:01:00.000Z'),
    },
  ];
  const sources = [
    { _id: 'pl', id: 'pl', name: 'PL', enabled: true },
    { _id: 'pc', id: 'pc', name: 'PC', enabled: true },
  ];

  return {
    calls,
    collections: {
      inventoryPublications: {
        find: () => ({
          sort: () => ({
            toArray: async () => {
              calls.push('publications.find');
              return publications;
            },
          }),
        }),
        findOne: async (filter: { _id: string }) => {
          calls.push(`publications.findOne:${filter._id}`);
          return publications.find(publication => publication._id === filter._id) ?? null;
        },
      },
      inventoryBatches: {
        find: (filter: { syncRunId: string; month: string; sourceId?: string }) => ({
          sort: () => ({
            toArray: async () => {
              calls.push(`batches.find:${filter.syncRunId}:${filter.month}:${filter.sourceId ?? 'all'}`);
              return batches.filter(
                batch =>
                  batch.syncRunId === filter.syncRunId &&
                  batch.month === filter.month &&
                  (!filter.sourceId || batch.sourceId === filter.sourceId),
              );
            },
          }),
        }),
      },
      syncSources: {
        find: () => ({
          toArray: async () => {
            calls.push('sources.find');
            return sources;
          },
        }),
      },
    },
  };
}

test('bootstrap chooses the latest published month and excludes unpublished batches', async () => {
  const { calls, collections } = createCollections();
  const result = await getInventoryBootstrap(collections);

  assert.equal(result.defaultMonth, '2026-07');
  assert.deepEqual(result.months, ['2026-07', '2026-06']);
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0].id, 'run-july:pl:1');
  assert.equal(result.latestPublishedAt, '2026-07-20T00:00:00.000Z');
  assert.equal(calls.indexOf('publications.find') < calls.indexOf('batches.find:run-july:2026-07:all'), true);
});

test('published inventory reads pointer before batches and filters by source', async () => {
  const { calls, collections } = createCollections();
  const result = await getPublishedInventory(collections, { month: '2026-06', sourceId: 'pc' });

  assert.equal(result.month, '2026-06');
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0].sourceId, 'pc');
  assert.deepEqual(calls.slice(0, 2), ['publications.findOne:2026-06', 'batches.find:run-june:2026-06:pc']);
});

test('empty database returns a valid empty bootstrap response', async () => {
  const result = await getInventoryBootstrap({
    inventoryPublications: {
      find: () => ({ sort: () => ({ toArray: async () => [] }) }),
      findOne: async () => null,
    },
    inventoryBatches: { find: () => ({ sort: () => ({ toArray: async () => [] }) }) },
    syncSources: { find: () => ({ toArray: async () => [] }) },
  });

  assert.deepEqual(result, {
    user: null,
    months: [],
    defaultMonth: null,
    month: null,
    batches: [],
    sources: [],
    latestPublishedAt: null,
    syncRunId: null,
  });
});
