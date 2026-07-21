import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSafeLogEvent,
  logSyncEvent,
} from './observability.ts';

test('safe log event includes operational fields and omits secrets and cell contents', () => {
  const event = createSafeLogEvent({
    requestId: 'req-1',
    syncRunId: 'run-1',
    sourceId: 'pl',
    worksheetId: 7,
    status: 'success',
    durationMs: 123,
    recordCount: 42,
    appKey: 'secret-app-key',
    accessToken: 'secret-token',
    cellText: 'raw cell content',
    mongoUri: 'mongodb+srv://secret',
  });

  assert.deepEqual(event, {
    requestId: 'req-1',
    syncRunId: 'run-1',
    sourceId: 'pl',
    worksheetId: 7,
    status: 'success',
    durationMs: 123,
    recordCount: 42,
  });
  assert.equal(JSON.stringify(event).includes('secret'), false);
  assert.equal(JSON.stringify(event).includes('raw cell'), false);
});

test('sync logger emits one JSON-safe line through the provided logger', () => {
  const lines: unknown[] = [];
  logSyncEvent({ info: value => lines.push(value) }, {
    syncRunId: 'run-1',
    sourceId: 'py',
    worksheetId: 6,
    status: 'failed',
    durationMs: 50,
    errorCode: 'SOURCE_FAILED',
    refreshToken: 'must-not-log',
  });

  assert.equal(lines.length, 1);
  assert.match(String(lines[0]), /"syncRunId":"run-1"/);
  assert.match(String(lines[0]), /"errorCode":"SOURCE_FAILED"/);
  assert.doesNotMatch(String(lines[0]), /must-not-log/);
});
