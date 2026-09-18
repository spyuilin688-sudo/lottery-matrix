# Matrix Data Read Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace query-time Matrix algorithm execution with read-only completed-result access, PWA period-versioned local caching, and duplicate request suppression without changing Matrix algorithm logic.

**Architecture:** Completed Matrix results are versioned by lottery and draw period. Member queries identify a completed result by the full existing result-affecting request and read only that stored result; the PWA persists identical results in local storage and invalidates previous-period entries solely when the draw period changes. API reads are coalesced while identical requests are in flight.

**Tech Stack:** React, TypeScript, Vite PWA, AppDeploy API/Database.

**Spec:** User-approved Matrix data-read rules from 2026-08-20.

## Global Constraints

- Do not change Matrix algorithm logic, validation rules, exploration conditions, road qualification rules, or result contents.
- Do not create a second parallel Matrix data-control source.
- Remove query-time algorithm execution from the member read route rather than covering it with an override.
- Cache invalidation is based on draw period changes only; no TTL/countdown expiry.
- Same full query must not repeatedly call Database.

---

### Task 1: PWA period-versioned Matrix result cache

**Files:**
- Create: `src/matrix-result-cache.test.ts`
- Create: `src/matrix-result-cache.ts`
- Modify: `src/matrix-algorithm-api.ts`

- [ ] Write failing tests for full-condition cache keys, same-period reuse, and period-change invalidation.
- [ ] Run unit tests and confirm failure because the cache module does not exist.
- [ ] Implement the cache module without TTL.
- [ ] Change the Matrix API wrapper to require draw period, read local cache first, coalesce identical in-flight client requests, and cache completed responses.
- [ ] Run unit tests and build.

### Task 2: AppDeploy completed-result read path

**Files:**
- Create: `backend/matrix-result-store.ts` in the deployed API source.
- Modify: `backend/index.ts` in the deployed API source.
- Modify: `src/App.tsx` and `tests/tests.txt` in the deployed API admin source only where the existing validation UI assumes query-time execution.

- [ ] Implement a bounded completed-result store keyed by lottery, draw period, and canonical full query.
- [ ] Implement API in-flight read coalescing for identical keys.
- [ ] Replace `POST /api/matrix/algorithm/explore` so it reads completed results only and never calls `runMatrixAlgorithm`.
- [ ] Preserve algorithm case verification through the existing dedicated case-check route.
- [ ] Update API-admin validation text/test expectations so they no longer require member POST to execute the algorithm.
- [ ] Deploy and verify runtime/QA.

### Task 3: Version propagation

**Files:**
- Modify: `src/lottery-api.ts`

- [ ] When the existing latest-draw response provides a period, update the local Matrix current-period marker for that lottery.
- [ ] Confirm a new period invalidates only the previous Matrix result cache for that lottery.
- [ ] Confirm no time-based expiration was introduced.

### Task 4: Final verification and synchronization

- [ ] Verify no Matrix algorithm functions were changed.
- [ ] Verify member result reads cannot execute the algorithm.
- [ ] Verify identical in-flight API reads share one Database read.
- [ ] Verify repeated PWA queries use local cache.
- [ ] Verify GitHub `lottery-matrix/main` contains all React/PWA changes.
- [ ] Verify AppDeploy production API is updated and healthy.
- [ ] Record any unresolved item that cannot be implemented without adding an unprovided precompute-condition source.
