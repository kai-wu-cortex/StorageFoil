import type { StorageFoilSyncLockDocument } from './collections.ts';

export interface SyncLockCollection {
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set: StorageFoilSyncLockDocument },
    options: { upsert: boolean; returnDocument: 'after' },
  ): Promise<StorageFoilSyncLockDocument | null>;
  updateOne(
    filter: { _id: 'wps-full-sync'; ownerRunId: string },
    update: { $set: { expiresAt: Date } },
  ): Promise<{ modifiedCount?: number }>;
  deleteOne(filter: { _id: 'wps-full-sync'; ownerRunId: string }): Promise<{ deletedCount?: number }>;
}

const LOCK_ID = 'wps-full-sync';
const DEFAULT_LEASE_MS = 15 * 60 * 1000;

export async function acquireSyncLock(
  collection: SyncLockCollection,
  ownerRunId: string,
  now = new Date(),
  leaseMs = DEFAULT_LEASE_MS,
): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + leaseMs);
  let doc: StorageFoilSyncLockDocument | null;
  try {
    doc = await collection.findOneAndUpdate(
      {
        _id: LOCK_ID,
        $or: [{ ownerRunId: ownerRunId }, { expiresAt: { $lte: now } }, { ownerRunId: { $exists: false } }],
      },
      { $set: { _id: LOCK_ID, ownerRunId, acquiredAt: now, expiresAt } },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return false;
    }
    throw error;
  }
  return doc?.ownerRunId === ownerRunId;
}

export async function renewSyncLock(
  collection: SyncLockCollection,
  ownerRunId: string,
  now = new Date(),
  leaseMs = DEFAULT_LEASE_MS,
): Promise<boolean> {
  const result = await collection.updateOne(
    { _id: LOCK_ID, ownerRunId },
    { $set: { expiresAt: new Date(now.getTime() + leaseMs) } },
  );
  return Boolean(result.modifiedCount);
}

export async function releaseSyncLock(
  collection: SyncLockCollection,
  ownerRunId: string,
): Promise<boolean> {
  const result = await collection.deleteOne({ _id: LOCK_ID, ownerRunId });
  return Boolean(result.deletedCount);
}
