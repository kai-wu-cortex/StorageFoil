import type { Request, Response } from 'express';
import { createApiFailure, createApiSuccess } from '../shared/apiTypes.ts';
import type { OperationLogType } from '../shared/syncTypes.ts';
import { listOperationLogs } from './operationLogRepository.ts';
import { getSessionSecret, requireRole, sendJson } from './sessionAuth.ts';

const LOG_TYPES = new Set<OperationLogType>([
  'sync_received',
  'sync_started',
  'source_synced',
  'inventory_activity',
  'sync_published',
  'sync_failed',
]);

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '').trim();
}

export async function operationLogApiHandler(
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

  const rawType = queryValue(req.query?.type);
  const type = LOG_TYPES.has(rawType as OperationLogType) ? rawType as OperationLogType : undefined;
  const logs = await listOperationLogs({
    limit: Number(queryValue(req.query?.limit)) || 100,
    type,
    sourceId: queryValue(req.query?.sourceId) || undefined,
    month: queryValue(req.query?.month) || undefined,
    syncRunId: queryValue(req.query?.syncRunId) || undefined,
  });
  sendJson(res, 200, createApiSuccess({ logs }));
}
