import type { Request, Response } from 'express';
import { createApiFailure, createApiSuccess } from '../shared/apiTypes.ts';
import { COLLECTION_NAMES } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
import { getPublicSyncConfig } from './syncConfigRepository.ts';
import { createOrReuseSyncRun, getSyncRun, type PublicSyncRun, type SyncRunCollection } from './syncRunRepository.ts';
import { acquireSyncLock, releaseSyncLock, type SyncLockCollection } from './syncLockRepository.ts';
import { runWpsFullSync } from './syncOrchestrator.ts';
import { finalizeSyncRun } from './syncRunRepository.ts';
import { getSessionSecret, requireRole, requireSameOrigin, sendJson } from './sessionAuth.ts';
import { writeOperationLog } from './operationLogRepository.ts';

interface AdminSyncService {
  createRun(input: { idempotencyKey: string; triggeredBy: string }): Promise<Pick<PublicSyncRun, 'id' | 'status'>>;
  getRun(runId: string): Promise<unknown>;
}

let serviceForTests: AdminSyncService | null = null;

export function setAdminSyncServiceForTests(service: AdminSyncService | null): void {
  serviceForTests = service;
}

function parseBody(body: unknown): { idempotencyKey?: string } {
  return body && typeof body === 'object' ? (body as { idempotencyKey?: string }) : {};
}

function service(): AdminSyncService {
  if (serviceForTests) return serviceForTests;
  return {
    createRun: async input => {
      const config = await getPublicSyncConfig();
      const collection = (await getMongoCollection(COLLECTION_NAMES.syncRuns)) as unknown as SyncRunCollection;
      const run = await createOrReuseSyncRun(collection, {
        trigger: 'admin',
        triggeredBy: input.triggeredBy,
        idempotencyKey: input.idempotencyKey,
        configRevision: config.revision,
      });
      await writeOperationLog({
        type: 'sync_received',
        level: 'info',
        syncRunId: run.id,
        message: `后台手动同步请求已提交。`,
        triggeredBy: input.triggeredBy,
      });
      if (run.status !== 'published' && run.status !== 'failed') {
        await executeRun(run.id, input.triggeredBy, config.revision);
      }
      return (await getSyncRun(collection, run.id)) ?? run;
    },
    getRun: async runId => getSyncRun((await getMongoCollection(COLLECTION_NAMES.syncRuns)) as unknown as SyncRunCollection, runId),
  };
}

export function publicSyncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Unable to decrypt secret.' || message === 'Malformed encrypted secret.') {
    return 'WPS 凭据无法解密，请重新保存 App Key 并重新授权 WPS。';
  }
  if (message === 'WPS authorization is required.') {
    return 'WPS 尚未授权，请先点击“授权 WPS”。';
  }
  if (message === 'WPS credentials are not configured.') {
    return 'WPS 凭据未配置，请先保存 App ID、App Key 和回调地址。';
  }
  return message || 'Sync failed.';
}

async function executeRun(runId: string, triggeredBy: string, configRevision: string): Promise<void> {
  const runCollection = (await getMongoCollection(COLLECTION_NAMES.syncRuns)) as unknown as SyncRunCollection;
  const lockCollection = (await getMongoCollection(COLLECTION_NAMES.syncLocks)) as unknown as SyncLockCollection;
  if (!(await acquireSyncLock(lockCollection, runId))) {
    await writeOperationLog({
      type: 'sync_failed',
      level: 'warning',
      syncRunId: runId,
      message: '同步失败：已有另一个同步任务正在运行。',
      triggeredBy,
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
      trigger: 'admin',
      triggeredBy,
      configRevision,
    });
    await finalizeSyncRun(runCollection, runId, result);
  } catch (error) {
    await writeOperationLog({
      type: 'sync_failed',
      level: 'error',
      syncRunId: runId,
      message: `同步失败：${publicSyncErrorMessage(error)}`,
      triggeredBy,
    });
    await finalizeSyncRun(runCollection, runId, {
      status: 'failed',
      sourceResults: [],
      errorSummary: publicSyncErrorMessage(error),
    });
  } finally {
    await releaseSyncLock(lockCollection, runId);
  }
}

export async function adminSyncRunApiHandler(
  req: Pick<Request, 'method' | 'headers' | 'body'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  let user;
  try {
    user = requireRole(req, getSessionSecret(), ['admin']);
    requireSameOrigin(req);
  } catch {
    sendJson(res, 403, createApiFailure('FORBIDDEN', '当前账号无操作权限。', 'local'));
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    sendJson(res, 405, createApiFailure('METHOD_NOT_ALLOWED', '仅支持 POST。', 'local'));
    return;
  }
  const body = parseBody(req.body);
  const run = await service().createRun({
    idempotencyKey: body.idempotencyKey || `admin-${Date.now()}`,
    triggeredBy: user.username,
  });
  sendJson(res, 202, createApiSuccess(run));
}

export async function adminSyncRunStatusApiHandler(
  req: Pick<Request, 'method' | 'headers' | 'query'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  try {
    requireRole(req, getSessionSecret(), ['admin']);
  } catch {
    sendJson(res, 403, createApiFailure('FORBIDDEN', '当前账号无操作权限。', 'local'));
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    sendJson(res, 405, createApiFailure('METHOD_NOT_ALLOWED', '仅支持 GET。', 'local'));
    return;
  }
  const runId = typeof req.query.runId === 'string' ? req.query.runId : '';
  if (!runId) {
    sendJson(res, 400, createApiFailure('INVALID_RUN_ID', '缺少同步运行 ID。', 'local'));
    return;
  }
  const run = await service().getRun(runId);
  if (!run) {
    sendJson(res, 404, createApiFailure('NOT_FOUND', '未找到同步运行。', 'local'));
    return;
  }
  sendJson(res, 200, createApiSuccess(run));
}
