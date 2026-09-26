# Daily architecture billing sync

GitHub and Railway are synchronized once per Asia/Taipei calendar day at 09:20 (01:20 UTC), using `matrix-architecture-billing-daily`. The frontend reads the stored snapshot once on entry; it never polls provider APIs.

POST requires the existing server-only `x-matrix-dispatch-token`. Credentials are only read from Edge Function secrets. No API token, invoice URL or card information is persisted in source or frontend responses. A server-authorized `{ "dryRun": true }` previews normalized billing fields without claiming a daily run or changing snapshots.

## Scope and semantics

- GitHub: sum the API's current UTC month `netAmount` values, excluding subscription fees. Preserve manually verified payment history together with its original verification date. The API does not supply a complete invoice estimate.
- Railway: current compute usage plus `agentUsage.totalUsedCents / 100`, with matching billing periods. Show the active subscription's `nextInvoiceCurrentTotal / 100` separately as a potentially delayed pending-invoice snapshot. Invoice `total` is cents; current usage is dollars. Usage estimates follow the official Railway CLI `src/commands/usage.rs` conversion and include accrued Agent usage. They are explicitly labeled BEFORE plan adjustments and credits, not final invoices. Never invent payment dates from invoice periods.
- Supabase: organization billing API remains unverified. Existing snapshots and timestamps are unchanged.
- Cloudflare Pages: billing credentials work, but Pages-specific coverage remains unverified. Existing snapshots and timestamps are unchanged. A free zone subscription must not be reported as the Pages plan.

## Persistence and failure handling

`claim_admin_architecture_billing_run` provides an atomic, unique Taipei-day claim. Only `service_role` can use the RPCs or read run history. An unauthorized request makes no database/provider calls. A duplicate call returns `already_claimed` without provider calls. One provider failing never overwrites its last good snapshot or blocks the other provider. Malformed/incomplete provider responses fail closed. A process crash leaves a visible `running` record; it does not automatically loop or retry that day.

`finish_admin_architecture_billing_run` locks the running record, rejects stale/duplicate completion, saves prior snapshots for rollback and updates successful snapshots in one transaction. Plan, price and renewal fields are not inferred from billing usage. The durable results record explicitly lists the two pending providers.

## Verification and rollback

Run `node --test tests/architecture-billing-sync.test.mjs tests/architecture-billing-preflight.test.mjs`.

Verify API previews against provider UI before enabling the cron. Check `cron.job_run_details`, the run record and persisted snapshot together; a queued HTTP request alone is not proof of synchronization.

To stop automatic synchronization, unschedule the named cron job. The existing snapshots remain readable. Prior snapshots are retained in `admin_architecture_billing_runs.previous_snapshots` for an explicitly requested rollback. Never publish those private values in migrations or PRs.
