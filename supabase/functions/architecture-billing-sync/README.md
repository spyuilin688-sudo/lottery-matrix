# Daily architecture billing sync

GitHub, Railway and Cloudflare are synchronized once per Asia/Taipei calendar day at 09:20 (01:20 UTC), using `matrix-architecture-billing-daily`. The frontend reads the stored snapshot once on entry; it never polls provider APIs.

POST requires the existing server-only `x-matrix-dispatch-token`. Credentials are only read from Edge Function secrets. No API token, invoice URL or card information is persisted in source or frontend responses. A server-authorized `{ "dryRun": true }` previews normalized billing fields without claiming a daily run or changing snapshots.

## Scope and semantics

- GitHub: sum the API's current UTC month `netAmount` values, excluding subscription fees. Preserve manually verified payment history together with its original verification date. The API does not supply a complete invoice estimate.
- Railway: current compute usage plus `agentUsage.totalUsedCents / 100`, with matching billing periods. Show the active subscription's `nextInvoiceCurrentTotal / 100` separately as a potentially delayed pending-invoice snapshot. Invoice `total` is cents; current usage is dollars. Usage estimates follow the official Railway CLI `src/commands/usage.rs` conversion and include accrued Agent usage. They are explicitly labeled BEFORE plan adjustments and credits, not final invoices. Never invent payment dates from invoice periods.
- Supabase: organization billing API remains unverified. Existing snapshots and timestamps are unchanged.
- Cloudflare: synchronizes project access, account subscriptions, billing-history count, usage coverage and Pages entitlements. No account-wide history row is treated as a Pages invoice or payment. Empty history and uncovered usage stay unknown, never zero. Five read requests run once in the existing daily job; incomplete history (20 or more entries or a larger total_count) fails closed. Preserve separately verified account data and never infer Pages plan, price, usage or debit date from the zone plan.

## Persistence and failure handling

The optional `billing_snapshot.account` contains separately verified provider-dashboard payment estimates, itemized costs and quotas. Daily GitHub/Railway usage synchronization preserves this object and its original `verifiedAt` unchanged. Its date is shown separately from automated usage confirmation; it must never be presented as freshly synchronized quota data. Neither a billing-cycle end nor a historical payment date is a confirmed future debit date. Spending limits are labeled as paid limits, not included credits. Frontend expansion uses the existing stored response and makes no additional requests. Only allowlisted display fields are exposed by the shared admin reader; provider secrets and private invoice links are never included.

`claim_admin_architecture_billing_run` provides an atomic, unique Taipei-day claim. Only `service_role` can use the RPCs or read run history. An unauthorized request makes no database/provider calls. A duplicate call returns `already_claimed` without provider calls. One provider failing never overwrites its last good snapshot or blocks the other provider. Malformed/incomplete provider responses fail closed.

HTTP result status and database status both distinguish `completed`, `partial` and `failed` for the three supported providers. A caught storage failure closes an acquired run through the idempotent `fail_admin_architecture_billing_run`; it cannot overwrite an already finished run. If the process is killed or storage is unavailable, the next claim expires records older than the existing ten-minute completion window. This normally happens on the next daily invocation; no extra poller, provider retry or second daily attempt is introduced.

Railway's previously verified payment is retained in `manualPayment` with its amount, date, source and original verification time. The existing source text displays it explicitly as historical manual verification, separate from the current invoice. Never copy that date to a different invoice. The repair migration recovers this metadata from the saved pre-sync snapshot without changing billing verification time, current usage, plans or other providers.

`finish_admin_architecture_billing_run` locks the running record, rejects stale/duplicate completion, saves prior snapshots for rollback and updates successful snapshots in one transaction. Plan, price and renewal fields are not inferred from billing usage. The durable results record explicitly lists Supabase as pending.

## Verification and rollback

Run `node --test tests/architecture-billing-sync.test.mjs tests/architecture-billing-preflight.test.mjs tests/architecture-billing-recovery.test.mjs`. The recovery suite uses the project's existing PGlite dependency for actual SQL migrations, access checks and state transitions.

Verify API previews against provider UI before enabling the cron. Check `cron.job_run_details`, the run record and persisted snapshot together; a queued HTTP request alone is not proof of synchronization.

To stop automatic synchronization, unschedule the named cron job. The existing snapshots remain readable. Prior snapshots are retained in `admin_architecture_billing_runs.previous_snapshots` for an explicitly requested rollback. Never publish those private values in migrations or PRs.
