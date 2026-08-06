import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import test from 'node:test';
import { scheduledSyncApiHandler, setScheduledSyncServiceForTests } from './scheduledSyncApi.ts';

function response() {
  const state = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string> };
  const res: Pick<Response, 'status' | 'json' | 'setHeader'> = {
    status(code: number) { state.statusCode = code; return this as Response; },
    json(payload: unknown) { state.body = payload; return this as Response; },
    setHeader(name: string, value: string) { state.headers[name] = value; return this as Response; },
  };
  return { res, state };
}

function request(authorization?: string): Request {
  return {
    method: 'GET',
    headers: authorization ? { authorization } : {},
  } as Request;
}

test.afterEach(() => {
  setScheduledSyncServiceForTests(null);
  delete process.env.CRON_SECRET;
});

test('scheduled sync fails closed when CRON_SECRET is absent or invalid', async () => {
  setScheduledSyncServiceForTests({
    createRun: async () => ({ id: 'run-cron', status: 'published' }),
  });

  const missing = response();
  await scheduledSyncApiHandler(request(), missing.res as Response);
  assert.equal(missing.state.statusCode, 401);

  process.env.CRON_SECRET = 'cron-secret';
  const invalid = response();
  await scheduledSyncApiHandler(request('Bearer wrong'), invalid.res as Response);
  assert.equal(invalid.state.statusCode, 401);
});

test('scheduled sync executes a full run and returns its published status', async () => {
  process.env.CRON_SECRET = 'cron-secret';
  let calls = 0;
  setScheduledSyncServiceForTests({
    createRun: async () => {
      calls += 1;
      return { id: 'run-cron', status: 'published' };
    },
  });

  const accepted = response();
  await scheduledSyncApiHandler(request('Bearer cron-secret'), accepted.res as Response);

  assert.equal(calls, 1);
  assert.equal(accepted.state.statusCode, 200);
  assert.match(JSON.stringify(accepted.state.body), /run-cron/);
  assert.match(JSON.stringify(accepted.state.body), /published/);
});
