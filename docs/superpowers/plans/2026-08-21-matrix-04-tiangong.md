# Matrix Tiangong API and PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved 50/80-period Tiangong engine, publish completed Tiangong artifacts, and replace the PWA fixture with authenticated results.

**Architecture:** A pure engine enumerates every valid three-source equal-spacing combination inside the selected 50/80-period range and evaluates one-stage/two-stage position and road rules. A service deduplicates complete results, detaches validation details, and publishes one immutable artifact per lottery/draw.

**Tech Stack:** TypeScript, AppDeploy API/Database, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-matrix-full-api-integration-design.md`

## Global Constraints

- Analyze exactly the selected 50 or 80 periods and enumerate every three-source equal-spacing combination fully inside that range.
- Support one-stage and two-stage exploration with hit conditions 2→3 and 3→4.
- Preserve fixed, increasing, and decreasing position directions.
- Road ranges are add/subtract `+1..+49` and `-1..-49`, sum `1..98`, and drag `+0` only.
- Results are computed after official draw synchronization and never in the PWA.
- Only yearly and lifetime members may read Tiangong results.

---

### Task 1: Implement the Pure Tiangong Engine

**Files:**
- Create: `backend/matrix-tiangong.ts`
- Create: `backend/matrix-tiangong.test.ts`

**Interfaces:**
- Produces: `TiangongSourceTriple`, `TiangongCandidate`, `TiangongResult`, `enumerateEqualSpacingTriples(periods)`, `evaluateTiangongCandidate(input)`.

- [ ] **Step 1: Write failing source enumeration and classification tests**

```ts
expect(enumerateEqualSpacingTriples(50)).toContainEqual([1, 25, 49]);
expect(enumerateEqualSpacingTriples(50)).not.toContainEqual([1, 26, 51]);
expect(enumerateEqualSpacingTriples(80).every(([a, b, c]) => b - a === c - b && c <= 80)).toBe(true);
expect(evaluateTiangongCandidate(zeroOffsetInput).roadType).toBe('拖牌');
```

Add cases for one-stage/two-stage, 2→3/3→4, fixed/increasing/decreasing positions, rejected non-equal-spacing sources, `+1..+49`/`-1..-49`/sum `1..98` boundaries, normalized lottery ranges, and exclusion when next-N is outside the verifiable range.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-tiangong.test.ts`

Expected: FAIL because the engine is absent.

- [ ] **Step 3: Implement the minimum engine**

Represent source indices as one-based period positions. Enumerate triples rather than accepting arbitrary caller paths; normalize predictions through the shared lottery helper; classify zero arithmetic offset as drag; and return deterministic rule identity, interval, predicted position/number, stage, direction, road types, and detached validation rows. In one-stage mode omit all second-stage fields.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- backend/matrix-tiangong.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/matrix-tiangong.ts backend/matrix-tiangong.test.ts
git commit -m "feat(api): implement Tiangong engine"
```

### Task 2: Add Tiangong Acceptance Cases

**Files:**
- Create: `backend/matrix-tiangong-cases.ts`
- Create: `backend/matrix-tiangong-cases.test.ts`

**Interfaces:**
- Produces: `runTiangongAcceptanceCases()`.

- [ ] **Step 1: Write failing synthetic acceptance cases**

Create deterministic histories that cover 50/80 periods, one-stage/two-stage, all three position directions, every road type and boundary, 2→3/3→4 transitions, all four lottery ranges, next-N exclusion, complete-result deduplication, and separate display of identical predictions from different road identities.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-tiangong-cases.test.ts`

Expected: FAIL until all acceptance fixtures pass through the real engine.

- [ ] **Step 3: Complete only missing engine behavior**

Do not special-case fixture values. Extend the engine only where the acceptance matrix exposes a missing approved rule.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- backend/matrix-tiangong.test.ts backend/matrix-tiangong-cases.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/matrix-tiangong-cases.ts backend/matrix-tiangong-cases.test.ts backend/matrix-tiangong.ts
git commit -m "test(api): cover Tiangong acceptance matrix"
```

### Task 3: Publish Tiangong Artifacts and Routes

**Files:**
- Create: `backend/matrix-tiangong-service.ts`
- Create: `backend/matrix-tiangong-service.test.ts`
- Create: `backend/matrix-tiangong-routes.test.ts`
- Modify: `backend/index.ts`

**Interfaces:**
- Produces: `buildTiangongArtifact(lottery, drawPeriod, history)` and `filterTiangongArtifact(artifact, request)`.
- Produces: `POST /api/matrix/algorithm/tiangong` and `POST /api/matrix/algorithm/tiangong/validation`.

- [ ] **Step 1: Write failing service tests**

Assert one canonical 80-period artifact per lottery/draw can filter 50-period requests, deterministic complete-rule/result deduplication, distinct road identities retained for the same prediction, list rows without validation arrays, interval-ascending sorting, and detail lookup by item id.

- [ ] **Step 2: Write failing route tests**

Assert 401 without login, 403 for free/monthly/quarterly, success for yearly/lifetime, 404 for incomplete analysis, and 409 for a detail request with a stale analysis version.

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-tiangong-service.test.ts backend/matrix-tiangong-routes.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement service and routes**

Read only complete artifacts. Filter by 50/80 periods, one/two stage, 2→3/3→4, selected position directions, first-stage position/road, and—only in two-stage mode—second-stage position/road, without recalculating. Return list metadata plus interval/predicted position/prediction/road rows and one detached validation record from the detail route.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- backend/matrix-tiangong.test.ts backend/matrix-tiangong-cases.test.ts backend/matrix-tiangong-service.test.ts backend/matrix-tiangong-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/matrix-tiangong-service.ts backend/matrix-tiangong-service.test.ts backend/matrix-tiangong-routes.test.ts backend/index.ts
git commit -m "feat(api): publish Tiangong results"
```

### Task 4: Connect the Tiangong PWA

**Files:**
- Modify: `src/matrix-algorithm-api.ts`
- Modify: `src/FeaturePages.tsx`
- Create: `src/__tests__/MatrixTiangongPage.test.tsx`
- Modify: `src/feature-pages.css`

**Interfaces:**
- Produces: `fetchTiangongList()` and `fetchTiangongValidation()`.

- [ ] **Step 1: Write failing UI tests**

Assert the page submits 50/80 periods, one/two stage, 2→3/3→4, multi-selected directions and stage-specific controls; renders API interval/predicted position/prediction/road values; omits the second-stage fields in one-stage mode; removes the hardcoded result and near-ten draws; has no streak filter; loads validation only when expanded; and renders not-ready/forbidden/error states without fake fallback data.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- src/__tests__/MatrixTiangongPage.test.tsx`

Expected: FAIL because the page contains a fixture result.

- [ ] **Step 3: Implement authenticated list/detail behavior**

Use the common authenticated client. Keep the existing visual controls, disable repeated submits during the same request, retain a successful result while a new request loads, and cache detail by `analysisVersion:itemId`.

- [ ] **Step 4: Run UI and responsive tests**

Run: `npm run test:unit -- src/__tests__/MatrixTiangongPage.test.tsx && npm run test:sites`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/matrix-algorithm-api.ts src/FeaturePages.tsx src/__tests__/MatrixTiangongPage.test.tsx src/feature-pages.css
git commit -m "feat(pwa): render completed Tiangong results"
```
