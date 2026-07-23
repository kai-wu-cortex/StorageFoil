import type { FetchLike } from './authApi';

export async function parseAdminSyncResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('同步配置返回了非 JSON 响应。');
  }
  if (!payload || typeof payload !== 'object') throw new Error('同步配置响应格式无效。');
  const envelope = payload as { success?: unknown; data?: unknown; message?: unknown };
  if (envelope.success === true && envelope.data && typeof envelope.data === 'object') {
    return envelope.data as T;
  }
  if (envelope.success === false && typeof envelope.message === 'string') {
    throw new Error(envelope.message);
  }
  throw new Error('同步配置响应格式无效。');
}

export function createAdminSyncApi(fetcher: FetchLike = fetch) {
  return {
    getSyncConfig: async () =>
      parseAdminSyncResponse(
        await awaitFetch(fetcher, '/api/admin/sync-config', { method: 'GET', credentials: 'include' }),
      ),
    updateSyncConfig: async (body: unknown) =>
      parseAdminSyncResponse(
        await awaitFetch(fetcher, '/api/admin/sync-config', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ),
    getAuthorizationUrl: async () =>
      parseAdminSyncResponse(
        await awaitFetch(fetcher, '/api/admin/wps/authorization-url', { method: 'GET', credentials: 'include' }),
      ),
    triggerSync: async (body: unknown) =>
      parseAdminSyncResponse(
        await awaitFetch(fetcher, '/api/admin/sync/run', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ),
    getRun: async (runId: string) =>
      parseAdminSyncResponse(
        await awaitFetch(fetcher, `/api/admin/sync/runs/${encodeURIComponent(runId)}`, {
          method: 'GET',
          credentials: 'include',
        }),
      ),
    getOperationLogs: async (options: { limit?: number; type?: string; sourceId?: string; month?: string; syncRunId?: string } = {}) => {
      const params = new URLSearchParams();
      params.set('view', 'operation-logs');
      if (options.limit) params.set('limit', String(options.limit));
      if (options.type) params.set('type', options.type);
      if (options.sourceId) params.set('sourceId', options.sourceId);
      if (options.month) params.set('month', options.month);
      if (options.syncRunId) params.set('syncRunId', options.syncRunId);
      const query = params.toString();
      return parseAdminSyncResponse(
        await awaitFetch(fetcher, `/api/admin/sync-config?${query}`, {
          method: 'GET',
          credentials: 'include',
        }),
      );
    },
    previewWpsSource: async (options: { sourceId: string; worksheetId?: number }) => {
      const params = new URLSearchParams();
      params.set('view', 'wps-preview');
      params.set('sourceId', options.sourceId);
      if (options.worksheetId) params.set('worksheetId', String(options.worksheetId));
      return parseAdminSyncResponse(
        await awaitFetch(fetcher, `/api/admin/sync-config?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
        }),
      );
    },
  };
}

function awaitFetch(fetcher: FetchLike, input: string, init: RequestInit): Promise<Response> {
  return fetcher(input, init);
}

export const adminSyncApi = createAdminSyncApi();
