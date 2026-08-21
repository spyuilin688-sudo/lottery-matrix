# Matrix Tianyan API and PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved composite-road Tianyan engine, its completed-result APIs, and the real Tianyan PWA result flow.

**Architecture:** Tianyan consumes completed single-road candidates and selects exactly two distinct rules under the PDF's independent-contribution and coverage rules. Composite validation is stored separately from list rows and published through the common artifact store.

**Tech Stack:** TypeScript, AppDeploy API/Database, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-matrix-full-api-integration-design.md`

## Global Constraints

- Each result contains exactly two rules.
- Validation position or algorithm differs between the two rules.
- Same position plus same algorithm is invalid.
- Every historical group is covered by at least one rule.
- Each rule independently hits at least `ceil(N × 30%)`; `bothHit` contributes to neither independent count.
- At most 30 historical groups.
- Merged predictions above two make the result invalid.
- Streak filters are 5→6, 6→7, 7→8, 9→10, 11→12, 13→14, 15→16, and 17→18+; defaults begin at 9→10.
- Appendix A expected predictions are 03/15, 03/34, 03/20, 07/30, and 19/36.

---

### Task 1: Encode Tianyan Contracts and Appendix A Cases

**Files:**
- Create: `backend/matrix-tianyan.ts`
- Create: `backend/matrix-tianyan.test.ts`
- Create: `backend/matrix-tianyan-cases.ts`
- Create: `backend/matrix-tianyan-cases.test.ts`

**Interfaces:**
- Produces: `TianyanRule`, `TianyanHistoricalGroup`, `TianyanResult`, `evaluateTianyanCandidate(input)`.
- Produces: `runTianyanAppendixCases(): { name; expected; actual; pass }[]`.

- [ ] **Step 1: Write failing formal-rule tests**

```ts
it('does not count bothHit as independent contribution', () => {
  const result = evaluateTianyanCandidate(candidateWithOnlyBothHits);
  expect(result.valid).toBe(false);
});

it('requires ceil of thirty percent for each rule', () => {
  const result = evaluateTianyanCandidate(candidateWithTenGroupsAndTwoIndependentHitsEach);
  expect(result.valid).toBe(false);
});

it('rejects more than two merged predictions', () => {
  expect(evaluateTianyanCandidate(threePredictionCandidate).valid).toBe(false);
});
```

- [ ] **Step 2: Add the five Appendix A expected outputs**

```ts
export const TIANYAN_APPENDIX_EXPECTED = [
  ['案例1', ['03', '15']], ['案例2', ['03', '34']], ['案例3', ['03', '20']],
  ['案例4', ['07', '30']], ['案例5', ['19', '36']],
] as const;
```

Transcribe the five case inputs and historical group tables from Appendix A into `matrix-tianyan-cases.ts`; do not replace these five acceptance cases with synthetic inputs.

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-tianyan.test.ts backend/matrix-tianyan-cases.test.ts`

Expected: FAIL because the evaluator is absent.

- [ ] **Step 4: Implement the evaluator**

For each group classify `rule1Hit`, `rule2Hit`, and `bothHit`; stop at 30; require union coverage of every included group; compute independent counts excluding both-hit groups; require `Math.ceil(groupCount * 0.3)` for each rule; retain both rule identities even when final predictions match.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- backend/matrix-tianyan.test.ts backend/matrix-tianyan-cases.test.ts`

Expected: all formal tests and five Appendix A outputs pass.

- [ ] **Step 6: Commit**

```bash
git add backend/matrix-tianyan.ts backend/matrix-tianyan.test.ts backend/matrix-tianyan-cases.ts backend/matrix-tianyan-cases.test.ts
git commit -m "feat(api): implement Tianyan composite roads"
```

### Task 2: Build Tianyan Artifacts and Authenticated APIs

**Files:**
- Create: `backend/matrix-tianyan-service.ts`
- Create: `backend/matrix-tianyan-service.test.ts`
- Modify: `backend/index.ts`
- Create: `backend/matrix-tianyan-routes.test.ts`

**Interfaces:**
- Produces: `buildTianyanArtifact(lottery, drawPeriod, exploreArtifact)`.
- Produces: `filterTianyanArtifact(artifact, selectedStreaks)`.
- Produces: `POST /api/matrix/algorithm/tianyan` and `POST /api/matrix/algorithm/tianyan/validation`.

- [ ] **Step 1: Write failing service tests**

Assert fixed hit condition is two locked codes, fixed type is composite, identical complete results deduplicate once, different rule identities remain, and list rows exclude validation.

- [ ] **Step 2: Write failing route tests**

Assert quarterly/yearly/lifetime succeed, free/trial/monthly return 403, incomplete artifacts return 404, and detail requests reject a mismatched analysis version.

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-tianyan-service.test.ts backend/matrix-tianyan-routes.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement service and routes**

Use the approved streak list. The list request accepts only lottery, draw period, and selected streaks; it never recomputes Tianyan. Detail returns two rules, independent contribution counts, both-hit markers, and historical validation for one item.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- backend/matrix-tianyan.test.ts backend/matrix-tianyan-cases.test.ts backend/matrix-tianyan-service.test.ts backend/matrix-tianyan-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/matrix-tianyan.ts backend/matrix-tianyan.test.ts backend/matrix-tianyan-cases.ts backend/matrix-tianyan-cases.test.ts backend/matrix-tianyan-service.ts backend/matrix-tianyan-service.test.ts backend/matrix-tianyan-routes.test.ts backend/index.ts
git commit -m "feat(api): publish Tianyan results"
```

### Task 3: Connect the Tianyan PWA

**Files:**
- Modify: `src/matrix-algorithm-api.ts`
- Modify: `src/FeaturePages.tsx`
- Create: `src/__tests__/MatrixTianyanPage.test.tsx`

**Interfaces:**
- Produces: `fetchTianyanList()` and `fetchTianyanValidation()`.
- Consumes: existing `MatrixExplorePage` Tianyan visual variant.

- [ ] **Step 1: Write failing Tianyan UI tests**

Assert only composite road and two-code hit condition render, default streaks are 9→10/11→12/13→14/15→16/17→18+, API rows replace Explore fixtures, and validation loads only when expanded.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- src/__tests__/MatrixTianyanPage.test.tsx`

Expected: FAIL because Tianyan shares fake Explore rows.

- [ ] **Step 3: Split data behavior from shared visual layout**

Keep shared presentation components, but route Tianyan search/detail calls to Tianyan endpoints. Remove near-10-history rendering for Tianyan and retain its approved settings/filter presentation.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/__tests__/MatrixTianyanPage.test.tsx src/__tests__/MatrixExplorePage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/matrix-algorithm-api.ts src/FeaturePages.tsx src/__tests__/MatrixTianyanPage.test.tsx
git commit -m "feat(pwa): render completed Tianyan results"
```
