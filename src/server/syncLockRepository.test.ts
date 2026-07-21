import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireSyncLock, releaseSyncLock, type SyncLockCollection } from './syncLockRepository.ts';

test('sync lock acquisition handles success conflict expiry and owner-only release', async () => {
  const updates: unknown[] = [];
  let locked = false;
  const collection: SyncLockCollection = {
    findOneAndUpdate: async (_filter: unknown, update: unknown) => {
      updates.push(update);
      if (locked) return null;
      locked = true;
      return { _id: 'wps-full-sync' as const, ownerRunId: 'run-1', expiresAt: new Date(), acquiredAt: new Date() };
    },
    updateOne: async (filter: { ownerRunId?: string }) => {
      if (filter.ownerRunId !== 'run-1') return { modifiedCount: 0 };
      locked = false;
      return { modifiedCount: 1 };
    },
  };

  assert.equal(await acquireSyncLock(collection, 'run-1', new Date('2026-07-21T00:00:00Z')), true);
  assert.equal(await acquireSyncLock(collection, 'run-2', new Date('2026-07-21T00:00:01Z')), false);
  assert.equal(await releaseSyncLock(collection, 'run-2'), false);
  assert.equal(await releaseSyncLock(collection, 'run-1'), true);
  assert.equal(updates.length, 2);
});
