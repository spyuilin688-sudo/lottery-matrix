# Admin watchdog Supabase cutover

## Outcome

- The admin system-status check probes the production Cloudflare `/admin/api/_healthcheck` route and reports it under Supabase.
- Supabase Cron invokes a private `admin-api` watchdog endpoint every ten minutes.
- The endpoint rejects missing or invalid cron credentials, runs the canonical watchdog, and persists its heartbeat in `private.admin_watchdog_status`.
- Existing Railway crawler and recovery behavior, member data, and admin CRUD behavior remain unchanged.

## Task 1: Correct status ownership and probe target

Files:

- Modify `apps/admin/backend/api-status-inventory.ts`
- Modify `apps/admin/backend/connection-status.ts`
- Modify `apps/admin/backend/api-status-inventory.test.ts`
- Modify `apps/admin/backend/connection-status.test.ts`
- Modify `apps/admin/src/system-status.ts`
- Modify `apps/admin/src/system-status.test.ts`
- Modify `apps/admin/src/AdminApp.tsx`

Steps:

1. Change the status expectations to require the production Cloudflare URL and Supabase ownership; run the two backend tests and confirm they fail for the old AppDeploy values.
2. Rename the heartbeat status ID to `supabase-watchdog-heartbeat` across backend and presentation consumers.
3. Point the live admin health probe to `https://matrixlottery.idv.tw/admin/api/_healthcheck`.
4. Run the directly related backend and presentation tests.

## Task 2: Add an authenticated Supabase watchdog invocation

Files:

- Modify `supabase/functions/admin-api/runtime.ts`
- Modify `apps/admin/backend/admin-edge-runtime.test.ts`
- Modify `apps/admin/backend/index.ts`
- Modify `apps/admin/backend/index-wiring.test.ts`

Steps:

1. Add failing tests for missing/invalid cron credentials, a valid invocation, and a degraded run returning a non-success status.
2. Add an exact canonical internal route; the Edge runtime forwards only its dedicated credential header, and the route validates that credential through a service-role-only database RPC before invoking `matrixIndependentWatchdog`.
3. Return HTTP 503 from the canonical watchdog when execution or heartbeat persistence is degraded.
4. Run only the four directly related test files.

## Task 3: Add the production Supabase schedule

Files:

- Add the migration file using the exact version assigned by Supabase migration history.

Steps:

1. Deploy the tested `admin-api` Edge Function.
2. Apply one migration that creates a private hashed cron credential, stores only the generated plaintext in Vault, creates a service-role-only authorization RPC, and schedules `pg_net` invocation every ten minutes.
3. Trigger one invocation through the same Vault-backed HTTP path.
4. Verify the HTTP response, new heartbeat row, Cron row, and unchanged current job state.

## Task 4: Integrate and verify

Steps:

1. Create a GitHub branch from current `main`, commit only the scoped files, and open a PR.
2. Verify the scoped tests, TypeScript checks for modified modules, admin production build, Supabase function state, production health endpoint, and watchdog freshness.
3. Merge only after the PR diff and checks match this plan.
4. Recheck the Cloudflare production route after the main deployment.
