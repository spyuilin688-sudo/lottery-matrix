# Admin API and activation code fixes

> **For agentic workers:** Use superpowers:executing-plans to implement these bounded fixes; use a fresh reviewer before merge.

**Goal:** Fix the four confirmed admin/API/code defects and merge the verified branch.

**Architecture:** Keep the existing admin components, public API host, recovery worker and activation redemption contract. Derive activation expiry on read with one request timestamp; apply the equivalent database predicate before pagination. No schema, cron, entitlement or referral changes.

**Tech Stack:** React, TypeScript, Vitest, existing Supabase REST transport.

**Spec:** User-approved 2026-09-19 audit findings: (1) cancel-edit then create must POST a new administrator; (2) public query probes must use the public API host while jobs retain recovery config; (3) TinyFish must render in service checks; (4) unused codes at or beyond expires_at must read/filter as expired, while used codes stay used. User authorized fix, conflict check and merge.

## Global constraints

- Remote main baseline: `92ece3cf60111e55ac84bf19e97be332a5a636ff`; tree `fb8d68674c0b55aba53d68fef39a4790761ef7b4`.
- Reuse only the relevant PR #668 fixes; preserve its unrelated work and latest main's Tianshu changes.
- Preserve existing UI layout and controls, role restrictions, code lifetime and redemption behavior.
- Run only named relevant test files, as required by AGENTS.md. No full-project test command.
- No production data writes, code redemption, notifications or manual deployments in this task.

## Review focus

- Cancelled editing must not retain an account ID or password/role draft when creating.
- Public query probes must not move protected recovery requests or send their credentials to a public route.
- TinyFish rows must render with their existing evidence/status, including failures.
- At exactly expires_at, unused is expired; used remains used after that date.
- Expiry filtering must coexist with keyword/date filters and preserve exact totals/pagination without table-wide reads.

### Task 1: Administrator create state

Files: `apps/admin/src/AdminApp.tsx`, `apps/admin/src/admin-permissions-app.test.tsx`.

- [x] Add the PR #668 cancellation regression and complete the existing dashboard fixture, then run `node_modules/.bin/vitest run apps/admin/src/admin-permissions-app.test.tsx -t 'starts a clean create'`. Expected: create heading missing before the fix.
- [x] Add `openCreateAdmin`, resetting `setAdminForm(defaultAdmin())`, `setEditingAdmin(null)`, then `setShowForm(true)`; pass it as `onCreate` to the existing button.
- [x] Run the same named file without `-t`; confirm POST `/api/admins` and no PUT for the new account. Commit with this task's tests.

### Task 2: Public API probe routing

Files: `apps/admin/backend/index.ts`, `worker-api.ts`, `index-wiring.test.ts`.

- [x] Reuse the PR #668 routing regression and current watchdog fixture contract; run `node_modules/.bin/vitest run apps/admin/backend/index-wiring.test.ts -t 'checks public query routes'`. Expected: recovery URL differs from public API URL.
- [x] Export the existing public host as `PRODUCTION_RAILWAY_API_BASE`; inject it into connection status `loadWorkerUrl`, retaining `getWorkerConfig` for jobs.
- [x] Run `index-wiring.test.ts`, `api-query-checks.test.ts`, `worker-config-cutover.test.ts`, and `worker-api.test.ts` by explicit paths; commit.

### Task 3: TinyFish status visibility

Files: `apps/admin/src/system-status.ts`, `system-status.test.ts`, `system-status-ui.test.tsx`.

- [x] Extend fixed-location regression with TinyFish and add a real AdminApp rendering regression. Complete dashboard fixture and current status-count expectations in the affected UI test.
- [x] Run the two named test files; expected RED: TinyFish group/row absent.
- [x] Use backend `ApiLocation` for the frontend location type; add TinyFish to the fixed group order. Do not change probe behavior or add actions.
- [x] Rerun both named files plus `apps/admin/backend/tinyfish-status.test.ts`; commit.

### Task 4: Activation expiry reads and filters

Files: `apps/admin/backend/admin-data.ts`, new `activation-code-expiry.test.ts`.

- [x] Add boundary fixtures with literal expected statuses: future unused, past unused, exact-boundary unused, past used and stored expired. Cover both legacy and paginated reads, plus filtered URLs with keyword/date conditions and exact totals.
- [x] Run `node_modules/.bin/vitest run apps/admin/backend/activation-code-expiry.test.ts`. Expected RED: past unused remains unused; expired filter only checks the stored status.
- [x] Let row mapping accept the request's timestamp and map only `status === 'unused' && expires_at <= now` to expired. Pass one timestamp through each list call.
- [x] For unused filter emit `status=eq.unused` AND `expires_at=gt.<now>`; for expired emit a separate AND group containing `status=expired OR (status=unused AND expires_at<=now)`. Keep keyword OR groups and date bounds independent.
- [x] Run the new file plus `admin-data.test.ts`, `admin-list-pagination.test.ts`, `admin-writes.test.ts`; commit.

### Integration and merge

- [x] Run the combined named regression files and the repository's changed-file CI selection; repair only stale fixtures required by those gates, preserving assertions of current behavior.
- [x] Run `npm run build`, `git diff --check` and runtime commit integrity checks.
- [x] Obtain independent review of the complete diff and fix confirmed blocking findings with regression evidence.
- [ ] Refresh remote main and overlapping PRs, reconcile any new changes, publish the exact verified tree, inspect PR checks and merge with expected-head protection.
- [ ] Read back merged PR/main SHA and report merge versus deployment status accurately.

## Verification record

- Four behavioral regressions were observed failing before the fixes and passing afterward.
- Changed-file CI selection: backend 24 files / 423 tests, admin 16 files / 124 tests, Node 1 file / 3 tests passed. Only explicitly named relevant files ran.
- Production build passed. Existing bundle-size and Tailwind configuration warnings remain non-blocking.
- Nine existing test files were aligned with current dashboard fixtures, module permissions and Railway watchdog routing to satisfy the affected CI gates; no additional product behavior changed.
- Independent review found no Critical or Important issue. A minor test-coverage note remains: the cancelled-edit test does not explicitly enter and re-check a password draft, although the implementation resets the entire form.
- Supplemental review of the nine stale-test corrections found no assertion weakening or scope issue. Runtime commit atomicity and all 27 protected runtime file checks passed.
- Release limitation: the deployed Supabase admin-api imports a pinned backend commit; repository merge alone does not update that deployed backend.
