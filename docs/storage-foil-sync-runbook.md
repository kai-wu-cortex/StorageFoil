# StorageFoil sync runbook

## Manual trigger

Use the admin console or `POST /api/admin/sync/run` with an admin session. The response returns `202` and a `runId`.

## AirScript webhook

AirScript calls `POST /api/sync/webhook` with:

- `X-StorageFoil-Timestamp`: Unix milliseconds.
- `X-StorageFoil-Idempotency-Key`: unique caller-generated key.
- `X-StorageFoil-Signature`: `v1=<hex HMAC-SHA256>`.

The signature input is:

```text
${timestamp}.${idempotencyKey}.${rawBody}
```

## Retry semantics

Reuse the same idempotency key only for retrying the exact same trigger. Use a new key for a new sync attempt.

## Failure diagnosis

Check `GET /api/admin/sync/runs/:runId` from an admin session. Confirm `totals.failures`, `sourceResults`, and `errorSummary`.

## Publication safety

Inventory readers only see `storage_foil_inventory_publications`. Failed runs do not switch the publication pointer, so the last good `syncRunId` remains visible.

## Secret rotation

Rotate `STORAGE_FOIL_WEBHOOK_SECRET` in Vercel and AirScript together. During rotation, pause scheduled webhook calls to avoid mixed-signature failures.
