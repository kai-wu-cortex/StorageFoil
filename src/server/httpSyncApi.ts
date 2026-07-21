import type { Request, Response } from 'express';
import { createApiFailure, createApiSuccess } from '../shared/apiTypes.ts';
import { COLLECTION_NAMES } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
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
import { publicSyncErrorMessage } from './adminSyncApi.ts';
import { sendJson } from './sessionAuth.ts';
import { writeOperationLog } from './operationLogRepository.ts';

interface HttpSyncService {
  createRun(input: { idempotencyKey: string; fileId: string }): Promise<PublicSyncRun | Pick<PublicSyncRun, 'id' | 'status'>>;
}

let serviceForTests: HttpSyncService | null = null;

export function setHttpSyncServiceForTests(service: HttpSyncService | null): void {
  serviceForTests = service;
}

function headerValue(headers: Record<string, unknown>, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return body && typeof body === 'object' ? body as Record<string, unknown> : {};
}

function cleanFileId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createIdempotencyKey(fileId: string, provided: unknown): string {
  if (typeof provided === 'string' && provided.trim()) return provided.trim();
  return `http-${fileId}-${Date.now()}`;
}

function service(): HttpSyncService {
  if (serviceForTests) return serviceForTests;
  return {
    createRun: async input => {
      const config = await getPublicSyncConfig();
      const runCollection = (await getMongoCollection(COLLECTION_NAMES.syncRuns)) as unknown as SyncRunCollection;
      const run = await createOrReuseSyncRun(runCollection, {
        trigger: 'webhook',
        triggeredBy: `http:${input.fileId}`,
        requestedFileId: input.fileId,
        idempotencyKey: input.idempotencyKey,
        configRevision: config.revision,
      });
      await writeOperationLog({
        type: 'sync_received',
        level: 'info',
        syncRunId: run.id,
        fileId: input.fileId,
        message: `收到 WPS HTTP 同步请求：fileId=${input.fileId}`,
        triggeredBy: `http:${input.fileId}`,
      });
      if (run.status !== 'published' && run.status !== 'failed') {
        await executeHttpRun(run.id, config.revision, input.fileId);
      }
      return (await getSyncRun(runCollection, run.id)) ?? run;
    },
  };
}

async function executeHttpRun(runId: string, configRevision: string, fileId: string): Promise<void> {
  const runCollection = (await getMongoCollection(COLLECTION_NAMES.syncRuns)) as unknown as SyncRunCollection;
  const lockCollection = (await getMongoCollection(COLLECTION_NAMES.syncLocks)) as unknown as SyncLockCollection;
  if (!(await acquireSyncLock(lockCollection, runId))) {
    await writeOperationLog({
      type: 'sync_failed',
      level: 'warning',
      syncRunId: runId,
      fileId,
      message: '同步失败：已有另一个同步任务正在运行。',
      triggeredBy: `http:${fileId}`,
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
      trigger: 'webhook',
      triggeredBy: `http:${fileId}`,
      configRevision,
    });
    await finalizeSyncRun(runCollection, runId, result);
  } catch (error) {
    await writeOperationLog({
      type: 'sync_failed',
      level: 'error',
      syncRunId: runId,
      fileId,
      message: `同步失败：${publicSyncErrorMessage(error)}`,
      triggeredBy: `http:${fileId}`,
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

export async function httpSyncApiHandler(
  req: Pick<Request, 'method' | 'headers' | 'body'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    sendJson(res, 405, createApiFailure('METHOD_NOT_ALLOWED', '仅支持 POST。', 'local'));
    return;
  }

  const configuredSecret = process.env.STORAGE_FOIL_HTTP_SYNC_SECRET || process.env.STORAGE_FOIL_WEBHOOK_SECRET || '';
  const receivedSecret = headerValue(req.headers as Record<string, unknown>, 'x-storagefoil-secret');
  if (!configuredSecret || receivedSecret !== configuredSecret) {
    sendJson(res, 401, createApiFailure('HTTP_SYNC_UNAUTHORIZED', 'HTTP 同步密钥校验失败。', 'local'));
    return;
  }

  const body = bodyObject(req.body);
  if (body.mode !== 'full') {
    sendJson(res, 400, createApiFailure('INVALID_SYNC_MODE', '仅支持 full 同步。', 'local'));
    return;
  }

  const fileId = cleanFileId(body.fileId);
  if (!fileId) {
    sendJson(res, 400, createApiFailure('FILE_ID_REQUIRED', '缺少 fileId，无法识别触发来源文件。', 'local'));
    return;
  }

  const run = await service().createRun({
    fileId,
    idempotencyKey: createIdempotencyKey(fileId, body.idempotencyKey),
  });
  sendJson(res, 202, createApiSuccess(run));
}
