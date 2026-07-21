# StorageFoil Account Runbook

StorageFoil uses independent `storage_foil_users` accounts in the shared Duo Cloud MongoDB database. The required production shape is exactly 10 enabled `viewer` accounts and 1 enabled `admin` account.

## Initial Creation

1. Prepare a JSON manifest with 11 entries:

```json
{
  "accounts": [
    { "username": "admin", "displayName": "Admin", "role": "admin", "passwordEnv": "STORAGE_FOIL_ADMIN_PASSWORD" },
    { "username": "viewer01", "displayName": "Viewer 01", "role": "viewer", "passwordEnv": "STORAGE_FOIL_VIEWER01_PASSWORD" }
  ]
}
```

2. Export each password environment variable named in the manifest.
3. Preview the target accounts:

```bash
npm run users:seed -- --manifest ./storage-foil-users.json --dry-run
```

4. Apply only after confirming the database name printed by the dry-run:

```bash
npm run users:seed -- --manifest ./storage-foil-users.json --apply --confirm-db duocloudDB
```

The script upserts only manifest accounts. It does not delete unrelated documents.

## Password Rotation

1. Change the target account password environment variable.
2. Keep the manifest username, display name, role, and password environment variable name stable.
3. Run dry-run, then apply with `--confirm-db`.

Rotation replaces the stored `scrypt-v1` password hash and updates `updatedAt`.

## Disable Or Enable

Use a controlled MongoDB update against `storage_foil_users.enabled` after recording the operator and reason in your deployment notes. Do not remove the document unless the account is permanently retired and a replacement manifest has already been approved.

## Admin Replacement

The manifest must still contain exactly one admin. To replace the admin, add the new admin, remove the old admin from the manifest, dry-run, and apply. Then disable the old admin document manually if it should no longer authenticate.

## Audit Checks

Before each release or credential rotation, verify:

- `storage_foil_users` has exactly 10 enabled viewers and 1 enabled admin.
- No account uses a role outside `viewer` or `admin`.
- The login cookie name remains `storage_foil_session`.
- The app has `STORAGE_FOIL_SESSION_SECRET` configured.

## Emergency Session Secret Rotation

Rotate `STORAGE_FOIL_SESSION_SECRET` in Vercel to invalidate all active sessions immediately. Users must log in again. This does not change stored passwords.
