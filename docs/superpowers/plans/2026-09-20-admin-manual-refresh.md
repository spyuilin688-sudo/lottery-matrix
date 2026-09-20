# Admin manual refresh implementation plan

Approved scope: recognize all seven analysis phases; reuse the existing Fantasy5 crawler for manual draw refresh; accept work in the background and query its actual outcome. Recovery remains the separate data/analysis repair action. Scheduler and cache architecture changes are deferred.

## Invariants and design
- Authentication and systemSettings edit permission precede enqueue/status access. Tokens never reach browser responses.
- POST /jobs/refresh accepts one task per lottery; GET /jobs/refresh/status reads its correlated request ID. No automatic re-submission from polling.
- Persist a bounded latest-task row per lottery in Supabase. Atomic claim prevents duplicate tasks across replicas. Expired/interrupted tasks never report success; completion uses request-ID and expiry fencing. A process-local guard also bounds threads if a source stalls.
- Only a successful crawler result with a verified stored period produces complete. Fantasy5 uses the existing crawler (including history repair); no analysis is invoked. Stale source is explicit failure, not completion.
- Poll only the scoped task endpoint, stop on terminal state, lost permission/unmount, or bounded wait. A polling timeout means unknown/still running, not failed execution.
- Keep current UI structure and shared styles. Audit enqueue as acceptance, not completed update.

## Steps / verification
1. Add failing regressions for tianheng/tianshu and async task lifecycle.
2. Implement durable task storage, coordinator, authenticated API and crawler adapter.
3. Update admin adapter, routes and both manual-refresh UI consumers with shared status polling.
4. Run explicit related Vitest/Pytest paths, admin build, SQL contract tests; independent review and create PR.

## Review focus / deployment
Check duplicate submissions, thread start failure, stale completion, restart/expiry, wrong lottery/request ID, authorization, source-not-ready, polling interruption, and accurate audit/UI messages. Apply migration before Railway recovery/API rollout, then admin backend/frontend. No production deployment in this task.

## Execution evidence (2026-09-20)
- RED: two phase-parser regressions failed on the baseline; six selected async/Fantasy5 API regressions failed before implementation; UI acceptance/polling regressions failed before wiring.
- GREEN: 120 tests across seven explicit root Vitest files; 39 tests in admin src/system-status.test.ts; 95 tests across six explicit Python files. No full suite executed.
- Root Vitest paths: apps/admin/backend/{worker-api,manual-refresh-migration,index-wiring,api-status-inventory}.test.ts and apps/admin/src/{RailwayOperations,SystemSettings,system-status-ui}.test.tsx.
- Admin command: `npx vitest run --config vite.config.ts src/system-status.test.ts` from apps/admin.
- Python command: `uv run pytest tests/test_manual_refresh.py tests/test_public_api.py tests/test_recovery_server.py tests/test_api_server_http.py tests/test_job_status_repository.py tests/test_fantasy5_worker_split.py -q` from services/matrix-api.
- `npm run build:admin:pages` passed. Existing Tailwind content and chunk-size warnings remain.
- Admin `tsc` is not clean on baseline: 49 distinct diagnostics, including missing optional appdeploy/CSS declarations and existing test types. Same 49 diagnostics on this branch after normalizing line numbers; zero introduced.
- Independent review found two row-entry issues (permission-loss cancellation and retaining request ID after network failure). Both fixed; reviewer independently reran SystemSettings tests and cleared both findings.
- SQL tests execute the actual migration in PGlite as service_role and verify anon/authenticated denial, expiry, stale-ID completion rejection, bounded rows, and task deduplication.
- Browser live preview was attempted but the cloud browser blocked the local preview URL. Browser visual verification of the changed UI remains unperformed; React interaction tests and the production build passed.
- No production crawler trigger, migration, merge, or deployment performed. Apply migration first; coordinate Railway/API, admin backend and frontend rollout because the refresh response changes from a completed draw to a task DTO. Existing browser tabs should reload after rollout.

- Rebased without conflicts onto main 0395ae3 (PRs #698/#699); migration numbered after the new ECPay migration to preserve deployment order.
- Final Edge packaging check identified the new shared DTO import-map entry; added it with a RED/GREEN regression. Updated connection-status inventory counts for the three new RPCs. Four additional scoped Edge/connection-status files: 59 passed. Total scoped validation: 218 Vitest tests + 95 Python tests.
- GitHub push was blocked by automatic approval review, which requires explicit authorization to export these code changes to spyuilin688-sudo/lottery-matrix. No workaround attempted; PR creation is pending that authorization.
