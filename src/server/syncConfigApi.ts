import type { Request, Response } from 'express';
import { createApiFailure, createApiSuccess } from '../shared/apiTypes.ts';
import { getSessionSecret, requireRole, sendJson } from './sessionAuth.ts';
import type { OperationLogType } from '../shared/syncTypes.ts';
import { listOperationLogs } from './operationLogRepository.ts';
import { resolveEncryptionKey } from './secretCrypto.ts';
import { fetchWpsRangeData } from './wpsClient.ts';
import { getValidWpsAccessToken } from './wpsTokenService.ts';
import {
  getPublicSyncConfig,
  updateSyncConfig,
  type PublicSyncConfigWithRevision,
  type SyncConfigUpdateInput,
} from './syncConfigRepository.ts';

interface SyncConfigRepositoryForApi {
  get(): Promise<PublicSyncConfigWithRevision>;
  update(input: SyncConfigUpdateInput, updatedBy: string): Promise<PublicSyncConfigWithRevision>;
}

let repositoryForTests: SyncConfigRepositoryForApi | null = null;
let listOperationLogsForTests: typeof listOperationLogs | null = null;

const LOG_TYPES = new Set<OperationLogType>([
  'sync_received',
  'sync_started',
  'source_synced',
  'inventory_activity',
  'sync_published',
  'sync_failed',
]);

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function queryNumber(value: unknown, fallback: number): number {
  const parsed = Number(queryString(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function rawRangeSample(rawData: unknown, limit = 80): unknown[] {
  const response = rawData as { data?: { range_data?: unknown[] } };
  return Array.isArray(response.data?.range_data)
    ? response.data.range_data.slice(0, limit)
    : [];
}

function rawRangeCellCount(rawData: unknown): number {
  const response = rawData as { data?: { range_data?: unknown[] } };
  return Array.isArray(response.data?.range_data) ? response.data.range_data.length : 0;
}

export function setSyncConfigRepositoryForTests(repository: SyncConfigRepositoryForApi | null): void {
  repositoryForTests = repository;
}

export function setSyncConfigOperationLogsForTests(listLogs: typeof listOperationLogs | null): void {
  listOperationLogsForTests = listLogs;
}

function repository(): SyncConfigRepositoryForApi {
  if (repositoryForTests) return repositoryForTests;
  return {
    get: () => getPublicSyncConfig(),
    update: (input, updatedBy) =>
      updateSyncConfig(undefined, input, {
        encryptionKey: resolveEncryptionKey(),
        updatedBy,
        expectedRevision: input.revision,
      }),
  };
}

export async function syncConfigApiHandler(
  req: Pick<Request, 'method' | 'headers' | 'body' | 'query'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  const isOperationLogsView = req.method === 'GET' && req.query?.view === 'operation-logs';
  const isWpsPreviewView = req.method === 'GET' && req.query?.view === 'wps-preview';
  let user;
  try {
    user = requireRole(req, getSessionSecret(), isOperationLogsView ? ['admin', 'viewer'] : ['admin']);
  } catch {
    sendJson(res, 403, createApiFailure('FORBIDDEN', '当前账号无操作权限。', 'local'));
    return;
  }

  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (req.method === 'GET') {
      if (isOperationLogsView) {
        const rawType = typeof req.query.type === 'string' ? req.query.type : '';
        const type = LOG_TYPES.has(rawType as OperationLogType) ? rawType as OperationLogType : undefined;
        sendJson(res, 200, createApiSuccess({
          logs: await (listOperationLogsForTests || listOperationLogs)({
            limit: Number(typeof req.query.limit === 'string' ? req.query.limit : '') || 100,
            type,
            sourceId: typeof req.query.sourceId === 'string' ? req.query.sourceId : undefined,
            month: typeof req.query.month === 'string' ? req.query.month : undefined,
            syncRunId: typeof req.query.syncRunId === 'string' ? req.query.syncRunId : undefined,
          }),
        }));
        return;
      }
      if (isWpsPreviewView) {
        const config = await repository().get();
        const sourceId = queryString(req.query.sourceId);
        const source = config.sources.find(item => item.id === sourceId);
        if (!source) {
          sendJson(res, 404, createApiFailure('SOURCE_NOT_FOUND', '未找到该数据源。', 'local'));
          return;
        }
        const worksheetId = queryNumber(req.query.worksheetId, source.worksheetIdStart);
        const token = await getValidWpsAccessToken();
        const preview = await fetchWpsRangeData(token, {
          fileId: source.fileId,
          worksheetId,
          rowFrom: source.rowFrom,
          rowTo: source.rowTo,
          colFrom: source.colFrom,
          colTo: source.colTo,
          fieldConfig: source.fieldConfig,
        });
        sendJson(res, 200, createApiSuccess({
          sourceId: source.id,
          sourceName: source.name,
          worksheetId,
          request: {
            fileId: source.fileId,
            rowFrom: source.rowFrom,
            rowTo: source.rowTo,
            colFrom: 1,
            colTo: Math.max(source.colTo, 1),
          },
          fieldConfig: source.fieldConfig,
          headers: preview.headers,
          rawSample: rawRangeSample(preview.rawData),
          parsedSample: preview.batches.slice(0, 10),
          totals: {
            parsedRecords: preview.batches.length,
            rawCells: rawRangeCellCount(preview.rawData),
          },
        }));
        return;
      }
      sendJson(res, 200, createApiSuccess(await repository().get()));
      return;
    }
    if (req.method === 'PUT') {
      sendJson(res, 200, createApiSuccess(await repository().update(req.body as SyncConfigUpdateInput, user.username)));
      return;
    }
    sendJson(res, 405, createApiFailure('METHOD_NOT_ALLOWED', '仅支持 GET 或 PUT。', 'local'));
  } catch (error) {
    if (error instanceof Error && error.message === 'CONFIG_CONFLICT') {
      sendJson(res, 409, createApiFailure('CONFIG_CONFLICT', '配置已被更新，请刷新后重试。', 'local'));
      return;
    }
    throw error;
  }
}
