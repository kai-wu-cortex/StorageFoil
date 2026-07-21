import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthApi,
  parseAuthApiResponse,
  type FetchLike,
} from './authApi';

const user = {
  id: 'viewer1',
  username: 'viewer1',
  displayName: 'Viewer 1',
  role: 'viewer' as const,
};

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(text: string, status = 500): Response {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'text/html' }),
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
    text: async () => text,
  } as unknown as Response;
}

test('parses successful auth envelopes and rejects malformed responses', async () => {
  assert.deepEqual(await parseAuthApiResponse(jsonResponse({ success: true, data: user })), user);

  await assert.rejects(
    () => parseAuthApiResponse(jsonResponse({ data: user })),
    /登录服务响应格式无效/,
  );
});

test('reports non-JSON local Vite errors clearly', async () => {
  await assert.rejects(
    () => parseAuthApiResponse(textResponse('<html>vite error</html>')),
    /登录服务返回了非 JSON 响应/,
  );
});

test('login posts credentials and returns the session user', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: FetchLike = async (url, init) => {
    requests.push({ url: String(url), init });
    return jsonResponse({ success: true, data: user });
  };

  const api = createAuthApi(fetcher);
  assert.deepEqual(await api.login(' viewer1 ', 'secret'), user);
  assert.equal(requests[0].url, '/api/login');
  assert.equal(requests[0].init?.method, 'POST');
  assert.equal(requests[0].init?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    username: ' viewer1 ',
    password: 'secret',
  });
});

test('restores session and surfaces logout failures', async () => {
  const fetcher: FetchLike = async (url) => {
    if (String(url) === '/api/auth/me') {
      return jsonResponse({ success: true, data: user });
    }
    return jsonResponse(
      { success: false, error: { code: 'MONGODB_API_ERROR' }, message: '退出失败' },
      { ok: false, status: 500 },
    );
  };

  const api = createAuthApi(fetcher);
  assert.deepEqual(await api.getMe(), user);
  await assert.rejects(() => api.logout(), /退出失败/);
});
