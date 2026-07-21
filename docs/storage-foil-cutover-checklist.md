# StorageFoil MongoDB cutover checklist

1. Confirm the target MongoDB database name and `storage_foil_` collection prefix with the operator.
2. Run `npm run db:indexes -- --dry-run` and review every collection, validator, and index action.
3. After explicit approval, run `npm run db:indexes -- --apply --confirm-db <resolved-db-name>`.
4. Review the 11-account manifest: 10 `viewer` accounts and 1 `admin` account.
5. After explicit approval, seed accounts with the dry-run/apply flow. Do not store plaintext passwords in Git or logs.
6. Configure Vercel Preview server-only variables: MongoDB URI, StorageFoil database name, session secret, config encryption key, webhook secret, WPS API base, and exact WPS redirect URI.
7. Admin enters global WPS App ID/App Key and the five operator-supplied File IDs:
   - PL：`PL2026年出入库明细-20260707.xlsx`
   - PC粉箔：`PC粉箔2026年出入库表.xlsx`
   - PY：`PY2026年6月入库表-20260708(1).xlsx`
   - PK：`PK2026入库明细-20260701.xlsx`
   - PC：`PC2026年出入表-20260703(3)(3).xlsx`
8. Run the first Preview sync from the admin console.
9. Compare all five source/month record counts, inflow, outflow, stock totals, missing required fields, duplicate record keys, and publication pointer matches against the XLSX baselines.
10. Test login, logout, all 10 viewers, admin-only API rejection, and admin config access.
11. Configure Production variables and the exact Production WPS redirect URI.
12. Run Production sync and verify the publication pointer.
13. Deploy frontend cutover.
14. Retain the previous production deployment for immediate rollback.
