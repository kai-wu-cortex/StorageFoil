import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryApi, parseInventoryApiResponse } from './inventoryApi';

const bootstrap = {
  user: null,
  months: ['2026-07'],
  defaultMonth: '2026-07',
  month: '2026-07',
  batches: [],
  sources: [],
  latestPublishedAt: '2026-07-20T00:00:00.000Z',
  syncRunId: 'run-july',
};

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as Response;
}

test('parses inventory success envelopes and rejects invalid responses', async () => {
  assert.deepEqual(await parseInventoryApiResponse(response({ success: true, data: bootstrap })), bootstrap);
  await assert.rejects(() => parseInventoryApiResponse(response({ data: bootstrap })), /库存服务响应格式无效/);
});

test('inventory API client calls bootstrap and month endpoints with credentials', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const api = createInventoryApi(async (url, init) => {
    requests.push({ url: String(url), init });
    return response({ success: true, data: bootstrap });
  });

  await api.bootstrap();
  await api.getInventory({ month: '2026-07', sourceId: 'pl' });

  assert.deepEqual(requests.map(request => request.url), [
    '/api/inventory/bootstrap',
    '/api/inventory?month=2026-07&sourceId=pl',
  ]);
  assert.equal(requests[0].init?.credentials, 'include');
});

test('inventory API surfaces unauthenticated and network failures', async () => {
  const unauthenticated = createInventoryApi(async () =>
    response({ success: false, error: { code: 'UNAUTHORIZED' }, message: '请先登录。' }, false, 401),
  );
  await assert.rejects(() => unauthenticated.bootstrap(), /请先登录/);

  const network = createInventoryApi(async () => {
    throw new Error('offline');
  });
  await assert.rejects(() => network.bootstrap(), /库存服务连接失败/);
});
