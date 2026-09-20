# Optimizer schedule and retention implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; retain the existing independent final review.

**Goal:** Implement the approved hourly Railway, daily Supabase, main-push code checks and 90-day observation retention.

**Architecture:** Keep operational status, recovery counters and leases authoritative in their current stores. A private append-only optimizer observation relation stores historical samples only, uniquely keyed by scope/time slot. The existing protected internal route dispatches optimizer work without running Watchdog or Recovery; pg_cron uses existing Vault credentials. Latest reports are read from this history rather than written into the heartbeat singleton.

**Tech Stack:** TypeScript, PostgreSQL/pg_cron/pg_net, existing Supabase transport, GitHub Actions.

**Spec:** User accepted hourly Railway, daily Supabase, every main update for code, 90-day retention. Original invariants remain in docs/plans/matrix-watchdog-four-roles-spec.md.

## Global constraints
- No automatic index deletion, permission edits or code repairs.
- No second operational monitor status or recovery log; history contains optimizer observations only.
- Do not change existing Watchdog/crawler/analysis schedules or algorithms.
- Only explicit related test files; no full suite.
- Prepare schedules inactive until receiver and migrations are deployed in the documented order.
- Keep unavailable/truncated samples explicit; hourly collection is not proof of every execution.

## Review focus
- Two invocations in the same slot must not duplicate samples or call Recovery.
- Expired/foreign owners must not write results; failed writes must not claim success.
- Reads and pruning exclude records older than 90 days, even during collector failures.
- Hourly snapshots must not reuse older log events or erase daily observations.
- Secrets/raw runtime text must never be stored or returned; history requires admin permission.

### Task 1: Historic observations and schedules
Files: CLI-generated optimizer migration; tests/matrix-optimizer-history.test.mjs.
- [ ] Add SQL regression fixtures for ownership, duplicate slots, retention, grants and safe rollout.
- [ ] Add private sample table `(scope, slot, observed_at, report, evidence)`, RLS and service-only RPCs: claim, finish, latest, history, prune, HTTP tick.
- [ ] Reuse claim_matrix_watchdog_lease/release_matrix_watchdog_lease with optimizer-prefixed keys; require owner and valid expiration at finish.
- [ ] Schedule hourly Railway and daily Supabase at Taipei midnight; initial jobs inactive. HTTP tick prunes expired samples before reading Vault and invoking the protected route.
- [ ] Raise heartbeat size allowance from 16 KB to a bounded 256 KB for the existing four-chain/Railway evidence, strip optimizer before persistence.
- [ ] Verify using `node --test tests/matrix-optimizer-history.test.mjs`.

### Task 2: Scoped runner and latest/history access
Files: apps/admin/backend/matrix-optimizer-runner.ts and test; index.ts and index-wiring.test.ts; matrix-optimizer.ts and test; MatrixWatchdogPanel.tsx and test.
- [ ] Test that railway scope fetches only Railway and recovery counters, database scope only the SQL snapshot; reject unknown scope.
- [ ] Claim current slot, collect bounded sanitized evidence, create report from same-scope previous report, finish atomically, release on errors.
- [ ] Filter hourly logs to the exact previous hour; deduplicate identical events and preserve truncation/unavailable markers.
- [ ] Route optimizer requests before the Watchdog path. Add permission-guarded paginated history access and merge latest reports at status read.
- [ ] Display source-specific observation times and approved cadence/retention in the existing disclosure, without a new page.
- [ ] Verify explicit runner/optimizer/wiring/panel tests and scoped types/build.

### Task 3: Code artifact retention and release evidence
Files: .github/workflows/matrix-optimizer.yml; docs/MATRIX_OPERATIONS.md; existing scoped CI selector/tests.
- [ ] Set artifact retention-days: 90 and verify main-push contract.
- [ ] Document exact cron enable/disable commands, rollout order and sampling limits.
- [ ] Independent review of persistence, concurrency and auth; fix concrete findings.
- [ ] Update PR #679 against latest main, preserving unrelated main changes. Inspect latest scoped CI through release-gate.

## Deployment and activation

Apply the complete PR migration set, deploy Recovery/Matrix Status/admin-api/backend UI in the established order, then verify a protected manual invocation of each optimizer scope. The generated history migration precedes the additive recovery counters; its PL/pgSQL counter reader resolves columns only when called. Never activate the new jobs before all migrations and the receiver exist.

The new cron jobs are initially inactive. With explicit production deployment authorization, activate only `matrix-optimizer-railway-v1` and `matrix-optimizer-database-v1` through `cron.alter_job(jobid, active := true)`. Existing Watchdog schedules are unchanged. Railway uses UTC hour slots and metrics from the preceding hour; database uses Asia/Taipei calendar days, UTC cron `0 16 * * *`. Missed slots are not backfilled. Logs are bounded to the latest deployment and 100 lines, so these are samples, not complete execution counts.

Vault keys remain `matrix_project_url` and `matrix_admin_watchdog_token`; Railway observations additionally require `MATRIX_RAILWAY_PROJECT_TOKEN`. Missing observation credentials produce unavailable coverage. The HTTP tick prunes before checking credentials, and successful writes also prune. If cron itself is unavailable, physical cleanup waits until the next successful tick/write; all reads still exclude observations older than 90 days.

`GET /api/system-status/optimizer-history?scope=railway|database&before=<ISO timestamp>` is restricted to authenticated administrators with system settings view permission, returns 24 reports plus a pagination cursor, and never returns raw runtime logs or tokens. Latest per-source summaries come from the same history; the Watchdog singleton stores no Optimizer report. GitHub code findings remain read-only artifacts with 90-day retention.
