import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSyncApi } from './adminSyncApi';
import type { FetchLike } from './authApi';

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as Response;
}

test('admin sync API reads and updates config with credentials included', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: FetchLike = async (url, init) => {
    requests.push({ url: String(url), init });
    return response({ success: true, data: { credentials: {}, sources: [], revision: 'rev-1' } });
  };

  const api = createAdminSyncApi(fetcher);
  await api.getSyncConfig();
  await api.updateSyncConfig({ revision: 'rev-1', credentials: {}, sources: [] });

  assert.deepEqual(requests.map(request => [request.url, request.init?.method, request.init?.credentials]), [
    ['/api/admin/sync-config', 'GET', 'include'],
    ['/api/admin/sync-config', 'PUT', 'include'],
  ]);
});

test('admin sync API authorizes triggers and reads run status with credentials included', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: FetchLike = async (url, init) => {
    requests.push({ url: String(url), init });
    return response({ success: true, data: { id: 'run-1', status: 'queued', url: 'https://openapi.wps.cn/oauth2/auth' } });
  };

  const api = createAdminSyncApi(fetcher);
  await api.getAuthorizationUrl();
  await api.triggerSync({ idempotencyKey: 'idem-1' });
  await api.getRun('run-1');

  assert.deepEqual(requests.map(request => [request.url, request.init?.method, request.init?.credentials]), [
    ['/api/admin/wps/authorization-url', 'GET', 'include'],
    ['/api/admin/sync/run', 'POST', 'include'],
    ['/api/admin/sync/runs/run-1', 'GET', 'include'],
  ]);
});

test('admin sync API surfaces conflicts and invalid responses', async () => {
  const conflict = createAdminSyncApi(async () =>
    response({ success: false, error: { code: 'CONFIG_CONFLICT' }, message: '配置已被更新' }, false, 409),
  );
  await assert.rejects(() => conflict.updateSyncConfig({ revision: 'old', credentials: {}, sources: [] }), /配置已被更新/);

  const invalid = createAdminSyncApi(async () => response({ data: {} }));
  await assert.rejects(() => invalid.getSyncConfig(), /同步配置响应格式无效/);
});
