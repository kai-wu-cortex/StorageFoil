import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import test from 'node:test';
import {
  httpSyncApiHandler,
  setHttpSyncServiceForTests,
} from './httpSyncApi.ts';

function response() {
  const state = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string> };
  const res: Pick<Response, 'status' | 'json' | 'setHeader'> = {
    status(code: number) { state.statusCode = code; return this as Response; },
    json(payload: unknown) { state.body = payload; return this as Response; },
    setHeader(name: string, value: string) { state.headers[name] = value; return this as Response; },
  };
  return { res, state };
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return { method: 'POST', headers, body } as Request;
}

test.afterEach(() => {
  setHttpSyncServiceForTests(null);
  delete process.env.STORAGE_FOIL_WEBHOOK_SECRET;
});

test('HTTP sync requires shared secret and fileId', async () => {
  process.env.STORAGE_FOIL_WEBHOOK_SECRET = 'secret';

  const unauthorized = response();
  await httpSyncApiHandler(
    request({ mode: 'full', fileId: 'file-1' }),
    unauthorized.res as Response,
  );
  assert.equal(unauthorized.state.statusCode, 401);

  const missingFile = response();
  await httpSyncApiHandler(
    request({ mode: 'full' }, { 'x-storagefoil-secret': 'secret' }),
    missingFile.res as Response,
  );
  assert.equal(missingFile.state.statusCode, 400);
  assert.match(JSON.stringify(missingFile.state.body), /fileId/);
});

test('HTTP sync records requested fileId and returns terminal run', async () => {
  process.env.STORAGE_FOIL_WEBHOOK_SECRET = 'secret';
  let seenInput: { idempotencyKey: string; fileId: string } | null = null;
  setHttpSyncServiceForTests({
    createRun: async input => {
      seenInput = input;
      return {
        id: 'run-http-1',
        status: 'published',
        trigger: 'http',
        triggeredBy: `http:${input.fileId}`,
        requestedFileId: input.fileId,
        startedAt: '2026-07-21T00:00:00.000Z',
        sourceResults: [],
        totals: { sources: 1, worksheets: 2, records: 490, failures: 0 },
      };
    },
  });

  const accepted = response();
  await httpSyncApiHandler(
    request(
      { mode: 'full', fileId: 'cq8B02TOSg9P', idempotencyKey: 'wps-cq8B02TOSg9P-1' },
      { 'x-storagefoil-secret': 'secret' },
    ),
    accepted.res as Response,
  );

  assert.equal(accepted.state.statusCode, 202);
  assert.deepEqual(seenInput, { fileId: 'cq8B02TOSg9P', idempotencyKey: 'wps-cq8B02TOSg9P-1' });
  assert.match(JSON.stringify(accepted.state.body), /cq8B02TOSg9P/);
});
