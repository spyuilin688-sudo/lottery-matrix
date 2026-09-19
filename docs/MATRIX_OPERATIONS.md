# Matrix operational roles

This change extends the existing Watchdog and stores observations in the existing
`private.admin_watchdog_status` singleton. It creates no second monitor or repair
log table. Recovery attempts use `matrix-recovery:<lottery>` rows in the existing
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
  configuration appeared. One unresolved case is a missing active-version pointer
  when all run artifacts already exist: the complete run is skipped and verification
  fails safely. No recovery success is counted; retries may recur. Restoring that
  pointer requires an explicit version-selection policy and is not automated here.
- **Optimizer:** reads SQL/index/table/RPC counters and Railway runtime/resource
  samples, retaining bounded latest observations in the same singleton. Index
  observation age resets when known PostgreSQL stats reset changes; unknown resets
  cannot establish a long observation interval. Table growth compares two observed
  samples. No candidates execute SQL/schema/permission/code mutations.

## Activation order and rollback

1. Apply migrations 20260920001000 through 20260920005000 via the normal reviewed
   Supabase release process. They require the existing active-version and custom
   status schema. Test on staging first, including concurrent draw/config changes.
2. Deploy the matrix-status Edge Function and Railway recovery/API code, then the
   admin backend/UI. During mixed versions incomplete observations remain unknown;
   old receivers must not receive targeted requests before the receiver is deployed.
3. Store `MATRIX_RAILWAY_PROJECT_TOKEN` in admin server secrets for the verified
   production project/environment. This is a Railway **project token**, sent only
   in Project-Access-Token to the fixed Railway API host. Never reuse the Matrix
   admin status token. Without it all five service observations are CONFIG_MISSING.
4. Existing watchdog Cron remains unchanged. A server-authorized POST to the
   existing `/api/internal/matrix-watchdog` with JSON `{"optimizer":true}` collects
   a **read-only** deep inspection and updates the existing status snapshot. It does
   not claim recovery leases or dispatch work. The same watchdog cron guard applies.
5. Optimizer frequency and long-term retention have not been chosen: no additional
   recurring schedule is activated. The report retains latest bounded observations,
   not a historical time-series. Choose the operational interval and retention before
   enabling periodic deep inspections. Edge Function runtime statistics are explicitly
   unavailable until a suitable provider log integration is configured.
6. The main-push GitHub workflow emits a code candidate artifact. It searches exact
   duplicate blocks/SQL, static references, endpoints, CSS selectors, large functions,
   empty catches and test-name gaps; it checks JWT-disabled Edge handler auth clues.
   These are review leads, not semantic dead-code/algorithm-equivalence or auth proofs.
   Artifact retention inherits repository policy; no new retention period is invented.

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

API references used for the read-only adapter:
- https://docs.railway.com/integrations/api
- https://docs.railway.com/integrations/api/manage-deployments
- https://github.com/railwayapp/cli/blob/master/src/gql/queries/strings/Metrics.graphql
- https://supabase.com/docs/guides/database/extensions/pg_stat_statements
