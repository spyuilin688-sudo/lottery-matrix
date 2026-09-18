# Explore Validation Column and Switcher Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjust lottery-specific validation column allocation, formula presentation, result-number scale, and hide the Matrix page-switcher frame without changing its behavior.

**Architecture:** Keep the existing three-column validation component and expose the current lottery and road type as scoped data attributes. Apply lottery-specific responsive CSS only inside validation groups, reserve intrinsic width for the Mark Six/Big Lotto special-number cluster, and remove only the decorative switcher frame layers.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner, Vitest, Vite.

**Spec:** User-confirmed requirements in the 2026-09-02 conversation.

## Global Constraints

- Only Matrix Explore validation groups and the shared Explore/Tianyan/Tiangong title switcher may change.
- Mobile responsiveness must remain fluid; no viewport-specific fixed layout replacement.
- Mark Six and Big Lotto right columns shrink and their middle columns grow.
- Fantasy 5 and Daily Cash middle columns shrink and their right columns grow.
- The Mark Six and Big Lotto main-number ` +` special-number cluster must not overlap.
- The third-row result number remains bold, keeps one half-width space inside each bracket, and becomes smaller.
- Drag-road independent second-row formula presentation matches the first right-column row.
- Formula text renders as `第4顆 28 合值32 = 04` or `第4顆 28 +11 = 39`.
- Explore, Tianyan, and Tiangong page-switcher behavior and touch target remain unchanged while its frame is hidden.

---

### Task 1: Add regression contracts

**Files:**
- Modify: `tests/matrix-explore-validation-preview-merge.test.mjs`
- Modify: `tests/shared-title-control-alignment.test.mjs`

**Interfaces:**
- Consumes: Existing source-text CSS and JSX contract tests.
- Produces: Failing assertions for lottery-specific widths, special-number track reservation, formula spaces, drag second-row parity, smaller result number, and hidden switcher frame.

- [x] **Step 1: Write failing assertions**

Add assertions requiring `data-lottery`, `data-road-type`, responsive width tokens, a `repeat(6, minmax(0, 1fr)) max-content` wide-number grid, `.85em` result text, formula templates with a space after `顆`, drag-row parity, and hidden switcher pseudo-elements.

- [x] **Step 2: Run tests and verify they fail**

Run: `node --test tests/matrix-explore-validation-preview-merge.test.mjs tests/shared-title-control-alignment.test.mjs`

Expected: FAIL because the new contracts are not implemented.

### Task 2: Implement scoped validation layout and formula changes

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/explore-result-preview.css`

**Interfaces:**
- Consumes: `lottery`, `item.algorithmType`, validation rows, and existing formula display values.
- Produces: `data-lottery`, `data-road-type`, spaced formula text, responsive per-lottery column allocation, intrinsic special-number reservation, and smaller result numbers.

- [x] **Step 1: Expose the scoped state**

Add `data-lottery={lottery}` and `data-road-type={item.algorithmType}` to production validation groups without changing data flow.

- [x] **Step 2: Normalize formula templates**

Change each production formula template from `第${position}顆${number}` to `第${position}顆 ${number}` while retaining the existing road display and result mapping.

- [x] **Step 3: Add responsive lottery-specific grid rules**

Use `clamp(88px, 27vw, 108px)` for Mark Six/Big Lotto right columns and `clamp(100px, 32vw, 128px)` for Fantasy 5/Daily Cash right columns. For wide-number rows, replace implicit equal tracks with `repeat(6, minmax(0, 1fr)) max-content` so the half-width-space-plus-special-number cluster owns its full width.

- [x] **Step 4: Match drag second-row formula presentation and shrink result text**

Apply the first-row alignment, padding, inherited size, line-height, and gold text color to the drag road's second right-column row. Change `.explore-validation-result-number` from `.92em` to `.85em` and retain its weight and bracket spacing.

- [x] **Step 5: Run focused tests**

Run: `node --test tests/matrix-explore-validation-preview-merge.test.mjs`

Expected: PASS.

### Task 3: Hide the shared Matrix switcher frame

**Files:**
- Modify: `src/matrix-explore-spacing.css`
- Test: `tests/shared-title-control-alignment.test.mjs`

**Interfaces:**
- Consumes: Existing `.matrix-page-switcher` button and decorative pseudo-elements.
- Produces: Frame-free icon rendering with unchanged dimensions, scroll snapping, click behavior, and touch area.

- [x] **Step 1: Remove only frame paint**

Set the scoped switcher button border to zero and hide its `::before` and `::after` decorative layers. Preserve the button box, image, overflow, scrolling, and event behavior.

- [x] **Step 2: Run focused tests**

Run: `node --test tests/shared-title-control-alignment.test.mjs`

Expected: PASS.

### Task 4: Verify, integrate, and publish

**Files:**
- Verify all modified source and test files.

**Interfaces:**
- Consumes: Completed scoped UI changes.
- Produces: Tested main-branch commit without overwriting concurrent work.

- [x] **Step 1: Run the relevant regression suite**

Run: `node --test tests/matrix-explore-validation-preview-merge.test.mjs tests/shared-title-control-alignment.test.mjs tests/ui-request-20260828-final-regression.test.mjs`

Expected: PASS.

- [x] **Step 2: Run build verification**

Run: `npm run build`

Expected: PASS.

- [x] **Step 3: Re-fetch and inspect conflicts**

Run: `git fetch origin main && git rev-list --left-right --count main...origin/main && git diff --check`

Expected: no unintegrated remote commits and no whitespace errors; if the remote moved, compare overlapping files before rebasing.

- [x] **Step 4: Commit and push without force**

Commit only the plan, tests, and three scoped source files, then update `main` using a non-force push.
