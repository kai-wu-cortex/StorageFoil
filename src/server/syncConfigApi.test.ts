import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import test from 'node:test';
import type { AuthUser } from '../shared/authTypes.ts';
import { createSessionToken } from './sessionAuth.ts';
import {
  setSyncConfigRepositoryForTests,
  syncConfigApiHandler,
} from './syncConfigApi.ts';

const admin: AuthUser = { id: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const viewer = { ...admin, id: 'viewer', username: 'viewer', role: 'viewer' as const };

function response() {
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

function request(user = admin, method = 'GET', body?: unknown): Request {
  return {
    method,
    body,
    headers: { cookie: `storage_foil_session=${createSessionToken(user, 'secret')}` },
  } as Request;
}

test.afterEach(() => {
  setSyncConfigRepositoryForTests(null);
  delete process.env.STORAGE_FOIL_SESSION_SECRET;
  delete process.env.STORAGE_FOIL_CONFIG_ENCRYPTION_KEY;
});

test('sync config API is admin-only and rejects viewers', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  const { res, state } = response();
  await syncConfigApiHandler(request(viewer), res as Response);

  assert.equal(state.statusCode, 403);
});

test('sync config API returns public config and maps stale updates to 409', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  process.env.STORAGE_FOIL_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
  setSyncConfigRepositoryForTests({
    get: async () => ({
      credentials: {
        apiBase: 'https://openapi.wps.cn',
        appId: 'app-id',
        redirectUri: 'https://storage.example.com/callback',
        hasAppKey: true,
        hasRefreshToken: false,
        updatedAt: '2026-07-21T00:00:00.000Z',
        updatedBy: 'admin',
      },
      sources: [],
      revision: 'rev-1',
    }),
    update: async () => {
      throw new Error('CONFIG_CONFLICT');
    },
  });

  const get = response();
  await syncConfigApiHandler(request(admin), get.res as Response);
  assert.equal(get.state.statusCode, 200);
  assert.equal((get.state.body as { data: { revision: string } }).data.revision, 'rev-1');
  assert.equal(JSON.stringify(get.state.body).includes('secret'), false);

  const put = response();
  await syncConfigApiHandler(request(admin, 'PUT', { revision: 'stale', credentials: {}, sources: [] }), put.res as Response);
  assert.equal(put.state.statusCode, 409);
});
