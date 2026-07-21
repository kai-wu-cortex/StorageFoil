import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  verifyWebhookSignature,
} from './webhookAuth.ts';

function sign(secret: string, timestamp: string, idempotencyKey: string, body: string): string {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${idempotencyKey}.${body}`).digest('hex')}`;
}

test('webhook auth accepts exact raw body signature', () => {
  const now = new Date('2026-07-21T00:00:00Z');
  const body = '{"mode":"full"}';
  const timestamp = String(now.getTime());
  const idempotencyKey = 'airscript-1';

  const result = verifyWebhookSignature(
    {
      'x-storagefoil-timestamp': timestamp,
      'x-storagefoil-idempotency-key': idempotencyKey,
      'x-storagefoil-signature': sign('secret', timestamp, idempotencyKey, body),
    },
    body,
    'secret',
    now,
  );

  assert.deepEqual(result, { timestamp: Number(timestamp), idempotencyKey });
});

test('webhook auth rejects missing invalid stale future and changed-body signatures', () => {
  const now = new Date('2026-07-21T00:00:00Z');
  const timestamp = String(now.getTime());
  const signature = sign('secret', timestamp, 'idem', '{"mode":"full"}');

  assert.throws(() => verifyWebhookSignature({}, '{}', 'secret', now), /Missing webhook timestamp/);
  assert.throws(
    () => verifyWebhookSignature({ 'x-storagefoil-timestamp': timestamp, 'x-storagefoil-idempotency-key': 'idem', 'x-storagefoil-signature': 'v1=bad' }, '{"mode":"full"}', 'secret', now),
    /Invalid webhook signature/,
  );
  assert.throws(
    () => verifyWebhookSignature({ 'x-storagefoil-timestamp': String(now.getTime() - 10 * 60 * 1000), 'x-storagefoil-idempotency-key': 'idem', 'x-storagefoil-signature': signature }, '{"mode":"full"}', 'secret', now),
    /Webhook timestamp expired/,
  );
  assert.throws(
    () => verifyWebhookSignature({ 'x-storagefoil-timestamp': String(now.getTime() + 10 * 60 * 1000), 'x-storagefoil-idempotency-key': 'idem', 'x-storagefoil-signature': signature }, '{"mode":"full"}', 'secret', now),
    /Webhook timestamp expired/,
  );
  assert.throws(
    () => verifyWebhookSignature({ 'x-storagefoil-timestamp': timestamp, 'x-storagefoil-idempotency-key': 'idem', 'x-storagefoil-signature': signature }, '{ "mode":"full" }', 'secret', now),
    /Invalid webhook signature/,
  );
});
