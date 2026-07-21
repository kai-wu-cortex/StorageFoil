import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import test from 'node:test';
import authMeHandler from '../../api/auth/me.ts';
import loginHandler from '../../api/login.ts';
import logoutHandler from '../../api/logout.ts';
import { createPasswordHash } from './password.ts';
import { createExpiredSessionCookie, createSessionToken, type SessionUser } from './sessionAuth.ts';
import {
  normalizeUsername,
  setStorageFoilUsersCollectionResolverForTests,
  type StorageFoilUsersCollection,
} from './loginApi.ts';

const ORIGINAL_ENV = { ...process.env };

interface MockResponseState {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

function createMockResponse(): {
  res: Pick<Response, 'status' | 'json' | 'setHeader'>;
  state: MockResponseState;
} {
  const state: MockResponseState = { statusCode: 200, body: null, headers: {} };
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

function createRequest(overrides: Partial<Pick<Request, 'method' | 'body' | 'headers'>>): Request {
  return { method: 'GET', body: undefined, headers: {}, ...overrides } as Request;
}

function successData<T>(body: unknown): T {
  assert.ok(body && typeof body === 'object');
  assert.equal((body as { success?: unknown }).success, true);
  return (body as { data: T }).data;
}

function errorPayload(body: unknown): { code: string; message: string } {
  assert.ok(body && typeof body === 'object');
  assert.equal((body as { success?: unknown }).success, false);
  return {
    code: ((body as { error?: { code?: string } }).error?.code) ?? '',
    message: (body as { message?: string }).message ?? '',
  };
}

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  setStorageFoilUsersCollectionResolverForTests(null);
});

test('normalizeUsername trims and lowercases usernames', () => {
  assert.equal(normalizeUsername(' Viewer01 '), 'viewer01');
});

test('POST /api/login returns session user and emits Set-Cookie', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'session-secret';
  const password = await createPasswordHash('secret');
  const collection: StorageFoilUsersCollection = {
    findOne: async ({ username }) =>
      username === 'admin'
        ? {
            _id: 'admin',
            username: 'admin',
            displayName: 'Admin',
            role: 'admin',
            enabled: true,
            password,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : null,
    updateOne: async () => ({ acknowledged: true }),
  };
  setStorageFoilUsersCollectionResolverForTests(async () => collection);

  const { res, state } = createMockResponse();
  await loginHandler(
    createRequest({ method: 'POST', body: JSON.stringify({ username: ' Admin ', password: 'secret' }) }),
    res as Response,
  );

  assert.equal(state.statusCode, 200);
  assert.deepEqual(successData<SessionUser>(state.body), {
    id: 'admin',
    username: 'admin',
    displayName: 'Admin',
    role: 'admin',
  });
  assert.match(state.headers['Set-Cookie'] ?? '', /^storage_foil_session=/);
  assert.match(state.headers['Set-Cookie'] ?? '', /HttpOnly/);
});

test('POST /api/login returns the same 401 for unknown disabled and wrong-password users', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'session-secret';
  const password = await createPasswordHash('secret');
  const users = new Map([
    ['disabled', { _id: 'disabled', username: 'disabled', displayName: 'Disabled', role: 'viewer' as const, enabled: false, password, createdAt: new Date(), updatedAt: new Date() }],
    ['viewer', { _id: 'viewer', username: 'viewer', displayName: 'Viewer', role: 'viewer' as const, enabled: true, password, createdAt: new Date(), updatedAt: new Date() }],
  ]);
  setStorageFoilUsersCollectionResolverForTests(async () => ({
    findOne: async ({ username }) => users.get(username) ?? null,
    updateOne: async () => ({ acknowledged: true }),
  }));

  const attempts = [
    { username: 'missing', password: 'secret' },
    { username: 'disabled', password: 'secret' },
    { username: 'viewer', password: 'wrong' },
  ];

  const results = [];
  for (const body of attempts) {
    const { res, state } = createMockResponse();
    await loginHandler(createRequest({ method: 'POST', body }), res as Response);
    results.push({ status: state.statusCode, ...errorPayload(state.body) });
  }

  assert.deepEqual(results, [
    { status: 401, code: 'UNAUTHORIZED', message: '用户名或密码错误。' },
    { status: 401, code: 'UNAUTHORIZED', message: '用户名或密码错误。' },
    { status: 401, code: 'UNAUTHORIZED', message: '用户名或密码错误。' },
  ]);
});

test('GET /api/auth/me returns authenticated user and logout clears cookie', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'session-secret';
  const user: SessionUser = {
    id: 'viewer',
    username: 'viewer',
    displayName: 'Viewer',
    role: 'viewer',
  };
  const token = createSessionToken(user, process.env.STORAGE_FOIL_SESSION_SECRET);

  const me = createMockResponse();
  await authMeHandler(
    createRequest({ method: 'GET', headers: { cookie: `storage_foil_session=${token}` } }),
    me.res as Response,
  );
  assert.equal(me.state.statusCode, 200);
  assert.deepEqual(successData<SessionUser>(me.state.body), user);

  const logout = createMockResponse();
  await logoutHandler(createRequest({ method: 'POST' }), logout.res as Response);
  assert.equal(logout.state.statusCode, 200);
  assert.equal(logout.state.headers['Set-Cookie'], createExpiredSessionCookie());
});

test('auth routes enforce method restrictions', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'session-secret';

  const login = createMockResponse();
  await loginHandler(createRequest({ method: 'GET' }), login.res as Response);
  assert.equal(login.state.statusCode, 405);

  const logout = createMockResponse();
  await logoutHandler(createRequest({ method: 'GET' }), logout.res as Response);
  assert.equal(logout.state.statusCode, 405);

  const me = createMockResponse();
  await authMeHandler(createRequest({ method: 'POST' }), me.res as Response);
  assert.equal(me.state.statusCode, 405);
});
