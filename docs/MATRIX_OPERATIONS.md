# Matrix operational roles

This change extends the existing Watchdog and stores its latest operational state
in the existing `private.admin_watchdog_status` singleton. Optimizer samples alone
use `private.matrix_optimizer_observations`, a 90-day history with no operational
status or recovery counters. It creates no second monitor or repair log table. Recovery attempts use `matrix-recovery:<lottery>` rows in the existing
`system_job_status`; crawler job rows are not overwritten.

## Runtime behavior

- **Watchdog:** retains the canonical draw calendar, timezone/DST rules and recovery
  checkpoints. Every lottery report evaluates schedule execution, job, crawler,
  draw, active analysis, Matrix Status and current Custom Status configurations.
  Missing observations are UNKNOWN; accepted dispatch is never success.
- **Inspector:** adds Railway Cron configuration, deployment and period-matched
  structured runtime samples to the same chain evidence. Configured Cron and a
  successful deployment do not establish successful execution. Missing logs do
  not prove a missed run. Fault layer is separate from root cause; unsupported
  causes remain unknown. Config-key mismatch is a directly evidenced cause.
- **Recovery:** takes the existing durable lease, increments retry_count only when
  execution begins, runs the selected stage and period through existing builders,
  drains renewal, verifies current data, then atomically increments recovery_count
  and last_recovery_at. The completion transaction briefly fences draw/run/artifact/
  active-version/config/result writes; lock acquisition times out after 3 seconds.
  Failure or unreadable evidence never increments success. Missing status artifacts
  resume through the existing analysis lease. Custom publication compares the
  existing JSON config_key and rejects changed config, period or active version.
  Empty-config cleanup uses the same config lock and refuses deletion if a new
  configuration appeared. Analysis/Matrix Status recovery can also restore missing
  active-version pointers for the exact versions chosen by the existing worker.
  This uses the current recovery owner/runner lease and requires the latest period,
  all required complete artifacts and matching sorted/draw version bases. It inserts
  absent slots only; an existing different version is never replaced. Every required
  slot is checked before any insertion. Pointer restoration alone does not count as
  recovery success: Custom Status and the final chain verification still follow.
- **Optimizer:** reads SQL/index/table/RPC counters and Railway runtime/resource
  samples, retaining bounded hourly/daily observations in the private history. Index
  observation age resets when known PostgreSQL stats reset changes; unknown resets
  cannot establish a long observation interval. Table growth compares two observed
  samples. No candidates execute SQL/schema/permission/code mutations.

## Activation order and rollback

1. Apply 20260919174332 and migrations 20260920001000 through 20260920005000 via the normal reviewed
   Supabase release process. They require the existing active-version and custom
   status schema. Test on staging first, including concurrent draw/config changes.
2. Deploy the matrix-status Edge Function and Railway recovery/API code, then the
   admin backend/UI. During mixed versions incomplete observations remain unknown;
   old receivers must not receive targeted requests before the receiver is deployed.
3. Store `MATRIX_RAILWAY_PROJECT_TOKEN` in admin server secrets for the verified
   production project/environment. This is a Railway **project token**, sent only
   in Project-Access-Token to the fixed Railway API host. Never reuse the Matrix
   admin status token. Without it all five service observations are CONFIG_MISSING.
4. Existing watchdog Cron remains unchanged. A server-authorized POST to
   `/api/internal/matrix-watchdog` with `{"optimizer":true,"optimizerScope":"railway"}`
   or scope `database` collects a read-only deep inspection and saves its own history.
   It never invokes Watchdog/Recovery or overwrites the heartbeat. Omitting scope runs
   both independently. It shares the cron authorization guard and existing lease table
   with distinct optimizer keys, owner fencing and one successful write per time slot.
5. Approved cadence is Railway hourly (`0 * * * *`), database daily at Taiwan midnight
   (`0 16 * * *` UTC), with 90-day history. Both new jobs are created **inactive**.
   After every migration/receiver is deployed and each protected invocation succeeds,
   activate only `matrix-optimizer-railway-v1` and `matrix-optimizer-database-v1` using
   `cron.alter_job(jobid, active := true)`. Production activation requires deployment
   authorization. Missing slots are not backfilled. Latest reports show separate source
   timestamps. History is paginated through permission-guarded
   `/api/system-status/optimizer-history?scope=railway|database&before=<ISO timestamp>`.
   Pruning runs before credential checks on ticks and after successful writes; expired
   records are excluded from reads even while cron is down. Edge runtime statistics
   remain unavailable until an appropriate provider log integration is configured.
6. The main-push GitHub workflow emits a code candidate artifact with 90-day retention.
   It searches exact duplicate blocks/SQL, static references, endpoints, CSS selectors,
   large functions, empty catches and test-name gaps; it checks JWT-disabled handler
   auth clues. These are review leads, not semantic dead-code or authentication proofs.

Rollback application consumers together if needed. Keep additive columns/functions;
no data restoration or DROP is needed. Restore the former analysis-acquire function
only through a reviewed migration if a regression is confirmed. Disable any later
Optimizer schedule before rolling back its consumer. Do not remove indexes or change
existing grants as part of this rollout.

## Evidence limits and verification

Railway samples are bounded to 100 latest-deployment log entries per service and
one hour of CPU/memory samples. Reported failure/idle counts describe that sample,
not an all-time rate. Null-period failures count at service level only. Different
execution versions and normal no-new-draw skips are not labeled duplicate analysis.
Services use verified IDs, avoiding the identically named service in another project.

Local verification covers explicit TS/React, Python recovery, real SQL execution
in PGlite, scoped CI selection and admin production build. The browser fixture at
`tests/matrix-watchdog.html` is test-only, with `tests/matrix-watchdog.spec.ts` selected
by existing CI. Local Chromium installation failed with network 502/timeouts;
GitHub CI subsequently passed both focused browser tests on commit f277561b,
including 320px overflow, keyboard disclosure, desktop, empty and stale states.
The latest PR commit must still pass the complete scoped release gate. The full admin standalone
typecheck has pre-existing SDK/CSS/test typing failures; changed pure modules and the
new panel pass a scoped strict typecheck. No full test suite was run.

Continuation checks confirmed that production does not yet expose the new chain,
completion or optimizer RPCs, and no Supabase development branch is configured.
The pointer-restoration SQL is therefore included in the still-unapplied migration
20260920004000. Its targeted Python and SQL regressions cover stale ownership,
expired leases, superseded periods, missing artifacts, mixed versions and atomic
sorted/draw restoration. No live schema or deployment was changed by these checks.

API references used for the read-only adapter:
- https://docs.railway.com/integrations/api
- https://docs.railway.com/integrations/api/manage-deployments
- https://github.com/railwayapp/cli/blob/master/src/gql/queries/strings/Metrics.graphql
- https://supabase.com/docs/guides/database/extensions/pg_stat_statements
