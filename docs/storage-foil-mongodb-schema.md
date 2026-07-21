# StorageFoil MongoDB Schema

Schema version: `1`

StorageFoil reuses the Duo Cloud MongoDB connection, but all documents live in collections prefixed with `storage_foil_`. This keeps login sessions, users, WPS credentials, sync state, and inventory publications independent from Duo Cloud collections.

## Collections

- `storage_foil_users`: one document per StorageFoil account. Passwords use `scrypt-v1`; roles are limited to `viewer` and `admin`. The unique `username` index supports login.
- `storage_foil_wps_credentials`: one global WPS credential document. Secret values are AES-GCM encrypted before storage and never returned through public APIs.
- `storage_foil_sync_sources`: dynamic WPS source configuration. Source count is unbounded at the collection level, while each source embeds a bounded field mapping array.
- `storage_foil_sync_runs`: one document per sync attempt. `idempotencyKey` prevents duplicate webhook execution; `status, startedAt` supports the admin run history.
- `storage_foil_inventory_batches`: published candidate rows keyed by `syncRunId`, source, and stable source record key. `dailyActivities` is bounded to 31 items.
- `storage_foil_inventory_publications`: month-level pointer from `YYYY-MM` to the currently published `syncRunId`.
- `storage_foil_sync_locks`: one lock document for full WPS sync. The `expiresAt` TTL index clears stale locks.

## Access Patterns

- Login reads `storage_foil_users` by username.
- Viewer bootstrap reads monthly publication, then inventory batches by `syncRunId`, month, and optional source.
- Admin sync config reads global WPS credentials and all source documents.
- Sync writes batches under a new `syncRunId`, validates run totals, then updates month publication pointers.

## Applying Validators And Indexes

Preview only:

```bash
npm run db:indexes -- --dry-run
```

Apply only after confirming the target database and collection prefix:

```bash
npm run db:indexes -- --apply
```

The script creates missing collections, runs `collMod` for existing validators, and creates the declared indexes idempotently.

## Rollback

Validators can be relaxed without deleting data by running `collMod` with `validationAction: "warn"` or by restoring the previous validator document. Do not drop collections for rollback; inventory publication pointers allow the app to keep serving the last known good sync run while schema issues are corrected.
