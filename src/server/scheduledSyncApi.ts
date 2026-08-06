import type { Request, Response } from 'express';
import { createApiFailure, createApiSuccess } from '../shared/apiTypes.ts';
import { COLLECTION_NAMES } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
import { writeOperationLog } from './operationLogRepository.ts';
import { publicSyncErrorMessage } from './adminSyncApi.ts';
import { getPublicSyncConfig } from './syncConfigRepository.ts';
import { acquireSyncLock, releaseSyncLock, type SyncLockCollection } from './syncLockRepository.ts';
import { runWpsFullSync } from './syncOrchestrator.ts';
import {
  createOrReuseSyncRun,
  finalizeSyncRun,
  getSyncRun,
  type PublicSyncRun,
  type SyncRunCollection,
} from './syncRunRepository.ts';
import { sendJson } from './sessionAuth.ts';

interface ScheduledSyncService {
  createRun(): Promise<Pick<PublicSyncRun, 'id' | 'status'> & Partial<PublicSyncRun>>;
}

let serviceForTests: ScheduledSyncService | null = null;

export function setScheduledSyncServiceForTests(service: ScheduledSyncService | null): void {
  serviceForTests = service;
}

function service(): ScheduledSyncService {
  if (serviceForTests) return serviceForTests;
  return {
    createRun: async () => {
      const config = await getPublicSyncConfig();
      const runCollection = (await getMongoCollection(COLLECTION_NAMES.syncRuns)) as unknown as SyncRunCollection;
      const run = await createOrReuseSyncRun(runCollection, {
        trigger: 'scheduler',
        triggeredBy: 'system:vercel-cron',
        idempotencyKey: `cron-${Date.now()}`,
        configRevision: config.revision,
      });
      await writeOperationLog({
        type: 'sync_received',
        level: 'info',
        syncRunId: run.id,
        message: '定时同步请求已提交。',
        triggeredBy: 'system:vercel-cron',
      });
      await executeScheduledRun(run.id, config.revision);
      return (await getSyncRun(runCollection, run.id)) ?? run;
    },
  };
}

async function executeScheduledRun(runId: string, configRevision: string): Promise<void> {
  const runCollection = (await getMongoCollection(COLLECTION_NAMES.syncRuns)) as unknown as SyncRunCollection;
  const lockCollection = (await getMongoCollection(COLLECTION_NAMES.syncLocks)) as unknown as SyncLockCollection;
  if (!(await acquireSyncLock(lockCollection, runId))) {
    await writeOperationLog({
      type: 'sync_failed',
      level: 'warning',
      syncRunId: runId,
      message: '定时同步跳过：已有另一个同步任务正在运行。',
      triggeredBy: 'system:vercel-cron',
    });
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
      trigger: 'scheduler',
      triggeredBy: 'system:vercel-cron',
      configRevision,
    });
    await finalizeSyncRun(runCollection, runId, result);
  } catch (error) {
    const message = publicSyncErrorMessage(error);
    await writeOperationLog({
      type: 'sync_failed',
      level: 'error',
      syncRunId: runId,
      message: `定时同步失败：${message}`,
      triggeredBy: 'system:vercel-cron',
    });
    await finalizeSyncRun(runCollection, runId, {
      status: 'failed',
      sourceResults: [],
      errorSummary: message,
    });
  } finally {
    await releaseSyncLock(lockCollection, runId);
  }
}

export async function scheduledSyncApiHandler(
  req: Pick<Request, 'method' | 'headers'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    sendJson(res, 405, createApiFailure('METHOD_NOT_ALLOWED', '仅支持 GET。', 'local'));
    return;
  }

  const secret = process.env.CRON_SECRET || '';
  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  if (!secret || authorization !== `Bearer ${secret}`) {
    sendJson(res, 401, createApiFailure('CRON_UNAUTHORIZED', '定时同步鉴权失败。', 'local'));
    return;
  }

  const run = await service().createRun();
  const statusCode = run.status === 'published' ? 200 : 500;
  sendJson(res, statusCode, createApiSuccess(run));
}
