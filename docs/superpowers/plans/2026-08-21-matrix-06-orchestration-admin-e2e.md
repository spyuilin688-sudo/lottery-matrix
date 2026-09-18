# Matrix Orchestration, Admin Monitoring, and E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run every Matrix analysis after official draw synchronization, expose secure operational status, show it in the existing admin, clean expired artifacts, and verify the complete API/PWA/Supabase integration.

**Architecture:** One per-lottery coordinator owns analysis version creation and sequential engine publication; the scheduler isolates failures between lotteries. Operational manifests are the source for a read-only status endpoint. The admin backend forwards a backend-only monitor token only after its existing Supabase admin guard succeeds.

**Tech Stack:** TypeScript, AppDeploy scheduled functions/API/Database, Supabase admin data, React admin, Vitest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-21-matrix-full-api-integration-design.md`

## Global Constraints

- Order is official sync, Explore, Tianyan, Tiangong, status source, then complete manifest.
- One lottery failure cannot prevent another lottery from completing.
- A version is unreadable until its manifest is complete; readers never combine versions.
- Cleanup removes complete artifacts older than three days and does not delete active writes.
- Admin monitoring is read-only; no rerun button or mutation route is added.
- `MATRIX_ADMIN_STATUS_TOKEN` is backend-only and must match in algorithm and admin deployments.

---

### Task 1: Build the Per-Lottery Analysis Coordinator

**Files:**
- Create: `backend/matrix-analysis-jobs.ts`
- Create: `backend/matrix-analysis-jobs.test.ts`
- Modify: `backend/index.ts`

**Interfaces:**
- Produces: `createMatrixAnalysisJobs(deps)` with `analyzeLottery(lottery)` and `analyzeAll()`.
- Produces: exported `scheduledMatrixAnalysis`.

- [ ] **Step 1: Write failing orchestration tests**

Assert the exact call order for one lottery, one shared `analysisVersion` derived from lottery and latest draw period, no publication before official data is current, no complete manifest after any engine failure, persisted start/end/failure metadata, and no analysis when the latest period has already completed with the same source fingerprint.

Assert `analyzeAll()` uses `Promise.allSettled` semantics: one rejected lottery is reported while the other three complete.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-analysis-jobs.test.ts`

Expected: FAIL because the coordinator is absent.

- [ ] **Step 3: Implement dependency-injected orchestration**

Load sufficient history once per lottery, build/publish Explore, derive/publish Tianyan, build/publish Tiangong, and publish the normalized thirteen-period/full-range status source. Record per-engine result counts and timestamps in the operational manifest. Reuse a completed version only when draw period and source fingerprint match.

- [ ] **Step 4: Connect scheduled functions**

After `refreshActiveSources()` succeeds, invoke `analyzeAll()`. After a source-specific refresh, map the source id to its lottery and invoke only that lottery. Preserve existing scraper errors and add analysis failures with lottery/engine context.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- backend/matrix-analysis-jobs.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/matrix-analysis-jobs.ts backend/matrix-analysis-jobs.test.ts backend/index.ts
git commit -m "feat(api): orchestrate Matrix analysis jobs"
```

### Task 2: Add Safe Three-Day Cleanup

**Files:**
- Modify: `backend/matrix-analysis-store.ts`
- Modify: `backend/matrix-analysis-store.test.ts`
- Modify: `backend/matrix-analysis-jobs.ts`
- Modify: `backend/matrix-analysis-jobs.test.ts`
- Modify: `backend/index.ts`
- Modify: `cron.json`

**Interfaces:**
- Produces: exported `scheduledMatrixArtifactCleanup`.

- [ ] **Step 1: Add failing cleanup-boundary tests**

Assert exactly three days old remains, more than three days is removed, incomplete/writing versions are not removed by age cleanup, all chunks belonging to an expired manifest are removed, and cleanup failure does not mutate current complete pointers.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-analysis-store.test.ts backend/matrix-analysis-jobs.test.ts`

Expected: FAIL at the exact boundary and scheduled wrapper.

- [ ] **Step 3: Implement scheduled cleanup**

Use completion timestamps, not creation timestamps. Delete chunks before their expired manifest, then remove stale pointers that reference no complete manifest. Return counts by kind and lottery for logs. Add one daily Asia/Taipei cleanup entry to `cron.json`; do not alter the four official-source schedules.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:unit -- backend/matrix-analysis-store.test.ts backend/matrix-analysis-jobs.test.ts`

Expected: PASS.

```bash
git add backend/matrix-analysis-store.ts backend/matrix-analysis-store.test.ts backend/matrix-analysis-jobs.ts backend/matrix-analysis-jobs.test.ts backend/index.ts cron.json
git commit -m "feat(api): clean expired Matrix artifacts"
```

### Task 3: Expose Secure Matrix Analysis Status

**Files:**
- Create: `backend/matrix-analysis-status.ts`
- Create: `backend/matrix-analysis-status.test.ts`
- Create: `backend/matrix-analysis-status-routes.test.ts`
- Modify: `backend/index.ts`

**Interfaces:**
- Produces: `getMatrixAnalysisStatus()`.
- Produces: `GET /api/matrix/analysis/status` protected by `X-Matrix-Admin-Token`.

- [ ] **Step 1: Write failing status projection tests**

For each lottery assert latest draw period, official sync state, analysis version, Explore/Tianyan/Tiangong completion and counts, status counts, start/end timestamps, failure count, and the latest sanitized error. Assert mixed engine versions are reported as incomplete rather than merged.

- [ ] **Step 2: Write failing route security tests**

Assert absent/wrong monitor token returns 403, correct token succeeds, the expected token is loaded from backend secrets, and neither token nor stack trace appears in responses.

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-analysis-status.test.ts backend/matrix-analysis-status-routes.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement projection and route**

Read manifests only; do not start analysis from this route. Return a stable typed array for all four lotteries. Compare the supplied token using a constant-time string comparison before reading status.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- backend/matrix-analysis-status.test.ts backend/matrix-analysis-status-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/matrix-analysis-status.ts backend/matrix-analysis-status.test.ts backend/matrix-analysis-status-routes.test.ts backend/index.ts
git commit -m "feat(api): expose secure Matrix analysis status"
```

### Task 4: Extend the Existing Admin Adapter and UI

**Files:**
- Modify: `apps/admin/backend/algorithm-api.ts`
- Modify: `apps/admin/backend/algorithm-api.test.ts`
- Modify: `apps/admin/backend/index.ts`
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/src/admin.css`
- Create: `apps/admin/src/MatrixAnalysisStatus.test.tsx`

**Interfaces:**
- Extends: `AlgorithmStatus` with `matrixAnalysis`.
- Consumes: backend secret `MATRIX_ADMIN_STATUS_TOKEN` only inside the admin backend.

- [ ] **Step 1: Write failing adapter tests**

Assert the adapter requests `/api/matrix/analysis/status` with `X-Matrix-Admin-Token`, never returns the token to the browser, keeps existing health/coverage/audit/cases fault isolation, and reports Matrix status unavailable independently.

- [ ] **Step 2: Write failing admin UI tests**

Assert the read-only section renders one row/card per lottery and every approved field. Verify no rerun, retry, delete, or edit control exists. Verify partial/unavailable and sanitized error rendering.

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:unit -- apps/admin/backend/algorithm-api.test.ts apps/admin/src/MatrixAnalysisStatus.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement backend forwarding and UI**

Keep `GET /api/algorithm-status` behind existing `requireAuth()` and `guard('view')`. Load the monitor token from admin backend secrets, call the algorithm endpoint server-to-server, and pass only its JSON status to the UI. Add a compact read-only Matrix analysis section to the existing overview.

- [ ] **Step 5: Run admin tests/build**

Run: `npm run test:unit -- apps/admin/backend/algorithm-api.test.ts apps/admin/src/MatrixAnalysisStatus.test.tsx && npm --prefix apps/admin run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/backend/algorithm-api.ts apps/admin/backend/algorithm-api.test.ts apps/admin/backend/index.ts apps/admin/src/AdminApp.tsx apps/admin/src/admin.css apps/admin/src/MatrixAnalysisStatus.test.tsx
git commit -m "feat(admin): monitor Matrix analysis status"
```

### Task 5: Verify Full API, PWA, Database, and Admin Integration

**Files:**
- Create: `tests/matrix-full-integration.test.mjs`
- Modify: `tests/tests.txt`
- Modify: `README.md`

**Interfaces:**
- Verifies: official draw → immutable version → four analysis products → entitlement-filtered APIs → synchronized PWA/admin reads.

- [ ] **Step 1: Write the failing integration harness**

Use deterministic in-memory adapters and mocked Supabase/Auth HTTP to cover all four lotteries, one completed version, member plans/free referrals, custom save/apply/reset, stale-version rejection, per-lottery failure isolation, and admin status projection. Assert no PWA endpoint returns a writing artifact or backend secret.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/matrix-full-integration.test.mjs`

Expected: FAIL until every plan's public factory is connected consistently.

- [ ] **Step 3: Fix integration seams only**

Resolve import, contract, route wiring, and envelope mismatches without duplicating engine behavior in the harness. Document required Supabase URL/anon/service-role and matching admin monitor token secrets; do not include values.

- [ ] **Step 4: Run the complete verification suite**

Run: `npm run test:unit`

Expected: PASS.

Run: `node --test tests/matrix-full-integration.test.mjs && npm run test:sites`

Expected: PASS, including 390px, 375px, and 360px UI checks.

Run: `npm run build:verified && npm --prefix apps/admin run build`

Expected: both production builds succeed.

Run: `npx supabase db lint --local`

Expected: no schema or RLS lint errors.

- [ ] **Step 5: Update operational documentation**

Document scheduled entry points, required secrets by deployment, three-day retention, status endpoint fields, entitlement matrix, and the fact that reruns are scheduler-controlled. Add the integration harness to `tests/tests.txt`.

- [ ] **Step 6: Commit**

```bash
git add tests/matrix-full-integration.test.mjs tests/tests.txt README.md
git commit -m "test: verify full Matrix integration"
```

### Task 6: Final Verification and Branch Handoff

**Files:**
- Verify only: all files changed by Plans 01–06.

- [ ] **Step 1: Confirm branch and clean scope**

Run: `git branch --show-current && git status --short`

Expected: branch is `api`; only intentional files are changed.

- [ ] **Step 2: Run final gates from a clean process**

Run: `npm run test:unit && node --test tests/matrix-full-integration.test.mjs && npm run test:sites && npm run build:verified && npm --prefix apps/admin run build`

Expected: every command exits 0.

- [ ] **Step 3: Review the diff and secrets**

Run: `git diff --check && git diff --stat && rg -n "service_role|MATRIX_ADMIN_STATUS_TOKEN=" --glob '!docs/**' --glob '!*.test.*' .`

Expected: no whitespace errors and no committed secret values.

- [ ] **Step 4: Use the completion workflow**

Invoke `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`, and finally `superpowers:finishing-a-development-branch`. Do not merge or deploy until the chosen handoff option is confirmed.
