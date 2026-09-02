# Worker Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scheduled draw acquisition distinguish a current draw from a stale source response, repair recent gaps, and isolate acquisition status from analysis failures.

**Architecture:** Keep scheduling in `worker.py`, but split a due invocation into a tracked acquisition phase followed by an untracked analysis phase. Extend repository job completion metadata and the Supabase table with the three compared periods. Reuse `DrawRefreshService.ensure_history` for internal gap repair.

**Tech Stack:** Python 3.12, pytest, Supabase Postgres, Railway cron

**Spec:** `docs/superpowers/specs/2026-09-02-worker-freshness-design.md`

## Global Constraints

- Modify only worker acquisition, job status persistence, its migration, and directly related tests.
- Do not change frontend behavior.
- Do not mark stale source data as success.
- Do not let analysis failures overwrite successful acquisition status.
- Do not force push or overwrite newer `main` changes.

---

### Task 1: Job status metadata contract

**Files:**
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Modify: `services/matrix-api/tests/test_job_status_repository.py`
- Create: `supabase/migrations/20260902070000_worker_freshness_status.sql`
- Test: `services/matrix-api/tests/test_job_status_repository.py`

**Interfaces:**
- Consumes: existing `finish_job(job_name, status, finished_at, error)` calls.
- Produces: optional `source_period`, `database_period`, and `written_period` persistence.

- [ ] Add failing repository tests asserting the three period fields are written and normalized.
- [ ] Run the focused tests and confirm they fail because metadata is not supported.
- [ ] Extend both repository implementations and add nullable Supabase columns.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Freshness-aware acquisition

**Files:**
- Modify: `services/matrix-api/app/worker.py`
- Modify: `services/matrix-api/tests/test_worker_job_status.py`
- Test: `services/matrix-api/tests/test_worker_job_status.py`

**Interfaces:**
- Consumes: `DrawRefreshService.refresh`, `ensure_history`, and repository job status methods.
- Produces: `waiting_source` for stale data and `success` only for the expected draw.

- [ ] Change the existing stale-source test to require `waiting_source` and compared-period metadata.
- [ ] Add a failing test proving analysis failure leaves acquisition status as `success`.
- [ ] Run focused tests and confirm the expected failures.
- [ ] Split acquisition from analysis and map stale acquisition to `waiting_source`.
- [ ] Run focused tests and confirm they pass.

### Task 3: Gap repair and regression verification

**Files:**
- Modify: `services/matrix-api/tests/test_worker_job_status.py`
- Test: `services/matrix-api/tests/test_worker_job_status.py`

**Interfaces:**
- Consumes: existing `DrawRefreshService.ensure_history` gap detection.
- Produces: a due successful acquisition that repairs internal recent gaps before analysis.

- [ ] Add a failing worker test with an internal period gap and a complete source history.
- [ ] Run the focused test and confirm the history fetch expectation fails.
- [ ] Invoke recent history repair inside the tracked acquisition phase.
- [ ] Run the focused test and confirm it passes.

### Task 4: Database application and final verification

**Files:**
- Verify all files above.

**Interfaces:**
- Consumes: completed code and migration.
- Produces: deployed schema contract and a merge-safe main update.

- [ ] Run the complete Python test suite.
- [ ] Apply the Supabase migration and verify the new columns with a read query.
- [ ] Fetch latest `main`, inspect overlapping changes, and rebase without force.
- [ ] Re-run the complete test suite after synchronization.
- [ ] Commit and push the fast-forward result to `main`.
