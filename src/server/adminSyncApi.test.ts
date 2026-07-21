import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import test from 'node:test';
import type { AuthUser } from '../shared/authTypes.ts';
import { createSessionToken } from './sessionAuth.ts';
import {
  adminSyncRunApiHandler,
  adminSyncRunStatusApiHandler,
  setAdminSyncServiceForTests,
} from './adminSyncApi.ts';

const admin: AuthUser = { id: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const viewer: AuthUser = { ...admin, id: 'viewer', username: 'viewer', role: 'viewer' };

function response() {
  const state = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string> };
  const res: Pick<Response, 'status' | 'json' | 'setHeader'> = {
    status(code: number) { state.statusCode = code; return this as Response; },
    json(payload: unknown) { state.body = payload; return this as Response; },
    setHeader(name: string, value: string) { state.headers[name] = value; return this as Response; },
  };
  return { res, state };
}

function request(user: AuthUser, body?: unknown, query: Record<string, unknown> = {}): Request {
  return {
    method: 'POST',
    body,
    query,
    headers: {
      cookie: `storage_foil_session=${createSessionToken(user, 'secret')}`,
      origin: 'http://localhost:3000',
    },
  } as Request;
}

test.afterEach(() => {
  setAdminSyncServiceForTests(null);
  delete process.env.STORAGE_FOIL_SESSION_SECRET;
});

test('admin sync trigger requires admin role and returns 202 run id', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  setAdminSyncServiceForTests({
    createRun: async () => ({ id: 'run-1', status: 'queued' }),
    getRun: async () => null,
  });

  const forbidden = response();
  await adminSyncRunApiHandler(request(viewer), forbidden.res as Response);
  assert.equal(forbidden.state.statusCode, 403);

  const accepted = response();
  await adminSyncRunApiHandler(request(admin, { idempotencyKey: 'idem-1' }), accepted.res as Response);
  assert.equal(accepted.state.statusCode, 202);
  assert.match(JSON.stringify(accepted.state.body), /run-1/);
});

test('admin sync status returns sanitized run status', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  setAdminSyncServiceForTests({
    createRun: async () => ({ id: 'run-1', status: 'queued' }),
    getRun: async () => ({ id: 'run-1', status: 'published', totals: { sources: 1, worksheets: 1, records: 2, failures: 0 } }),
  });

  const status = response();
  const req = request(admin, undefined, { runId: 'run-1' });
  req.method = 'GET';
  await adminSyncRunStatusApiHandler(req, status.res as Response);

  assert.equal(status.state.statusCode, 200);
  assert.match(JSON.stringify(status.state.body), /published/);
});

test('admin sync returns actionable failure when WPS secrets need reauthorization', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  setAdminSyncServiceForTests({
    createRun: async () => ({
      id: 'run-reauth',
      status: 'failed',
      errorSummary: 'WPS 凭据无法解密，请重新保存 App Key 并重新授权 WPS。',
    }),
    getRun: async () => null,
  });

  const accepted = response();
  await adminSyncRunApiHandler(request(admin, { idempotencyKey: 'idem-reauth' }), accepted.res as Response);

  assert.equal(accepted.state.statusCode, 202);
  assert.match(JSON.stringify(accepted.state.body), /重新保存 App Key/);
});
