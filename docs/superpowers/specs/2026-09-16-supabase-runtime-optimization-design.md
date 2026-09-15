# Supabase Runtime Optimization Design

## Baseline

- Repository: `spyuilin688-sudo/lottery-matrix`
- Production source of truth: `main`
- Baseline commit: `2c30194cd350679b15fef07a9faad9b58d9bec1a`
- Work branch: `fix/supabase-runtime-optimization-20260916`

## Goal

Reduce unnecessary Supabase API, Edge Function, Postgres, Storage, and Railway work without changing lottery acquisition semantics, algorithm outputs, notification eligibility, delivery ordering, or user-visible behavior.

The optimization must preserve idempotency and existing lease/lock mechanisms. It must not create a second scheduler, a second queue, or a parallel notification architecture.

## Verified Production Findings

1. `matrix-native-notification-dispatch-minute` invokes the Native Push Edge Function every minute even when no native deliveries are due.
2. `native-notification-dispatch` obtains an FCM OAuth token before claiming work, so an empty queue still consumes Edge Function and Google OAuth calls.
3. Worker notification deduplication is process-local. A new scheduled process can POST already-existing events to `notification-ingest`; database uniqueness prevents duplicate events, but the network and RPC calls still occur.
4. Card publication is re-claimed on scheduled worker runs after the current immutable card is already published, causing unnecessary DB lease updates and Storage/prune checks.
5. `matrix-visitor-retention` runs every minute although it only removes visitor identifiers older than 90 days.
6. Notification fanout creates web-push outbox rows for members that have no deliverable endpoint; most historical rows end as `skipped` with no enabled/valid subscription.
7. `matrix_status_sources_get` returns large raw Explore/Tianyan source payloads for requests that could use the already-computed status artifact.
8. `cron.job_run_details` grows continuously and currently has no bounded retention path.

## Design

### 1. Native push: two-layer empty-queue guard

Keep the existing one-minute cron for delivery latency, but replace the unconditional HTTP command with a private DB tick function.

The DB tick must return `NULL` unless at least one native delivery can actually be attempted now. Only then may it call `native-notification-dispatch`.

Inside `native-notification-dispatch`, claim work before obtaining the FCM OAuth token. If the claim returns an empty array, return success immediately. FCM credential validation and OAuth are performed only when at least one delivery was claimed.

This preserves the existing queue, lease, retry, finalization, and one-minute delivery latency while eliminating empty Edge Function and OAuth invocations.

### 2. Notification producers: durable event-existence preflight

Keep database uniqueness as the final idempotency boundary. Add a cheap durable preflight for producer-side notification emission so a completed worker does not POST the same event every five minutes.

The worker should only invoke `notification-ingest` when the relevant durable event does not already exist. The check must use the event key already defined by the notification event model; no new event identity scheme is introduced.

The producer-side check is an optimization only. Race safety remains in `notification_event_enqueue_server` / `notification_event_enqueue`.

### 3. Card publication: cheap current-state check before write lease

Before acquiring the publication lease, compare the latest persisted draw/card state with the currently published manifest using existing durable publication metadata.

If the current manifest is already valid for the latest stored draw and all currently eligible card orders, return it without acquiring/releasing a write lease and without pruning Storage.

When publication is genuinely required, retain the existing lease, immutable object key, digest validation, recheck-before-publish, and cleanup behavior.

### 4. Visitor retention cadence

Change `matrix-visitor-retention` from every minute to once per day. Do not introduce a new job. Alter the existing cron job in place.

The underlying `private.purge_matrix_visitor_identifiers()` retention rule remains 90 days and is not changed.

### 5. Notification fanout: require a deliverable endpoint

Prevent creation of web-push outbox rows for members with no currently deliverable push endpoint.

Eligibility must account for both delivery implementations:

- an enabled valid Web Push subscription, or
- an enabled native device eligible for native delivery.

Do not remove the shared outbox model, because native delivery currently derives delivery records from notification outbox rows.

Existing notification preference checks remain authoritative. This change only avoids creating rows that cannot be delivered anywhere.

### 6. Matrix Status compact fast path

Use the already-computed status artifact for ordinary/default status reads when no member-specific custom status evaluation is needed.

Raw Explore/Tianyan sources remain available only for the path that actually needs member-specific custom evaluation or source validation.

The public status response shape and entitlement behavior must remain unchanged. Validation requests must continue to resolve the exact source item and enforce the existing authorization rules.

### 7. Cron history retention

Add bounded cleanup of `cron.job_run_details` to an existing maintenance path rather than creating another scheduler. Retain enough recent history for diagnosis; use 14 days unless an existing project convention requires a shorter retention window.

Cleanup must be batched and must not interfere with currently running cron jobs.

## Concurrency and Safety

- Reuse current advisory locks, row locks, leases, `SKIP LOCKED`, event uniqueness, and retry state.
- Do not replace database idempotency with client-side checks.
- Do not change draw period reconciliation or `matrix_upsert_draws` behavior.
- Do not change analysis versioning, run leases, or artifact validity semantics.
- Do not change notification preference semantics, reminder timing, or retry limits.
- Do not create additional minute-level cron jobs.

## Deployment Strategy

1. Implement migrations and code on the isolated branch only.
2. Add regression tests before each behavior change where code-level tests are practical.
3. Run Matrix API tests, Node tests, runtime-integrity/migration checks, PWA build, and Admin build.
4. Recompare branch with latest `main` before final integration.
5. Apply production-safe Supabase migration only after repository migration/tests are green.
6. Verify production cron definitions, empty-queue behavior, HTTP request counts, notification queue states, and card publication behavior.
7. Merge only after full CI and production verification are successful.

## Acceptance Criteria

- Empty native queue produces no Edge Function HTTP request from cron.
- Native Edge Function does not request an FCM OAuth token when its claim is empty.
- Completed lottery/card/status events are not repeatedly POSTed by later worker invocations.
- A current published card does not acquire a publication write lease on every worker tick.
- Visitor retention executes daily rather than every minute.
- Fanout does not create new outbox rows for a member with no eligible Web Push or Native Push endpoint.
- Default Matrix Status reads avoid multi-megabyte raw source payloads while returning the same visible result.
- Cron run history is bounded to the configured retention window.
- No duplicate scheduler, queue, or monitor is introduced.
- Existing draw acquisition, analysis, notification eligibility, and retry behavior remain intact.
