# Matrix Explore One-to-One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the approved Matrix Explore reference screenshots one-to-one on the 390px mobile baseline using one canonical scoped hard-layout source.

**Architecture:** Keep all React/data behavior unchanged and consolidate only Matrix Explore sizing/spacing into the existing `.matrix-explore-main-screen` canonical CSS block in `src/feature-pages.css`. Preserve `src/number-ball.css` as the sole NumberBall visual source and only touch it if the current history-ball spacing/size source requires a Matrix Explore-specific variable adjustment. Do not add secondary override blocks.

**Tech Stack:** React, TypeScript, CSS, Node test runner, Vite.

## Global Constraints

- Repository: `lottery-matrix`
- Branch: `main`
- Only modify Matrix Explore page layout/visual spacing.
- Page safe inline spacing remains 12px.
- One canonical Matrix Explore hard-layout source is allowed.
- No `!important`, negative margins, compensating transforms, duplicate scoped blocks, or additional media-query patches.
- Preserve functionality, copy, data flow, lottery behavior, assets, and navigation.
- No deployment for this task.

---

### Task 1: Lock the reference geometry in tests

**Files:**
- Modify: `tests/matrix-explore-reference-sizing.test.mjs`
- Test: `tests/matrix-explore-reference-sizing.test.mjs`

**Interfaces:**
- Consumes: canonical CSS in `src/feature-pages.css` and NumberBall CSS in `src/number-ball.css`.
- Produces: assertions for the approved 390px reference geometry.

- [ ] **Step 1: Write failing assertions**

Add assertions that require:
- page inline source = 12px;
- card padding = 12px;
- setting row gap = 12px;
- setting grid label columns = `106px minmax(0, 1fr)`;
- label internal columns = `34px minmax(0, 1fr)` with 8px gap;
- select 44px;
- segmented controls 40px;
- hit buttons 44px;
- advanced row 44px;
- start button 50px with 12px vertical rhythm;
- history heading 46px, header 42px, rows 46px;
- history columns 72px / 95px / flexible;
- history number gap 6px;
- repeat grid six columns, 6px gap, 54px cells;
- badges 18px high;
- no `!important`, negative margin, or compensating translate in the canonical Matrix Explore block.

- [ ] **Step 2: Run focused test and confirm RED**

Run:
```bash
node --test tests/matrix-explore-reference-sizing.test.mjs
```
Expected: FAIL on any geometry that still differs from the approved reference.

- [ ] **Step 3: Commit test-only RED state**

```bash
git add tests/matrix-explore-reference-sizing.test.mjs
git commit -m "test: lock Matrix Explore one-to-one geometry"
```

---

### Task 2: Consolidate the single canonical Matrix Explore block

**Files:**
- Modify: `src/feature-pages.css`
- Test: `tests/matrix-explore-reference-sizing.test.mjs`
- Test: `tests/matrix-explore-option-layout.test.mjs`
- Test: `tests/matrix-explore-inline-source.test.mjs`

**Interfaces:**
- Consumes: existing `.matrix-explore-main-screen` selectors and reference geometry assertions.
- Produces: one final scoped hard-layout source for Matrix Explore.

- [ ] **Step 1: Remove conflicting Matrix Explore declarations**

Within the existing Matrix Explore sections, remove duplicate/conflicting declarations that target the same main-screen selectors. Do not add a new trailing override block.

- [ ] **Step 2: Set the canonical card and section rhythm**

The canonical declarations must include:
```css
.matrix-explore-main-screen .feature-body {
  gap: 12px;
}

.matrix-explore-main-screen .explore-settings,
.matrix-explore-main-screen .hit-advanced-panel,
.matrix-explore-main-screen .history-panel,
.matrix-explore-main-screen .repeat-stats-panel,
.matrix-explore-main-screen .result-panel {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: auto;
  padding: 12px;
  border-radius: 10px;
}
```

- [ ] **Step 3: Set the setting-row geometry**

Use the approved reference geometry:
```css
.matrix-explore-main-screen .explore-settings .setting-grid {
  width: 100%;
  min-width: 0;
  margin-top: 12px;
  gap: 12px;
}

.matrix-explore-main-screen .explore-settings .setting-grid label,
.matrix-explore-main-screen .advanced-panel label {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 106px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
```

and:
```css
.matrix-explore-main-screen .explore-settings .setting-grid label > span,
.matrix-explore-main-screen .advanced-panel label > .advanced-setting-title {
  display: grid;
  min-width: 0;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 4: Set controls and badges**

Use 44px select, 40px three-way controls, 44px hit buttons, and 18px badges. Preserve current colors, borders, selected states, and text.

- [ ] **Step 5: Set advanced row and start button**

Use 44px minimum advanced row and a 50px start button with 12px gap/rhythm. Do not use negative margins or transforms.

- [ ] **Step 6: Set near-10 history geometry**

Use 46px heading minimum, 42px header, 46px data rows, `72px 95px minmax(0, 1fr)` columns, and 6px history-number gap. Preserve 5-ball and 6+1 rendering logic.

- [ ] **Step 7: Set repeat-stat and result rhythm**

Use six columns, 6px gap, 54px cell height, and 12px card/disclaimer/result spacing matching the reference screenshots.

- [ ] **Step 8: Run focused tests**

Run:
```bash
node --test tests/matrix-explore-reference-sizing.test.mjs tests/matrix-explore-option-layout.test.mjs tests/matrix-explore-inline-source.test.mjs tests/recent-history-layout.test.mjs
```
Expected: PASS.

- [ ] **Step 9: Commit canonical CSS**

```bash
git add src/feature-pages.css
git commit -m "style: match Matrix Explore reference layout"
```

---

### Task 3: Verify NumberBall source remains singular

**Files:**
- Modify only if required: `src/number-ball.css`
- Test: `tests/number-ball-style-source.test.mjs`
- Test: `tests/matrix-explore-reference-sizing.test.mjs`

**Interfaces:**
- Consumes: existing NumberBall variables.
- Produces: unchanged single NumberBall source with reference-compatible near-10 rendering.

- [ ] **Step 1: Run NumberBall source tests**

```bash
node --test tests/number-ball-style-source.test.mjs tests/number-ball-visible-size.test.mjs
```

- [ ] **Step 2: Only if the reference test still fails on ball geometry, modify the existing history usage rule**

Do not put NumberBall visual declarations in `feature-pages.css`. Keep any ball-size/underline variables in `src/number-ball.css` only.

- [ ] **Step 3: Re-run tests**

```bash
node --test tests/number-ball-style-source.test.mjs tests/number-ball-visible-size.test.mjs tests/matrix-explore-reference-sizing.test.mjs
```
Expected: PASS for all Matrix Explore-related assertions.

- [ ] **Step 4: Commit if changed**

```bash
git add src/number-ball.css
git commit -m "style: align Matrix Explore history balls"
```

---

### Task 4: Final verification and sync main

**Files:**
- No new production files.

**Interfaces:**
- Consumes: completed Matrix Explore CSS.
- Produces: verified `main` commit.

- [ ] **Step 1: Run Matrix Explore focused test suite**

```bash
node --test tests/matrix-explore-reference-sizing.test.mjs tests/matrix-explore-option-layout.test.mjs tests/matrix-explore-inline-source.test.mjs tests/recent-history-layout.test.mjs
```
Expected: PASS.

- [ ] **Step 2: Run build**

```bash
npm run build
```
Expected: exit code 0.

- [ ] **Step 3: Inspect diff**

Confirm only Matrix Explore-related CSS/tests and, if necessary, the existing NumberBall source changed. Confirm no `!important`, negative margins, compensating translate, duplicate main-screen block, or unrelated page changes were introduced.

- [ ] **Step 4: Sync to main**

Fast-forward `main` to the verified commit. Do not deploy.
