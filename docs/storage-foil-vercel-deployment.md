# StorageFoil Vercel deployment and rollback

## CLI prerequisite

The local Vercel CLI reported by the environment is outdated (`54.14.0`). Upgrade before deployment:

```bash
npm i -g vercel@latest
```

or:

```bash
pnpm add -g vercel@latest
```

## CI

GitHub Actions runs on pushes and pull requests targeting `develop`:

```bash
npm ci
npm test
npm run lint
npm run build
```

CI must not connect to production MongoDB or WPS.

## Preview environment setup

Use Vercel environment variables for server-only configuration. Do not commit these values.

Required variables:

- `MONGODB_URI`
- `MONGODB_DIRECT_URI` if needed
- `STORAGE_FOIL_DB_NAME`
- `KNOWLEDGE_DB_NAME` only if using the Duo Cloud fallback
- `STORAGE_FOIL_SESSION_SECRET`
- `STORAGE_FOIL_CONFIG_ENCRYPTION_KEY`
- `STORAGE_FOIL_WEBHOOK_SECRET`
- `STORAGE_FOIL_WPS_API_BASE`
- `STORAGE_FOIL_WPS_REDIRECT_URI`

Use `vercel env` or the Vercel dashboard. Preview and Production must use independent session, webhook, and encryption secrets.

## Database setup gate

Run read-only inspection first:

```bash
npm run db:indexes -- --dry-run
```

Show the resolved database name and planned actions. After explicit approval:

```bash
npm run db:indexes -- --apply --confirm-db <resolved-db-name>
```

## Account seeding gate

Validate the 10 viewer accounts and 1 admin account with dry-run first. Do not print plaintext passwords in logs or commit them.

After explicit approval:

```bash
npm run users:seed -- --apply --confirm-db <resolved-db-name>
```

## Preview smoke tests

Before Production:

1. Unauthenticated users are redirected to login.
2. All 10 viewers can read inventory and cannot access admin APIs.
3. The admin can read/update sync config.
4. WPS OAuth callback uses the exact registered Preview redirect URI.
5. Manual sync creates a run.
6. Signed AirScript webhook creates or reuses a run.
7. Duplicate webhook idempotency key does not create another run.
8. Forced source failure leaves old publication visible.
9. Successful run changes the publication pointer.
10. Viewer sees updated data after re-login or explicit refresh.
11. Browser storage contains no WPS secret or inventory dataset.

## Rollback rehearsal

Before production cutover:

1. Identify the last known-good Vercel deployment.
2. Confirm the operator has Vercel rollback permission.
3. Confirm old MongoDB publication data remains intact.
4. Simulate frontend rollback without changing MongoDB.
5. Record the rollback target URL or deployment ID.

Rollback command:

```bash
vercel rollback <deployment-url-or-id>
```

or use the Vercel dashboard rollback action.

## Production rollout

1. Deploy `develop` to Preview.
2. Complete all Preview smoke tests.
3. Merge through the normal repository process.
4. Configure Production environment variables and the exact Production WPS redirect URI.
5. Deploy Production.
6. Run production smoke tests.
7. Point WPS/AirScript at Production only after auth and read paths pass.
