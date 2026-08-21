# Matrix Explore API and PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Precompute canonical Matrix Explore artifacts and replace the PWA's hardcoded Explore results with authenticated list and validation-detail APIs.

**Architecture:** The existing approved algorithm remains the calculation core. A service enumerates canonical full settings after a draw, stores rows plus detached validation details, and filters completed rows by the authenticated member's requested settings without recalculation.

**Tech Stack:** TypeScript, AppDeploy Database/API, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-matrix-full-api-integration-design.md`

## Global Constraints

- Preserve `normalizeMatrixNumber`, `evaluateMatrixAlgorithm`, `+0` drag classification, and the existing invalid-rule logic.
- Two/seven/thirteen periods, today/yesterday/day-before, standard/full, both number orders, and one/two locked codes must come from completed artifacts.
- Standard range is upper 1–7; full range is upper 1–14; result period is excluded from validation.
- List responses omit validation rows; details are fetched only on expansion.
- Free/referral/Pro permissions are enforced in the backend.

---

### Task 1: Lock Existing Explore Behavior with Regression Tests

**Files:**
- Create: `backend/matrix-algorithm.test.ts`
- Modify: `backend/matrix-algorithm.ts`

**Interfaces:**
- Consumes: existing `runMatrixAlgorithmWithHistory()` and `runMatrixAutomaticExploreWithHistory()`.
- Produces: exported typed `MatrixExploreRow` and `MatrixValidationDetail` without changing calculations.

- [ ] **Step 1: Write regression tests for approved invariants**

```ts
it('+0 is emitted as drag and never as arithmetic', () => {
  const result = runMatrixAlgorithmWithHistory(zeroRuleRequest, zeroRuleHistory);
  expect(allRules(result).filter((rule) => rule.value === 0).map((rule) => rule.algorithmType)).toEqual(['拖牌']);
});

it('stops validation at thirteen historical groups', () => {
  const result = runMatrixAlgorithmWithHistory(request, historyWithFourteenHits);
  expect(result.highestStreak).toBe(13);
});

it('does not include the result period in validation rows', () => {
  const result = runMatrixAutomaticExploreWithHistory(exploreRequest, history);
  expect(allValidationPeriods(result)).not.toContain(resultPeriod);
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test:unit -- backend/matrix-algorithm.test.ts`

Expected: tests fail until explicit result types and fixtures are added; existing case checks remain unchanged.

- [ ] **Step 3: Export only the required types/helpers**

Add explicit result types and make the minimum visibility changes required by tests. Do not rewrite loops, sorting, normalization, or validation formulas.

- [ ] **Step 4: Run regression and existing case checks**

Run: `npm run test:unit -- backend/matrix-algorithm.test.ts`

Expected: all regression cases pass.

- [ ] **Step 5: Commit**

```bash
git add backend/matrix-algorithm.ts backend/matrix-algorithm.test.ts
git commit -m "test(api): lock Matrix Explore behavior"
```

### Task 2: Build and Filter the Canonical Explore Artifact

**Files:**
- Create: `backend/matrix-explore-service.ts`
- Create: `backend/matrix-explore-service.test.ts`

**Interfaces:**
- Produces: `buildExploreArtifact(lottery, drawPeriod, history): ExploreArtifact`.
- Produces: `filterExploreArtifact(artifact, request, entitlements): { items; duplicateStats; total }`.
- Produces: `getExploreValidation(artifact, itemId): MatrixValidationDetail | null`.

- [ ] **Step 1: Write failing service tests**

```ts
it('builds one canonical artifact and strips validation from list rows', () => {
  const artifact = buildExploreArtifact('今彩539', '114000123', history);
  const list = filterExploreArtifact(artifact, monthlyRequest, monthlyEntitlements);
  expect(list.items.length).toBeGreaterThan(0);
  expect(list.items[0]).not.toHaveProperty('historicalValidation');
  expect(getExploreValidation(artifact, list.items[0].id)).not.toBeNull();
});

it('rejects thirteen/full requests when entitlement is absent', () => {
  expect(() => filterExploreArtifact(artifact, proOnlyRequest, freeEntitlements)).toThrowError('FORBIDDEN');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-explore-service.test.ts`

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement canonical generation**

Enumerate two number orders, date offsets 0/1/2, periods 2/7/13, rule counts 1/2, algorithm types add/sum/drag, and the full upper range. Store each row with its filter metadata and place validation under `validationById[row.id]`. Derive standard-range responses by excluding rows whose reference offset is below -7.

- [ ] **Step 4: Implement backend filtering**

Filter by exact requested lottery, order, date offset, period, range, hit condition, selected road types, selected streaks, and same-code option. Sort by highest streak descending, prediction distance ascending, and locked position ascending. Recalculate duplicate statistics from the filtered rows only.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- backend/matrix-explore-service.test.ts backend/matrix-algorithm.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/matrix-explore-service.ts backend/matrix-explore-service.test.ts
git commit -m "feat(api): build canonical Explore artifacts"
```

### Task 3: Add Authenticated Explore List and Detail Routes

**Files:**
- Modify: `backend/index.ts`
- Create: `backend/matrix-explore-routes.test.ts`

**Interfaces:**
- Produces: `POST /api/matrix/algorithm/explore` list response.
- Produces: `POST /api/matrix/algorithm/explore/validation` detail response.
- Consumes: `requireMember`, `resolveMatrixEntitlements`, `readAnalysis`, and Task 2 filters.

- [ ] **Step 1: Write failing route tests**

Assert 401 without bearer token, 403 for unauthorized thirteen/full access, 404 `ANALYSIS_NOT_READY` for missing complete artifact, and 409 `ANALYSIS_VERSION_MISMATCH` when detail version differs. A successful list contains `analysisVersion`, `drawPeriod`, `items`, `total`, and `duplicateStats` but no validation arrays.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-explore-routes.test.ts`

Expected: FAIL because the detail route and guards are absent.

- [ ] **Step 3: Replace the legacy route internals**

Keep the approved route path. Resolve member first, then entitlements, then a complete artifact, then filter. The validation route accepts `{ lottery, drawPeriod, analysisVersion, itemId }` and returns only that item's detached validation.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- backend/matrix-explore-routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/index.ts backend/matrix-explore-routes.test.ts
git commit -m "feat(api): serve completed Explore results"
```

### Task 4: Replace Hardcoded PWA Explore Results

**Files:**
- Modify: `src/matrix-algorithm-api.ts`
- Modify: `src/FeaturePages.tsx`
- Modify: `src/__tests__/MatrixExplorePage.test.tsx`
- Modify: `src/feature-pages.css`

**Interfaces:**
- Produces: `fetchExploreList(request)` and `fetchExploreValidation(meta, itemId)`.
- Consumes: authenticated client from Plan 01 and existing Explore visual components.

- [ ] **Step 1: Write failing UI tests**

```ts
it('renders API rows instead of fixture numbers', async () => {
  api.fetchExploreList.mockResolvedValue(exploreEnvelope);
  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('114000123')).toBeInTheDocument();
  expect(screen.queryByText('03.09')).not.toBeInTheDocument();
});

it('loads validation only when a result expands', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));
  expect(api.fetchExploreValidation).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- src/__tests__/MatrixExplorePage.test.tsx`

Expected: FAIL because the page still uses `resultRows` and fake duplicate values.

- [ ] **Step 3: Implement list/loading/error rendering**

Delete the hardcoded `resultRows`, `duplicateNumbers`, and multiplication-based result count. Submit exact selected settings, render response rows/statistics/count, preserve the current layout, and keep successful data visible during a later request.

- [ ] **Step 4: Implement lazy validation rendering**

Cache detail responses by `analysisVersion:itemId`; render the existing validation layout from actual rows. Never fabricate a fallback validation process.

- [ ] **Step 5: Run UI and responsive tests**

Run: `npm run test:unit -- src/__tests__/MatrixExplorePage.test.tsx && node --test tests/matrix-explore-fluid-layout.test.mjs tests/matrix-explore-option-layout.test.mjs`

Expected: PASS at existing structure and responsive contracts.

- [ ] **Step 6: Commit**

```bash
git add src/matrix-algorithm-api.ts src/FeaturePages.tsx src/__tests__/MatrixExplorePage.test.tsx src/feature-pages.css
git commit -m "feat(pwa): render completed Explore results"
```
