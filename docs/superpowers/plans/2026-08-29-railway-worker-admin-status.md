# Railway Worker Admin Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add verifiable Railway health and job-status APIs, write Railway execution state to Supabase, and let the AppDeploy admin backend read those endpoints without changing any UI.

**Architecture:** The Python Railway service remains the only draw-fetch and Matrix calculation runtime. It writes `system_job_status` and reads `lottery_draws` plus `matrix_analysis_runs` to expose operational status. The AppDeploy backend loads `RAILWAY_WORKER_URL` from secrets and proxies the read-only Railway status to authenticated administrators.

**Tech Stack:** Python 3.13, pytest, Supabase Python client, TypeScript, Vitest, AppDeploy SDK.

**Spec:** User-approved first batch from the current conversation.

## Global Constraints

- Do not change PWA or admin UI files.
- Do not start or add a production calculation schedule.
- Do not keep a hard-coded AppDeploy calculation URL in admin backend code.
- Railway remains the calculation runtime; Supabase remains the durable data store.
- Preserve existing API behavior outside the explicitly changed endpoints.

---

### Task 1: Railway operational status API

**Files:**
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Modify: `services/matrix-api/app/api_server.py`
- Test: `services/matrix-api/tests/test_public_api.py`

**Interfaces:**
- Produces: `AnalysisRepository.health_check() -> None`
- Produces: `AnalysisRepository.list_job_statuses() -> list[dict[str, Any]]`
- Produces: `GET /health`
- Produces: `GET /jobs/status`

- [ ] **Step 1: Write failing API tests**

Add tests asserting that `/health` invokes repository connectivity and returns service/version/database fields, that a failed connectivity check returns HTTP 503, and that `/jobs/status` returns the repository operational rows.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pytest -q services/matrix-api/tests/test_public_api.py
```

Expected: failures because `health_check`, `list_job_statuses`, and `/jobs/status` do not exist.

- [ ] **Step 3: Implement minimal repository and route behavior**

Add no-op/in-memory implementations for tests and Supabase implementations that probe `lottery_draws`, read the latest `system_job_status`, latest draw, and latest analysis state for each lottery.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
pytest -q services/matrix-api/tests/test_public_api.py
```

### Task 2: Railway job-state writes

**Files:**
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Modify: `services/matrix-api/app/worker.py`
- Test: `services/matrix-api/tests/test_worker.py`

**Interfaces:**
- Produces: `start_job(job_name, lottery, started_at)`
- Produces: `finish_job(job_name, status, finished_at, error=None)`

- [ ] **Step 1: Write failing worker tests**

Add tests showing successful workers write `running -> success`, failed workers write `running -> failed`, and out-of-schedule calls do not overwrite the last execution record.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pytest -q services/matrix-api/tests/test_worker.py
```

- [ ] **Step 3: Implement minimal tracking**

Use the existing job names:

```text
matrix-539-refresh-v2
matrix-fantasy5-refresh-v2
matrix-marksix-refresh-v2
matrix-649-refresh-v2
```

Track only actual due/manual executions. Do not mark `not-due` calls as new executions.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
pytest -q services/matrix-api/tests/test_worker.py
```

### Task 3: AppDeploy admin proxy and configurable Railway base URL

**Files:**
- Create: `apps/admin/backend/worker-api.ts`
- Create: `apps/admin/backend/worker-api.test.ts`
- Modify: `apps/admin/backend/algorithm-api.ts`
- Modify: `apps/admin/backend/algorithm-api.test.ts`
- Modify: `apps/admin/backend/connection-status.ts`
- Modify: `apps/admin/backend/connection-status.test.ts`
- Modify: `apps/admin/backend/index.ts`

**Interfaces:**
- Consumes secret: `RAILWAY_WORKER_URL`
- Produces: `GET /api/admin/worker/status`
- Produces: `createWorkerApi(loadBaseUrl, fetcher)`

- [ ] **Step 1: Write failing TypeScript tests**

Tests must prove the base URL is loaded rather than hard-coded, URL trailing slashes are normalized, `/health` and `/jobs/status` are requested, and unavailable Railway responses do not throw.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm --prefix apps/admin test -- backend/worker-api.test.ts backend/algorithm-api.test.ts backend/connection-status.test.ts
```

- [ ] **Step 3: Implement the minimal backend adapter and route**

The route remains authenticated and view-only. No UI code changes.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npm --prefix apps/admin test -- backend/worker-api.test.ts backend/algorithm-api.test.ts backend/connection-status.test.ts
```

### Task 4: Documentation and verification

**Files:**
- Modify: `services/matrix-api/README.md`
- Modify: `services/matrix-api/.env.example`

- [ ] **Step 1: Document `/jobs/status`, Railway service version, and `RAILWAY_WORKER_URL`**
- [ ] **Step 2: Run the complete Python service suite**

```bash
pytest -q services/matrix-api/tests
```

- [ ] **Step 3: Run the complete admin suite and build**

```bash
npm --prefix apps/admin test
npm --prefix apps/admin run build
```

- [ ] **Step 4: Deploy only the AppDeploy admin backend changes and verify its health/status routes**
- [ ] **Step 5: Leave Railway schedules unchanged until a Railway deployment and one controlled calculation comparison are available**
