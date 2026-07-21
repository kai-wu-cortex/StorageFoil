import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifiedWebhook {
  timestamp: number;
  idempotencyKey: string;
}

function headerValue(headers: Record<string, unknown>, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function verifyWebhookSignature(
  headers: Record<string, unknown>,
  rawBody: string,
  secret: string,
  now = new Date(),
): VerifiedWebhook {
  const timestampRaw = headerValue(headers, 'x-storagefoil-timestamp');
  const idempotencyKey = headerValue(headers, 'x-storagefoil-idempotency-key');
  const signature = headerValue(headers, 'x-storagefoil-signature');
  if (!timestampRaw) throw new Error('Missing webhook timestamp.');
  if (!idempotencyKey) throw new Error('Missing webhook idempotency key.');
  if (!signature) throw new Error('Missing webhook signature.');
  if (!secret) throw new Error('Missing webhook secret.');

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid webhook timestamp.');
  if (Math.abs(now.getTime() - timestamp) > 5 * 60 * 1000) {
    throw new Error('Webhook timestamp expired.');
  }

  const received = signature.startsWith('v1=') ? signature.slice(3) : '';
  const expected = createHmac('sha256', secret)
    .update(`${timestampRaw}.${idempotencyKey}.${rawBody}`)
    .digest('hex');
  if (!received || !safeEqualHex(received, expected)) {
    throw new Error('Invalid webhook signature.');
  }
  return { timestamp, idempotencyKey };
}
