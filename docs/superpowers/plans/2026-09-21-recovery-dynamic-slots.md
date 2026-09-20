# Recovery dynamic slots implementation plan

> Execution: superpowers:executing-plans, inline; final independent review.

Base: main 39c56ef373cb61821df8db7e371a35e824958916, freshly verified. This changes recovery only; main Worker time policy remains separate and not deployed.

## User contract

Taipei evening cycle: 20:30–01:00 every10min, then50min until06:00, extra12:00/18:00. Fantasy5 cycle:09:30–14:00 every10min, then50min until18:00, extra next00:00/06:00. Only due lottery days; once a lottery completes, cancel all remaining recovery for that cycle. A running job can finish. Keep permission polling and main schedules unchanged.

## Architecture / scope

Replace the existing every10min SQL watchdog cron with native daily starts (20:30,09:30) plus one next-slot cron for each group while pending. These are the explicitly requested starts, not a new polling controller. Persist four lottery states with cycle date, next slot, last dispatch, completion. Completion from existing full worker certificate or verified recovery cancels remaining slots. Daily starts reinitialize even after a previous failed run. Reschedule before HTTP; HTTP failure leaves the next specified slot in place. No additional retries outside user slots.

One shared SQL slot function owns exact slots. Backend scheduled snapshot reads only pending dispatched lotteries from a service-only RPC. Manual status observation remains available. Superseded old Sunday and23.5h recovery behavior removed for scheduled execution. Unknown calendar is not certified as no-draw.

## Tasks / interfaces

1. SQL timing and durable scheduler: migration20260920230827, tests/recovery-dynamic-slots.test.mjs. Produces private.matrix_recovery_slots(group,date), private.matrix_recovery_tick(group,now), public.matrix_recovery_pending(now), public.matrix_recovery_complete(lottery,period). RED missing functions; GREEN explicitly named test file. Check exact lists, cross-date, completion cancels only matching cycle, unknown calendar, HTTP failure and grants.
2. Backend: watchdog.ts consumes pending RPC before data reads on recovery runs. dueCycleDate is authoritative; manual observations use current calendar. Verified completion invokes complete RPC. Tests named watchdog-related files only.
3. Worker certification: certify complete results after normal work, retaining existing full readiness predicate. The existing certificate table emits the cancellation event in SQL. Tests explicit affected Python files.
4. Review / integration: focused tests and types, fresh whole-diff reviewer, material fixes, commit and prepare rollout. Activation requires migration plus backend/worker versions together; do not claim production success from unit tests.

## Rulings / ledger

- User's latest50min intervals and extra slots apply to recovery; do not silently change primary30min policy.
- Preserve previous cutoff interpretation: no new work at06:00 evening /18:00 Fantasy5. Their final50min slots are05:10/17:20. Extra listed checks are explicit independent slots. If user intends inclusive06:00, update one timing boundary before activation.
- Native daily starts remain even after completion because they open the next cycle; pending retry jobs are removed once all group lotteries complete.
- Existing AGENTS.md prohibits full suite; only named related tests.

## Implementation evidence

- SQL RED missing recovery functions. GREEN:10 PGlite integration tests; native cron/net boundaries stubbed. Actual SQL state/trigger behavior exercised, not a live scheduler.
- Backend RED:10 new timing/selection/dispatch failures. GREEN:156 tests across recovery-dynamic-slots, watchdog, watchdog-schedule-status, connection-status, watchdog-status, index-wiring.
- Python RED:3 missing completion-helper failures plus2 missing previous-cycle crawler propagation failures. GREEN:69 affected tests.
- TypeScript typecheck passed. No full suite.
- Cancellation consumes full worker certificates or verified recovery success. Trigger failure records a safe error without rolling back analysis data.
- Ruling: scheduled reports contain only checked lotteries under recoveryReports; not a fresh four-lottery chain report. Normal status observations retain full reports.
- Ruling: monitoring freshness follows persisted nextCheckAt during50min/rest intervals; unresolved HTTP requests retain existing18min timeout, avoiding false outage reports during intentional rest.
- Ruling: midnight/06:00 Fantasy5 recovery carries the previous cycle draw date; actual telemetry timestamps remain wallclock times.

## Review Focus

1. Cross-midnight cycle and extra times; no Sunday phantom cycles or DST shift of09:30 recovery.
2. Completion cancels only matching confirmed period; unknown calendar and preliminary data cannot suppress work.
3. Trigger/cron/HTTP failure, late start, concurrent completion/tick; no rollback of stored analysis.
4. Pending RPC and reports scope; no heavy reads for completed lotteries, no fake global health from partial observations.
5. Installation replaces old poller; requested daily starts reopen next cycle; retry jobs disappear on completion.

Rollout not performed. Migration activates native cron jobs; matching backend must be deployed first. Main Railway cron fields remain unchanged by this recovery change.

## Final review resolution

Fresh independent reviewer identified two Important issues. Calendar eligibility now refreshes on requested ticks and calendar-write events rearm future slots without dispatch or new polling. Preliminary draw status now propagates to the planner and requests formal crawler recovery, retaining active-job guards. Both reproduced RED before fixes; GREEN:11 SQL tests and157 backend tests, typecheck passed. Completed/no-draw rows skip certificate reads. No second review pass.

## Production rollout — 2026-09-21 07:35 Asia/Taipei

PR #708 merged as920d84f6 after all seven CI jobs passed. Concurrent #707 query changes were disjoint and preserved. Admin Edge version40 was deployed and all35 packaged files were read back exactly; the preexisting deployed optimizer version was preserved. Migration applied as20260920233444, and the repository filename/test reference is aligned to that recorded version to prevent replay. Five affected Railway services report SUCCESS on920d84f6; their primary cron settings were not changed.

Readback: old matrix-admin-watchdog-v1 removed; only daily recovery starts remain (UTC30 12 /30 1). The2026-09-20 evening lotteries are known no-draw; Fantasy5 is completed. Pending RPC is empty and the next opening is2026-09-21 09:30 Taipei. No fake recovery or future-time dispatch was invoked for validation. Full next-cycle scheduling has not yet been observed live.
