# ECPay reversal sync production alignment — 2026-09-24

## Production change

The SQL introduced in [#863](https://github.com/spyuilin688-sudo/lottery-matrix/pull/863) was absent from production after its repository merge. It was applied as **one targeted migration** named `sync_ecpay_payment_reversals`. Supabase recorded version `20260924121843`, so the repository file was renamed from `20260924072000_sync_ecpay_payment_reversals.sql` to `20260924121843_sync_ecpay_payment_reversals.sql`. The SQL bytes did not change (MD5 `c2266383230bee5e6d7902b82e8b72db`). No earlier migration was replayed and the ledger was not manually repaired.

The SQL added the `payments` reversal trigger, allowed refunded, chargeback and cancelled on `ecpay_orders`, and updated the existing five-argument payment confirmation and quota functions. The four-argument compatibility wrapper remains present. The two later migrations that were already recorded before this change concern introduction-page visits and Tiangong restrictions; they do not change these payment functions.

After the SQL, `ecpay-notify` was deployed from v10 to v11 and `admin-api` from v61 to v62. Each bundle changes only the corresponding #863 source file: `supabase/functions/ecpay-notify/handler.ts` and `apps/admin/backend/admin-data.ts`. Existing `verify_jwt=false` and the admin import map were preserved.

## Verification and scope

- Before applying: 4 ECPay orders, 2 linked payments, 0 reversed payments; all linked identities matched. The backfill therefore did not need to update an existing reversed row.
- After applying: the recorded SQL MD5 matches the repository SQL, both new order constraints contain the three terminal statuses, the `payments` trigger is enabled, the sync function exists, the five-argument confirmation and quota functions recognize terminal statuses, and there are 0 reversed-payment/order mismatches.
- Both Edge bundles were read back as `ACTIVE` with the expected versions, authentication settings, source file counts and exact source content.
- The isolated PGlite reversal-sync test had 6/6 passing cases, covering refunded, chargeback, cancelled, historical backfill and a mismatched-order rollback. No synthetic refund or payment was created in production.
- The migration-history reconciliation test passed 4/4 cases with the earlier 254-record evidence snapshot preserved and the later applied filename verified against its original SHA256.

The previous [migration-history audit](migration-history-remaining-20260924.md) and its JSON evidence describe the earlier 254-row snapshot and are retained as historical records. After this targeted change, the production ledger has 255 recorded migrations; the remaining repository-only SQL files are the older subscription-pricing and v12 Explore files. The pre-existing historical SQL-content differences and those two repository-only files mean a bulk `db push` is still unverified.
