# Matrix Explore Result UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Matrix Explore reset behavior, 30-row paging, validation-row rules, and requested mobile UI refinements without changing the V12 API.

**Architecture:** Keep the Supabase/RPC response unchanged and normalize only the React presentation layer. `MatrixExplorePage` owns transient reset and paging state; `ExploreValidationProcess` derives normal or compact row arrays from `algorithmType`, `referenceOffset`, and rule displays; the existing scoped CSS files own visual changes.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Vite

**Spec:** `docs/superpowers/specs/2026-09-02-matrix-explore-result-ui-refinement-design.md`

## Global Constraints

- Use the existing V12 Matrix API response; do not modify Supabase RPC, database, algorithm, or result data.
- Modify only Matrix Explore behavior and scoped Matrix Explore styles.
- Render at most 30 results per page and preserve the complete result total.
- Preserve the current validation row height.
- Drag-road and same-period rows use only the locked-condition color state.
- Do not force-push, reset, revert, or overwrite concurrent `main` changes.

---

### Task 1: Start reset and result pagination

**Files:**
- Modify: `src/FeaturePages.tsx`
- Test: `src/__tests__/MatrixExplorePage.test.tsx`

**Interfaces:**
- Consumes: existing `defaultFilters`, `loadExplore`, and `visibleResults`.
- Produces: `resultPage: number`, `RESULTS_PER_PAGE = 30`, `paginatedResults: ExploreResult[]`.

- [ ] **Step 1: Write failing reset tests**

Add tests that select 「同碼」, select a duplicate number, change consecutive filters, then press 「開始探索」 and assert the last `fetchExploreList` call contains `sameCode: false`, no `predictionNumber`, and the exact defaults:

```ts
expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(expect.objectContaining({
  sameCode: false,
  selectedStreaks: ['準5進6', '準6進7', '準7進8'],
}));
expect(screen.getByRole('button', { name: '同碼' })).toHaveAttribute('aria-pressed', 'false');
```

Add the equivalent 準5+ assertion:

```ts
expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(expect.objectContaining({
  selectedStreaks: ['準7進8', '準9進10', '準11進12'],
}));
```

- [ ] **Step 2: Run reset tests and verify RED**

Run: `npx vitest run src/__tests__/MatrixExplorePage.test.tsx`

Expected: the new reset assertions fail because `startExplore` currently sends the selected filters and current `sameCode` state.

- [ ] **Step 3: Implement reset and paging state**

Add state and derivation:

```ts
const RESULTS_PER_PAGE = 30;
const [resultPage, setResultPage] = useState(1);
const resultPageCount = Math.max(1, Math.ceil(visibleResults.length / RESULTS_PER_PAGE));
const paginatedResults = visibleResults.slice(
  (resultPage - 1) * RESULTS_PER_PAGE,
  resultPage * RESULTS_PER_PAGE,
);
```

Update `startExplore` to reset UI state before requesting:

```ts
const nextFilters = defaultFilters[hit];
setSameCode(false);
setSelectedFilters(nextFilters);
setSelectedPredictionNumber(null);
setResultPage(1);
void loadExplore(nextFilters, false, null);
```

Reset page 1 in each result-changing handler and render `paginatedResults`. Render the existing `history-pagination` previous/page-count/next control under the results only when `resultPageCount > 1`.

- [ ] **Step 4: Write and run pagination tests**

Provide 31 API items, press 「開始探索」, assert 30 `article` result rows on page 1, click 「下一頁」, assert the 31st item appears, and assert the heading still contains the API `total`.

Run: `npx vitest run src/__tests__/MatrixExplorePage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/FeaturePages.tsx src/__tests__/MatrixExplorePage.test.tsx
git commit -m "feat(explore): reset filters and paginate results"
```

### Task 2: Validation row normalization and special-number separator

**Files:**
- Modify: `src/FeaturePages.tsx`
- Test: `src/__tests__/MatrixExplorePage.test.tsx`

**Interfaces:**
- Consumes: `ExploreValidation`, `ValidationDisplayRow`, `item.algorithmType`, `item.referenceOffset`, and `lottery`.
- Produces: compact historical/current validation row arrays and `.explore-validation-special-separator` markup.

- [ ] **Step 1: Write failing compact-row tests**

Add separate tests for:

```ts
const compact = item.algorithmType === '拖牌' || (item.referenceOffset ?? 0) === 0;
```

Assert one-rule compact history displays locked row plus draw-result row, no `.explore-validation-number--step`, and no `.explore-validation-number--hit`. Assert two-rule compact history inserts a middle formula-only row whose period and number cells are empty and whose right cell contains the second rule display. Preserve three data rows for a non-drag, non-same-period item.

- [ ] **Step 2: Run compact-row tests and verify RED**

Run: `npx vitest run src/__tests__/MatrixExplorePage.test.tsx`

Expected: compact cases fail because the component currently always renders source, reference, and prediction rows.

- [ ] **Step 3: Implement compact row normalization**

Extend `ValidationDisplayRow` with an optional formula-only marker and create rows in this order:

```ts
const compact = item.algorithmType === '拖牌' || (item.referenceOffset ?? 0) === 0;
const rows = compact
  ? [lockedRow, ...formulaOnlyRows, predictionWithoutHitState]
  : referenceFirst
    ? [reference, source, prediction]
    : [source, reference, prediction];
```

Use the locked row's `sourceNumber` only. Do not set `stepNumber` or `hitNumbers` in compact mode. Map the first displayed validation formula to the locked row, additional displayed formula to blank rows, and the bracketed result to the prediction row.

- [ ] **Step 4: Write failing lottery separator tests**

For a seven-number validation row, assert 六合彩彩票 and 大樂透 contain a visible `+` before the seventh number, while 今彩539 and 天天樂 do not.

- [ ] **Step 5: Implement the lottery separator**

Inside the number renderer, insert:

```tsx
{index === 6 && (lottery === '六合彩' || lottery === '大樂透')
  ? <i className="explore-validation-special-separator" aria-hidden="true">+</i>
  : null}
```

Keep all seven number cells and their existing order.

- [ ] **Step 6: Run validation tests and commit Task 2**

Run: `npx vitest run src/__tests__/MatrixExplorePage.test.tsx`

Expected: PASS.

```bash
git add src/FeaturePages.tsx src/__tests__/MatrixExplorePage.test.tsx
git commit -m "feat(explore): compact drag and same-period validation"
```

### Task 3: Apply scoped visual refinements

**Files:**
- Modify: `src/matrix-explore-spacing.css`
- Modify: `src/explore-result-preview.css`
- Test: `tests/matrix-explore-requested-computed-style.test.mjs`
- Test: `src/__tests__/app-production-shell.test.tsx`

**Interfaces:**
- Consumes: existing `.matrix-explore-main-screen`, `.explore-validation-*`, and `.history-pagination` selectors.
- Produces: one scoped border color variable and the requested responsive font/spacing rules.

- [ ] **Step 1: Update failing CSS and summary contracts**

Assert the duplicate number color is white; the summary text contains half-width spaces around `｜`; summary size increases by 3px; right formula padding is 3px and font is `clamp(8px, 2.2vw, 10.5px)`; prediction title/number are 18px/21px; divider gaps are 6px; and the separator uses `#d4a63b`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/matrix-explore-requested-computed-style.test.mjs
npx vitest run src/__tests__/app-production-shell.test.tsx
```

Expected: new assertions fail against current colors, sizes, spacing, and summary text.

- [ ] **Step 3: Implement scoped CSS**

Change the duplicate number selector to white. In the validation card, define one border variable and use it for the top/bottom dividers and card borders. Apply 6px top/bottom spacing, auto-height summary wrapping, `clamp(13px, calc(2.8vw + 3px), 15px)`, 3px formula padding, `clamp(8px, 2.2vw, 10.5px)`, 18px title, 21px prediction number, and `#d4a63b` for `.explore-validation-special-separator`.

Update JSX summary separators from `｜` to ` ｜ `.

- [ ] **Step 4: Run focused tests and commit Task 3**

Run:

```bash
node --test tests/matrix-explore-requested-computed-style.test.mjs
npx vitest run src/__tests__/MatrixExplorePage.test.tsx src/__tests__/app-production-shell.test.tsx
```

Expected: PASS.

```bash
git add src/FeaturePages.tsx src/matrix-explore-spacing.css src/explore-result-preview.css tests/matrix-explore-requested-computed-style.test.mjs src/__tests__/app-production-shell.test.tsx
git commit -m "style(explore): refine expanded validation layout"
```

### Task 4: Verification, concurrent-main integration, and merge

**Files:**
- Verify all changed files and the branch history.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified branch based on the latest `main`, pull request, and merged `main` commit.

- [ ] **Step 1: Run project verification**

```bash
npm ci
npm run test:unit
npm run build
node --test tests/*.test.mjs
git diff --check main...HEAD
```

Expected: targeted and project tests pass. Any pre-existing main failure must be reproduced on untouched latest `main` before it can be reported as baseline.

- [ ] **Step 2: Verify the mobile layout**

Open Matrix Explore at 390px width and confirm: 30 rows maximum, paginator reachability, summary wrapping without overlap, unchanged validation row height, readable formulas, 6+1 separator, and auto-height prediction card.

- [ ] **Step 3: Re-read live `main` and compare**

Fetch the current GitHub `main`, compare commits and changed files, and integrate newer commits without force push, reset, revert, or overwriting concurrent work. Re-run Task 4 Step 1 after integration.

- [ ] **Step 4: Review and merge**

Create a pull request, inspect its changed-file list and mergeability, run final checks, then merge with a merge commit and verify the live `main` SHA contains the feature commit.
