// AirScript 示例：触发 StorageFoil 全量同步。
// 只记录状态和 runId，不打印 STORAGE_FOIL_WEBHOOK_SECRET。

const endpoint = 'https://your-storagefoil-domain.vercel.app/api/sync/webhook';
const secret = process.env.STORAGE_FOIL_WEBHOOK_SECRET;
const body = JSON.stringify({ mode: 'full' });
const timestamp = String(Date.now());
const idempotencyKey = `airscript-${timestamp}`;

const signatureHex = CryptoJS.HmacSHA256(
  `${timestamp}.${idempotencyKey}.${body}`,
  secret,
).toString(CryptoJS.enc.Hex);

const response = HTTP.fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-StorageFoil-Timestamp': timestamp,
    'X-StorageFoil-Idempotency-Key': idempotencyKey,
    'X-StorageFoil-Signature': `v1=${signatureHex}`,
  },
  body,
});

console.log({
  status: response.status,
  body: response.json(),
});
