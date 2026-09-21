# Admin audit fixes and monitor release — 2026-09-21

Source baseline: `367558ad36558661ff261d9267266a9acd0ae605` (main, PR #719).
This is a release checklist, not evidence that production has been changed.

## Repeated monitor warning: deployment drift

Read-only inspection of production Supabase `admin-api` version 41 found four bundled files different from the baseline:

- `apps/admin/backend/index.ts`
- `apps/admin/backend/connection-status.ts`
- `apps/admin/backend/watchdog-status.ts`
- `apps/admin/backend/security-monitor.ts`

The deployed monitor lacks `observeWatchdog` wiring and the `read-only-chain` observation already present in main. At 2026-09-21 06:53 UTC, the stored heartbeat still described the 02:00 UTC failure for Fantasy5 period 12005. Production recovery had completed period 12006 around 02:04 UTC; the scheduler had no pending check and its next check was 12:30 UTC. A historical degraded heartbeat is therefore not sufficient evidence of a current chain failure.

Reproduction used the downloaded production `connection-status.ts` and `watchdog-status.ts` with the existing `connection-status-recovery.test.ts`: **5 failed / 5 passed**, including failure to observe restored chains. Canonical sources were restored afterward. The canonical monitor suite passed **143 tests across seven explicit files** before that reproduction. Release must deploy the complete canonical dependency graph, not just `watchdog.ts` or the entrypoint.

Current observation must preserve historical recovery reports. Missing, old, incomplete, failed or unknown chain evidence must not be converted into success. No heartbeat/history rows should be deleted to make the monitor green.

## Included fixes

| Finding | Change | Compatibility |
| --- | --- | --- |
| Stale admin edit restores revoked permissions | Database revision trigger and atomic `id + revision` update; stale/missing revision returns 409 | Database migration must precede API; refresh old admin tabs |
| Old job completion overwrites newer attempt | Match completion by job name and the attempt's start timestamp | Deploy all Python callers together; analysis leases unchanged |
| Notification page scans all members/devices | 30-member pages, bounded search and recipient refresh; bounded log identity lookup | Search/log RPC migration must precede API |
| Confirmations lack native keyboard isolation | Native modal dialog, Cancel focus, Escape cancellation and focus return | Real-browser verification remains required |
| Logout timestamp absent from table | Restore logout column | Existing data contract unchanged |
| Obsolete Tian Gong writer bypasses current call contract | Remove obsolete script and automated writer job; retain UI check | Current leased analysis pipeline remains owner |
| Stale operations documentation | Correct admin route, five Railway services, crawler and recovery ownership | Primary scheduling remains explicitly incomplete |

## Release order

1. Verify the reviewed commit and its scoped CI. Preserve the deployed Edge bundle as rollback evidence.
2. Apply the additive migrations, in filename order:
   - `supabase/migrations/20260921065325_admin_push_member_page.sql`
   - `supabase/migrations/20260921065627_admin_account_revision.sql`
3. Deploy the complete `admin-api` bundle from that commit, including `supabase/functions/admin-api/deno.json` and all relative dependencies. Preserve existing custom authentication and `verify_jwt=false`; do not remove the admin route guards.
4. Re-read the deployed bundle and compare every uploaded source to the reviewed commit. Specifically confirm the four formerly drifted files. An Edge deployment success response alone does not establish source equality.
5. Publish the matching admin UI and deploy the Python job callers together through the normal GitHub/Railway release. Confirm actual deployment commit IDs rather than relying on main being merged.
6. Verify monitoring without invoking recovery: fresh reports must cover all four lotteries and keep historical failure details separate. A real current failure must remain visible. Verify system settings, notification search/paging/log identities, stale admin edit 409, logout times, and confirmation keyboard behavior with an authorized admin session.

Rollback: restore the prior application bundles if needed. Leave the additive revision column/trigger and restricted RPCs in place; dropping them while new code runs breaks the interface. Rolling back the monitor code restores the known stale-warning behavior and must be called out.

## Verification boundaries and remaining work

- Only explicitly named affected tests are permitted by `AGENTS.md`; no full suite was run.
- Final integrated TypeScript/component/migration run: **273 passed across 19 explicit files**. Notification client helper run: **11 passed in one explicit file**. These include canonical monitor recovery after restoring the downloaded-source reproduction. Independent review found and closed off-page log-name/identity and selected-recipient retry regressions; no important finding remains in the scoped patch.
- Six focused Python test files passed **62 tests**. Admin Edge import-map dependency resolution passed. Production Pages build passed, including root TypeScript compilation and the admin bundle.
- The separate admin TypeScript project has **68 existing diagnostics**, independently reproduced on the baseline with no increased diagnostics at the initial UI integration check. Build success does not claim that separate project is clean.
- Secure browser login did not complete. Authenticated production page behavior and native dialog focus containment are not verified.
- Both primary analysis services still have all-day `3/10 * * * *` Railway cron. The pure policy in `worker_schedule.py` is not connected to a crash-safe next-start control flow. See `docs/superpowers/plans/2026-09-21-dynamic-worker-schedule.md`; do not replace this with a wake-and-exit gate, remove the next daily start, or change the independent recovery contract.
- No historical lottery data, retention-protected data, legacy database bundle, disabled Edge function, empty Railway project or independent review site was deleted. Their removal needs distinct dependency/ownership evidence.
- No production mutation was performed while preparing this change.
