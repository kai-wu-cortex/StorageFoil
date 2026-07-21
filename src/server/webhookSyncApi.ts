import type { Request, Response } from 'express';
import { createApiFailure, createApiSuccess } from '../shared/apiTypes.ts';
import { COLLECTION_NAMES } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
import { getPublicSyncConfig } from './syncConfigRepository.ts';
import { acquireSyncLock, releaseSyncLock, type SyncLockCollection } from './syncLockRepository.ts';
import { runWpsFullSync } from './syncOrchestrator.ts';
import { createOrReuseSyncRun, finalizeSyncRun, type PublicSyncRun, type SyncRunCollection } from './syncRunRepository.ts';
import { sendJson } from './sessionAuth.ts';
import { verifyWebhookSignature } from './webhookAuth.ts';

interface WebhookSyncService {
  createRun(input: { idempotencyKey: string }): Promise<Pick<PublicSyncRun, 'id' | 'status'>>;
}

let serviceForTests: WebhookSyncService | null = null;

export function setWebhookSyncServiceForTests(service: WebhookSyncService | null): void {
  serviceForTests = service;
}

function rawBodyFromRequest(req: Pick<Request, 'body'>): string {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return JSON.stringify(req.body ?? {});
}

function parseBody(rawBody: string): { mode?: string } {
  try {
    return JSON.parse(rawBody) as { mode?: string };
  } catch {
    return {};
  }
}

function service(): WebhookSyncService {
  if (serviceForTests) return serviceForTests;
  return {
    createRun: async input => {
      const config = await getPublicSyncConfig();
      const run = await createOrReuseSyncRun((await getMongoCollection(COLLECTION_NAMES.syncRuns)) as unknown as SyncRunCollection, {
        trigger: 'webhook',
        triggeredBy: 'airscript',
        idempotencyKey: input.idempotencyKey,
        configRevision: config.revision,
      });
      void executeWebhookRun(run.id, config.revision).catch(error => {
        console.error('StorageFoil webhook sync execution failed.', error);
      });
      return run;
    },
  };
}

async function executeWebhookRun(runId: string, configRevision: string): Promise<void> {
  const runCollection = (await getMongoCollection(COLLECTION_NAMES.syncRuns)) as unknown as SyncRunCollection;
  const lockCollection = (await getMongoCollection(COLLECTION_NAMES.syncLocks)) as unknown as SyncLockCollection;
  if (!(await acquireSyncLock(lockCollection, runId))) {
    await finalizeSyncRun(runCollection, runId, {
      status: 'failed',
      sourceResults: [],
      errorSummary: 'Another sync run is already active.',
    });
    return;
  }
  try {
    const result = await runWpsFullSync({
      runId,
      trigger: 'webhook',
      triggeredBy: 'airscript',
      configRevision,
    });
    await finalizeSyncRun(runCollection, runId, result);
  } catch (error) {
    await finalizeSyncRun(runCollection, runId, {
      status: 'failed',
      sourceResults: [],
      errorSummary: error instanceof Error ? error.message : 'Sync failed.',
    });
  } finally {
    await releaseSyncLock(lockCollection, runId);
  }
}

export async function webhookSyncApiHandler(
  req: Pick<Request, 'method' | 'headers' | 'body'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    sendJson(res, 405, createApiFailure('METHOD_NOT_ALLOWED', '仅支持 POST。', 'local'));
    return;
  }
  const rawBody = rawBodyFromRequest(req);
  let verified;
  try {
    verified = verifyWebhookSignature(
      req.headers as Record<string, unknown>,
      rawBody,
      process.env.STORAGE_FOIL_WEBHOOK_SECRET || '',
    );
  } catch {
    sendJson(res, 401, createApiFailure('WEBHOOK_UNAUTHORIZED', 'Webhook 签名校验失败。', 'local'));
    return;
  }
  const body = parseBody(rawBody);
  if (body.mode !== 'full') {
    sendJson(res, 400, createApiFailure('INVALID_SYNC_MODE', '仅支持 full 同步。', 'local'));
    return;
  }
  const run = await service().createRun({ idempotencyKey: verified.idempotencyKey });
  sendJson(res, 202, createApiSuccess(run));
}
