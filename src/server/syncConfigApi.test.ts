import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import test from 'node:test';
import type { AuthUser } from '../shared/authTypes.ts';
import { createSessionToken } from './sessionAuth.ts';
import {
  setSyncConfigOperationLogsForTests,
  setSyncConfigRepositoryForTests,
  setSyncConfigWpsPreviewForTests,
  syncConfigApiHandler,
} from './syncConfigApi.ts';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig.ts';

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

function request(user = admin, method = 'GET', body?: unknown, query: Record<string, unknown> = {}): Request {
  return {
    method,
    body,
    query,
    headers: { cookie: `storage_foil_session=${createSessionToken(user, 'secret')}` },
  } as Request;
}

test.afterEach(() => {
  setSyncConfigOperationLogsForTests(null);
  setSyncConfigRepositoryForTests(null);
  setSyncConfigWpsPreviewForTests(null);
  delete process.env.STORAGE_FOIL_SESSION_SECRET;
  delete process.env.STORAGE_FOIL_CONFIG_ENCRYPTION_KEY;
});

test('WPS preview falls back from a missing sheet id and reads zero-based product model column', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  setSyncConfigRepositoryForTests({
    get: async () => ({
      credentials: {
        apiBase: 'https://openapi.wps.cn',
        appId: 'app-id',
        redirectUri: 'https://storage.example.com/callback',
        hasAppKey: true,
        hasRefreshToken: true,
        updatedAt: '',
        updatedBy: 'admin',
      },
      sources: [{
        id: 'py',
        name: 'PY',
        alias: 'PY',
        enabled: true,
        fileId: 'file-py',
        worksheetIdStart: 1,
        worksheetIdEnd: 12,
        rowFrom: 1,
        rowTo: 300,
        colFrom: 1,
        colTo: 80,
        fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
        updatedAt: '',
        updatedBy: 'admin',
      }],
      revision: '',
    }),
    update: async () => {
      throw new Error('not used');
    },
  });
  let requestedWorksheetId = 0;
  setSyncConfigWpsPreviewForTests({
    getAccessToken: async () => ({ accessToken: 'token', apiBase: 'https://openapi.wps.cn' }),
    fetchWorksheets: async () => [
      { sheet_id: 6, name: '6月' },
      { sheet_id: 7, name: '7月' },
    ],
    fetchRangeData: async (_token, request) => {
      requestedWorksheetId = request.worksheetId;
      return {
        headers: ['产品型号', '产品批次'],
        batches: [],
        rawData: { data: { range_data: [{ row_from: 1, col_from: 0, cell_text: '产品型号' }] } },
      };
    },
  });

  const preview = response();
  await syncConfigApiHandler(
    request(admin, 'GET', undefined, { view: 'wps-preview', sourceId: 'py', worksheetId: '1' }),
    preview.res as Response,
  );

  assert.equal(preview.state.statusCode, 200);
  assert.equal(requestedWorksheetId, 7);
  assert.equal((preview.state.body as { data: { worksheetId: number; request: { colFrom: number } } }).data.worksheetId, 7);
  assert.equal((preview.state.body as { data: { request: { colFrom: number } } }).data.request.colFrom, 0);
});

test('sync config API is admin-only and rejects viewers', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  const { res, state } = response();
  await syncConfigApiHandler(request(viewer), res as Response);

  assert.equal(state.statusCode, 403);
});

test('operation logs view allows viewers without exposing sync config', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  let seenQuery: unknown;
  setSyncConfigOperationLogsForTests(async query => {
    seenQuery = query;
    return [{
      id: 'log-1',
      type: 'sync_published',
      level: 'success',
      message: '同步发布完成',
      triggeredBy: 'admin',
      createdAt: '2026-07-21T00:00:00.000Z',
    }];
  });

  const logs = response();
  await syncConfigApiHandler(
    request(viewer, 'GET', undefined, { view: 'operation-logs', limit: '10', type: 'sync_published' }),
    logs.res as Response,
  );

  assert.equal(logs.state.statusCode, 200);
  assert.equal((logs.state.body as { data: { logs: unknown[] } }).data.logs.length, 1);
  assert.deepEqual(seenQuery, { limit: 10, type: 'sync_published', sourceId: undefined, month: undefined, syncRunId: undefined });

  const config = response();
  await syncConfigApiHandler(request(viewer), config.res as Response);
  assert.equal(config.state.statusCode, 403);
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
