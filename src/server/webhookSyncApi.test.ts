import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import test from 'node:test';
import {
  setWebhookSyncServiceForTests,
  webhookSyncApiHandler,
} from './webhookSyncApi.ts';

function sign(secret: string, timestamp: string, idempotencyKey: string, body: string): string {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${idempotencyKey}.${body}`).digest('hex')}`;
}

function response() {
  const state = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string> };
  const res: Pick<Response, 'status' | 'json' | 'setHeader'> = {
    status(code: number) { state.statusCode = code; return this as Response; },
    json(payload: unknown) { state.body = payload; return this as Response; },
    setHeader(name: string, value: string) { state.headers[name] = value; return this as Response; },
  };
  return { res, state };
}

function request(rawBody: string, headers: Record<string, string>): Request {
  return { method: 'POST', headers, body: rawBody } as Request;
}

test.afterEach(() => {
  setWebhookSyncServiceForTests(null);
  delete process.env.STORAGE_FOIL_WEBHOOK_SECRET;
});

test('webhook sync validates HMAC creates run and returns 202', async () => {
  process.env.STORAGE_FOIL_WEBHOOK_SECRET = 'secret';
  const rawBody = '{"mode":"full"}';
  const timestamp = String(Date.now());
  const idempotencyKey = 'airscript-1';
  setWebhookSyncServiceForTests({
    createRun: async input => ({ id: `run-${input.idempotencyKey}`, status: 'queued' }),
  });

  const { res, state } = response();
  await webhookSyncApiHandler(
    request(rawBody, {
      'x-storagefoil-timestamp': timestamp,
      'x-storagefoil-idempotency-key': idempotencyKey,
      'x-storagefoil-signature': sign('secret', timestamp, idempotencyKey, rawBody),
    }),
    res as Response,
  );

  assert.equal(state.statusCode, 202);
  assert.match(JSON.stringify(state.body), /run-airscript-1/);
});

test('webhook sync does not accept session cookies as authorization', async () => {
  process.env.STORAGE_FOIL_WEBHOOK_SECRET = 'secret';
  setWebhookSyncServiceForTests({ createRun: async () => ({ id: 'run-1', status: 'queued' }) });

  const { res, state } = response();
  await webhookSyncApiHandler(
    request('{"mode":"full"}', { cookie: 'storage_foil_session=anything' }),
    res as Response,
  );

  assert.equal(state.statusCode, 401);
});
