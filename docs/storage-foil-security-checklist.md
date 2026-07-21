# StorageFoil security checklist

## Secrets

- No `MONGODB_URI`, WPS App Key, OAuth code, access token, refresh token, session secret, encryption key, or webhook secret is committed.
- WPS/Mongo/session/webhook variables are server-only and do not use `VITE_`.
- Browser storage contains only interface preferences. It must not contain WPS credentials, OAuth tokens, MongoDB data, or inventory business datasets.
- Logs omit passwords, session cookies, MongoDB URI, WPS App Key, OAuth code, access/refresh tokens, webhook secret, and raw cell contents.

## Authentication and authorization

- Unauthenticated users cannot see inventory data.
- `viewer` users can only read published inventory.
- `admin` users can read/update sync config, authorize WPS, trigger sync, and inspect sync runs.
- Webhook authorization uses HMAC headers only; browser session cookies are ignored for `/api/sync/webhook`.

## Data publication safety

- WPS sync writes a new `syncRunId` version before publishing.
- Month publication pointers change only after validation.
- Failed runs leave the previous published pointer untouched.
- Concurrent full sync runs are guarded by the MongoDB lock.
- Duplicate webhook/admin triggers reuse idempotency keys.

## MongoDB operations

- Run `npm run db:indexes -- --dry-run` first.
- Show the resolved database name and proposed collection/index actions before any write.
- Only run `--apply` after explicit operator approval and `--confirm-db <resolved-db-name>`.
- Account seeding follows the same dry-run, approval, and confirm-db process.

## Verification commands

```bash
npm ci
npm test
npm run lint
npm run build
rg -n "MONGODB_URI=.+|APP_KEY=.+|SESSION_SECRET=.+|WEBHOOK_SECRET=.+" . --glob '!node_modules/**' --glob '!.git/**'
```

The final `rg` command should produce no populated secret matches.
