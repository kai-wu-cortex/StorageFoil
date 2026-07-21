import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import test from 'node:test';
import type { AuthUser } from '../shared/authTypes.ts';
import { createSessionToken } from './sessionAuth.ts';
import {
  setWpsOAuthServiceForTests,
  wpsAuthorizationUrlApiHandler,
  wpsCallbackApiHandler,
} from './wpsOAuthApi.ts';

const admin: AuthUser = { id: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };

function response() {
  const state = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string> };
  const res: Pick<Response, 'status' | 'json' | 'setHeader' | 'redirect'> = {
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
    redirect(statusOrUrl: number | string, maybeUrl?: string | number) {
      state.statusCode = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
      state.headers.Location = typeof statusOrUrl === 'string' ? statusOrUrl : String(maybeUrl || '');
    },
  };
  return { res, state };
}

function request(query: Record<string, unknown> = {}, method = 'GET'): Request {
  return {
    method,
    query,
    headers: { cookie: `storage_foil_session=${createSessionToken(admin, 'secret')}` },
  } as Request;
}

test.afterEach(() => {
  setWpsOAuthServiceForTests(null);
  delete process.env.STORAGE_FOIL_SESSION_SECRET;
});

test('OAuth API returns an admin-only authorization URL with registered redirect', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  setWpsOAuthServiceForTests({
    buildAuthorizationUrl: async () => 'https://openapi.wps.cn/oauth2/auth?redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Fadmin%2Fwps%2Fcallback',
    exchangeCode: async () => undefined,
  });

  const { res, state } = response();
  await wpsAuthorizationUrlApiHandler(request(), res as Response);

  assert.equal(state.statusCode, 200);
  assert.match(JSON.stringify(state.body), /api%2Fadmin%2Fwps%2Fcallback/);
});

test('OAuth callback exchanges code server-side and redirects without token data', async () => {
  process.env.STORAGE_FOIL_SESSION_SECRET = 'secret';
  let exchangedCode = '';
  setWpsOAuthServiceForTests({
    buildAuthorizationUrl: async () => '',
    exchangeCode: async code => {
      exchangedCode = code;
    },
  });

  const { res, state } = response();
  await wpsCallbackApiHandler(request({ code: 'auth-code' }), res as Response);

  assert.equal(exchangedCode, 'auth-code');
  assert.equal(state.statusCode, 302);
  assert.equal(state.headers.Location, '/?admin=wps&authorized=1');
});
