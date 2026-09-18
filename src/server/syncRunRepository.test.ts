import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOrReuseSyncRun,
  finalizeSyncRun,
  findRecentPublishedSyncRun,
  getSyncRun,
} from './syncRunRepository.ts';

test('sync run repository replays idempotency key and finalizes counts', async () => {
  const docs = new Map<string, Record<string, unknown>>();
  const updates: Array<{ $set: Record<string, unknown>; $unset?: Record<string, unknown> }> = [];
  const collection = {
    findOne: async (filter: Record<string, string>) => {
      if (filter.idempotencyKey) return [...docs.values()].find(doc => doc.idempotencyKey === filter.idempotencyKey) || null;
      return docs.get(filter._id) || null;
    },
    insertOne: async (doc: Record<string, unknown>) => {
      docs.set(String(doc._id), doc);
      return { acknowledged: true };
    },
    updateOne: async (filter: Record<string, string>, update: { $set: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
      updates.push(update);
      const next = { ...docs.get(filter._id), ...update.$set };
      if (update.$unset?.errorSummary) delete next.errorSummary;
      docs.set(filter._id, next);
      return { acknowledged: true };
    },
  };

  const first = await createOrReuseSyncRun(collection, {
    trigger: 'webhook',
    triggeredBy: 'http:file-1',
    requestedFileId: 'file-1',
    idempotencyKey: 'idem-1',
    configRevision: 'rev-1',
  });
  const second = await createOrReuseSyncRun(collection, {
    trigger: 'webhook',
    triggeredBy: 'http:file-1',
    requestedFileId: 'file-1',
    idempotencyKey: 'idem-1',
    configRevision: 'rev-1',
  });
  await finalizeSyncRun(collection, first.id, {
    status: 'published',
    sourceResults: [{ sourceId: 'pl', worksheetId: 7, month: '2026-07', status: 'success', recordCount: 2 }],
    errorSummary: '',
  });

  assert.equal(first.id, second.id);
  assert.equal((await getSyncRun(collection, first.id))?.requestedFileId, 'file-1');
  assert.equal((await getSyncRun(collection, first.id))?.status, 'published');
  assert.deepEqual((await getSyncRun(collection, first.id))?.totals, {
    sources: 1,
    worksheets: 1,
    records: 2,
    failures: 0,
  });
  assert.equal(Object.hasOwn(updates.at(-1)?.$set ?? {}, 'errorSummary'), false);
  assert.deepEqual(updates.at(-1)?.$unset, { errorSummary: '' });
});

test('recent published full sync is reused across different WPS file triggers', async () => {
  const published = {
    _id: 'run-published',
    status: 'published',
    trigger: 'webhook',
    triggeredBy: 'http:file-a',
    requestedFileId: 'file-a',
    idempotencyKey: 'first-request',
    configRevision: 'rev-1',
    startedAt: new Date('2026-09-18T07:30:00.000Z'),
    finishedAt: new Date('2026-09-18T07:32:00.000Z'),
    sourceResults: [],
    totals: { sources: 5, worksheets: 19, records: 7000, failures: 0 },
  };
  let seenFilter: Record<string, unknown> | undefined;
  const collection = {
    findOne: async (filter: Record<string, unknown>) => {
      seenFilter = filter;
      return published;
    },
    insertOne: async () => ({ acknowledged: true }),
    updateOne: async () => ({ acknowledged: true }),
  };

  const result = await findRecentPublishedSyncRun(
    collection,
    'rev-1',
    new Date('2026-09-18T08:00:00.000Z'),
    45 * 60 * 1000,
  );

  assert.equal(result?.id, 'run-published');
  assert.deepEqual(seenFilter, {
    trigger: 'webhook',
    status: 'published',
    configRevision: 'rev-1',
    startedAt: { $gte: new Date('2026-09-18T07:15:00.000Z') },
  });
});
