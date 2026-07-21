import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import test from 'node:test';
import { createSessionToken } from './sessionAuth.ts';
import {
  inventoryBootstrapApiHandler,
  inventoryMonthApiHandler,
  setInventoryRepositoryResolverForTests,
} from './inventoryReadApi.ts';

const user = { id: 'viewer', username: 'viewer', displayName: 'Viewer', role: 'viewer' as const };

function createResponse() {
  const state = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string> };
  const res: Pick<Response, 'status' | 'json' | 'setHeader'> = {
    status(code: number) {
      state.statusCode = code;
      return this as Response;
    },
    json(payload: unknown) {
      state.body = payload;
      return this as Response;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return this as Response;
    },
  };
  return { res, state };
}

function request(overrides: Partial<Pick<Request, 'method' | 'headers' | 'query'>>): Request {
  return { method: 'GET', headers: {}, query: {}, ...overrides } as Request;
}

test.afterEach(() => {
  setInventoryRepositoryResolverForTests(null);
  delete process.env.STORAGE_FOIL_SESSION_SECRET;
});

test('inventory read APIs require authentication and no-store cache', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  const { res, state } = createResponse();
  await inventoryBootstrapApiHandler(request({ method: 'GET' }), res as Response);

  assert.equal(state.statusCode, 401);

  setInventoryRepositoryResolverForTests(async () => ({
    bootstrap: async () => ({ user, months: [], defaultMonth: null, month: null, batches: [], sources: [], latestPublishedAt: null, syncRunId: null }),
    inventory: async () => ({ month: '2026-07', batches: [], sources: [], latestPublishedAt: null, syncRunId: null }),
  }));
  const token = createSessionToken(user, 'secret');
  const authed = createResponse();
  await inventoryBootstrapApiHandler(
    request({ method: 'GET', headers: { cookie: `storage_foil_session=${token}` } }),
    authed.res as Response,
  );
  assert.equal(authed.state.statusCode, 200);
  assert.equal(authed.state.headers['Cache-Control'], 'private, no-store');
});

test('inventory month API rejects invalid month with 400', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  const token = createSessionToken(user, 'secret');
  const { res, state } = createResponse();

  await inventoryMonthApiHandler(
    request({ method: 'GET', headers: { cookie: `storage_foil_session=${token}` }, query: { month: '2026-13' } }),
    res as Response,
  );

  assert.equal(state.statusCode, 400);
  assert.equal((state.body as { error: { code: string } }).error.code, 'BAD_MONTH');
});
