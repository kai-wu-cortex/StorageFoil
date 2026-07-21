import { randomUUID } from 'node:crypto';
import type { StorageFoilSyncRunDocument } from './collections.ts';
import type { SyncRunSourceResult, SyncRunStatus, SyncRunTrigger } from '../shared/syncTypes.ts';

export interface SyncRunCollection {
  findOne(filter: Record<string, string>): Promise<Record<string, unknown> | StorageFoilSyncRunDocument | null>;
  insertOne(doc: StorageFoilSyncRunDocument): Promise<{ acknowledged: boolean }>;
  updateOne(
    filter: { _id: string },
    update: { $set: Partial<StorageFoilSyncRunDocument>; $unset?: { errorSummary: string } },
  ): Promise<{ acknowledged: boolean }>;
}

export interface CreateSyncRunInput {
  trigger: SyncRunTrigger;
  triggeredBy: string;
  idempotencyKey: string;
  configRevision: string;
}

export interface PublicSyncRun {
  id: string;
  status: SyncRunStatus;
  trigger: SyncRunTrigger;
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
  sourceResults: SyncRunSourceResult[];
  totals: StorageFoilSyncRunDocument['totals'];
  errorSummary?: string;
}

function totals(sourceResults: SyncRunSourceResult[]): StorageFoilSyncRunDocument['totals'] {
  return {
    sources: new Set(sourceResults.map(result => result.sourceId)).size,
    worksheets: sourceResults.length,
    records: sourceResults.reduce((sum, result) => sum + result.recordCount, 0),
    failures: sourceResults.filter(result => result.status === 'failed').length,
  };
}

function publicRun(doc: Record<string, unknown> | StorageFoilSyncRunDocument | null): PublicSyncRun | null {
  if (!doc) return null;
  const sourceResults = (doc.sourceResults || []) as SyncRunSourceResult[];
  return {
    id: String(doc._id),
    status: doc.status as SyncRunStatus,
    trigger: doc.trigger as SyncRunTrigger,
    triggeredBy: String(doc.triggeredBy),
    startedAt: doc.startedAt instanceof Date ? doc.startedAt.toISOString() : String(doc.startedAt),
    finishedAt: doc.finishedAt
      ? doc.finishedAt instanceof Date
        ? doc.finishedAt.toISOString()
        : String(doc.finishedAt)
      : undefined,
    sourceResults,
    totals: (doc.totals || totals(sourceResults)) as StorageFoilSyncRunDocument['totals'],
    errorSummary: typeof doc.errorSummary === 'string' ? doc.errorSummary : undefined,
  };
}

export async function createOrReuseSyncRun(
  collection: SyncRunCollection,
  input: CreateSyncRunInput,
  now = new Date(),
): Promise<PublicSyncRun> {
  const existing = await collection.findOne({ idempotencyKey: input.idempotencyKey });
  const publicExisting = publicRun(existing);
  if (publicExisting) return publicExisting;
  const doc: StorageFoilSyncRunDocument = {
    _id: randomUUID(),
    status: 'queued',
    trigger: input.trigger,
    triggeredBy: input.triggeredBy,
    idempotencyKey: input.idempotencyKey,
    configRevision: input.configRevision,
    startedAt: now,
    sourceResults: [],
    totals: { sources: 0, worksheets: 0, records: 0, failures: 0 },
  };
  await collection.insertOne(doc);
  return publicRun(doc)!;
}

export async function finalizeSyncRun(
  collection: SyncRunCollection,
  runId: string,
  input: { status: SyncRunStatus; sourceResults: SyncRunSourceResult[]; errorSummary?: string },
  now = new Date(),
): Promise<void> {
  const update: {
    $set: Partial<StorageFoilSyncRunDocument>;
    $unset?: { errorSummary: string };
  } = {
    $set: {
      status: input.status,
      sourceResults: input.sourceResults,
      totals: totals(input.sourceResults),
      finishedAt: now,
    },
  };
  if (input.errorSummary) {
    update.$set.errorSummary = input.errorSummary;
  } else {
    update.$unset = { errorSummary: '' };
  }

  await collection.updateOne(
    { _id: runId },
    update,
  );
}

export async function getSyncRun(
  collection: SyncRunCollection,
  runId: string,
): Promise<PublicSyncRun | null> {
  return publicRun(await collection.findOne({ _id: runId }));
}
