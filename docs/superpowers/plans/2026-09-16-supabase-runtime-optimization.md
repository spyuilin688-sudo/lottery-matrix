# Supabase Runtime Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified Supabase/Edge/Storage/runtime empty work while preserving draw acquisition, analysis results, notification semantics, retries, and user-visible behavior.

**Architecture:** Keep every existing queue, lease, scheduler, and idempotency boundary. Add cheap durable guards before expensive HTTP/OAuth/Storage work, shift maintenance to appropriate cadence, and use the existing precomputed status artifact for default reads while retaining raw-source evaluation only for custom/validation paths.

**Tech Stack:** PostgreSQL 17 / Supabase pg_cron + pg_net, Supabase Edge Functions (Deno/TypeScript), Python 3.12 Matrix workers, React/PWA, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-supabase-runtime-optimization-design.md`

## Global Constraints
- Preserve existing advisory locks, row locks, leases, `SKIP LOCKED`, event uniqueness, retry states, and `matrix_upsert_draws` behavior.
- Do not change lottery acquisition semantics, algorithm outputs, analysis versioning, notification eligibility, reminder timing, retry limits, or user-visible response shapes.
- Do not create a second scheduler, queue, notification architecture, or additional minute-level cron job.
- Repository migration and tests must be green before any production migration is applied.

### Task 1: Native push empty-queue guard
- [ ] Add failing Edge Function tests: empty claim returns zero counts and never calls OAuth; non-empty claim still obtains OAuth and finalizes.
- [ ] Change native handler order to config -> claim -> empty return -> OAuth -> process claims.
- [ ] Add `private.native_notification_dispatch_http_tick()` and alter existing `matrix-native-notification-dispatch-minute` command in place.
- [ ] Run native tests and migration/runtime-integrity checks.

### Task 2: Durable notification producer preflight
- [ ] Add failing Python tests for existing event key skipping ingest and missing key posting normally.
- [ ] Add service-role-only `public.notification_event_exists_server(text)` RPC.
- [ ] Add `NotificationEventEmitter.exists()` and use it in worker emission helpers while retaining DB uniqueness as final race boundary.
- [ ] Run notification/worker tests.

### Task 3: Card publication current-state fast path
- [ ] Add failing test proving current manifest avoids `claim()`.
- [ ] Add read-only manifest/current-draw validation before acquiring publication lease.
- [ ] Preserve post-render snapshot recheck, immutable storage keys, and cleanup behavior.
- [ ] Run card publication tests.

### Task 4: Cron cadence and history retention
- [ ] Alter existing `matrix-visitor-retention` from every minute to `17 4 * * *` UTC.
- [ ] Extend existing `private.security_cleanup()` with bounded cleanup of completed `cron.job_run_details` older than 14 days, max 5000 rows/run.
- [ ] Verify no duplicate cron job is created.

### Task 5: Fanout deliverable-endpoint guard
- [ ] Change `private.notification_fanout_event(uuid)` INSERT predicate so outbox is created only when preferences match and either an enabled valid Web Push subscription or enabled native device exists.
- [ ] Preserve shared outbox/native delivery model.
- [ ] Verify no-endpoint, Web Push, and Native cases.

### Task 6: Matrix Status compact default fast path
- [ ] Add tests proving default/no-custom request uses compact precomputed status, while custom status and validation still use raw source paths.
- [ ] Add `public.matrix_status_compact_get(jsonb)` returning existing status artifact without `statusSources`.
- [ ] Add compact source reader and route branching without changing public response shape or validation authorization.
- [ ] Run Matrix Status tests.

### Task 7: Full verification and production rollout
- [ ] Recompare latest `main` with branch and reconcile non-overlapping changes.
- [ ] Run Python, Node/Deno, migration/runtime-integrity, PWA build, and Admin build checks.
- [ ] Review Supabase advisors for regressions.
- [ ] Apply migrations and deploy changed Edge Functions only after repository checks are green.
- [ ] Verify production request counts/cadences/queue behavior and compact status payload.
- [ ] Open PR and merge only when full CI and production verification are green.
