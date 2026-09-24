# Completed Result Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share completed public homepage results across requests and refresh only when the underlying draw or analysis changes.

**Architecture:** A service-role-only RPC returns versions of the four public draw/analysis inputs. Railway reuses its latest-result JSON when that version is unchanged; Matrix Status Edge reuses only successful public summary responses. Both recheck when the version changes and fall back to the old path if the probe fails.

**Tech Stack:** PostgreSQL/Supabase, Python Railway API, TypeScript Supabase Edge Function, PGlite/Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-09-24-completed-result-cache.md`

## Global Constraints

- Run only tests in files changed for this feature, per `AGENTS.md`.
- Keep existing response shape, authorization, and calendar eligibility.
- Do not cache permission settings, detail, failures, or personalized responses.

## Review Focus

- Same-period correction updates the draw revision and invalidates both cached summaries and latest-result data.
- Analysis change without draw change updates the worker generation and invalidates both caches.
- Calendar override is read for each requested `cycleDate`, even on a latest-result cache hit.
- Missing version RPC follows the original read path during staged deployment.
- Concurrent edit during a cold load cannot publish the old result to the new version.

---

### Task 1: Service-only public revision

**Files:** `supabase/migrations/20260924182100_completed_result_revision.sql`, `backend/completed-result-revision-sql.test.ts`.

**Interfaces:** `matrix_public_result_revision()` returns a JSON object mapping each of the four lotteries to a JSON value derived from draw revision, worker generation and current active analysis versions; callable only by service_role.

- [ ] Write a PGlite test that creates the private source rows, executes the migration and asserts the revision changes after edits to draw, completion and active analysis, plus RPC access grants.
- [ ] Run `npx vitest run backend/completed-result-revision-sql.test.ts` and observe the missing function failure.
- [ ] Define the function with a fixed lottery list, explicit schema references, and service-role-only EXECUTE.
- [ ] Rerun that test and inspect the SQL diff.

### Task 2: Public Railway latest-result reuse

**Files:** `services/matrix-api/app/api_server.py`, `services/matrix-api/tests/test_public_api.py`.

**Interfaces:** calls `matrix_public_result_revision` with `{}` and uses a bounded process cache for the existing `{drawDate, items}` result; `dueLotteries` remains a separate live read.

- [ ] Write tests for one full read on two same-version requests, version invalidation, per-request calendar check, probe failure fallback, and version change during first load.
- [ ] Run `pytest services/matrix-api/tests/test_public_api.py -k latest_result` and verify a relevant failure.
- [ ] Keep current query logic in an uncached loader, wrap it in the existing `DrawReadCache`, and compare version before publishing a cold entry.
- [ ] Rerun only the focused file and inspect its diff.

### Task 3: Public Matrix Status summary reuse

**Files:** `supabase/functions/matrix-status/source-reader.ts`, `supabase/functions/matrix-status/index.ts`, `supabase/functions/matrix-status/handler.ts`, `backend/matrix-status-edge-handler.test.ts`, `backend/matrix-status-source-reader.test.ts`.

**Interfaces:** one revision RPC per summary request, with successful summary responses cached by lottery/version inside each Edge isolate; full detail and identity routes unchanged.

- [ ] Write focused tests for a repeated batch, same-period correction, separate detailed reads, and version probe failure.
- [ ] Run `npx vitest run backend/matrix-status-edge-handler.test.ts backend/matrix-status-source-reader.test.ts` and observe a relevant failure.
- [ ] Add the revision reader and inject it into the handler; cache successful summaries with version recheck around cold loads.
- [ ] Rerun those tests, inspect the diff, and check types with `npx tsc --noEmit`.

### Task 4: Integration

**Files:** Only the files above.

- [ ] Inspect the combined diff, run the exact affected test files and SQL ACL checks, and confirm the local branch still builds.
- [ ] Compare against the newest `origin/main` for overlapping edits; merge after verification.
