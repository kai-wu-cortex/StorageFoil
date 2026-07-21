import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listOperationLogs,
  serializeOperationLog,
  toOperationLogDocument,
} from './operationLogRepository.ts';

test('operation log document removes undefined fields and serializes dates', () => {
  const doc = toOperationLogDocument({
    type: 'sync_received',
    level: 'info',
    syncRunId: 'run-1',
    fileId: '',
    message: '收到同步请求',
    triggeredBy: 'admin',
    createdAt: new Date('2026-07-21T10:00:00.000Z'),
  });

  assert.equal(doc.fileId, undefined);
  assert.equal(doc.syncRunId, 'run-1');
  const serialized = serializeOperationLog(doc);
  assert.equal(serialized.createdAt, '2026-07-21T10:00:00.000Z');
});

test('operation log query applies filters and caps limits', async () => {
  let seenFilter: unknown;
  let seenLimit = 0;
  const collection = Promise.resolve({
    insertOne: async () => undefined,
    insertMany: async () => undefined,
    find: (filter: unknown) => {
      seenFilter = filter;
      return {
        sort: () => ({
          limit: (limit: number) => {
            seenLimit = limit;
            return { toArray: async () => [] };
          },
        }),
      };
    },
  });

  const logs = await listOperationLogs({
    limit: 999,
    type: 'inventory_activity',
    sourceId: 'pc',
    month: '2026-07',
  }, collection);

  assert.deepEqual(logs, []);
  assert.deepEqual(seenFilter, { type: 'inventory_activity', sourceId: 'pc', month: '2026-07' });
  assert.equal(seenLimit, 500);
});
