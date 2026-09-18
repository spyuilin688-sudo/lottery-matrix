# Explore Responsive Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the confirmed Matrix Explore responsive sizing, spacing, collapse-title, lottery-ball, and road-summary specifications to branch `探索`.

**Architecture:** Keep the changes scoped beneath `.matrix-explore-main-screen` except for the reusable validation-summary markup and styles. Extend `HistoryList` with a display-only order-text flag so Matrix Explore can hide order information without changing TongXing behavior. Represent summary numbers as semantic spans so each confirmed color can be applied independently.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Node test runner with JSDOM.

**Spec:** User-confirmed requirements in the current conversation.

## Global Constraints

- Modify branch `探索` only.
- Preserve all unspecified sizes, spacing, behavior, and page flows.
- Use responsive values exactly where the user requested a range.
- Verify supported mobile widths 360px, 375px, and 390px do not overflow.
- Do not deploy or merge to `main`.

---

### Task 1: Recent-history title and lottery geometry

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/matrix-explore-spacing.css`
- Modify: `src/number-ball.css`
- Test: `src/__tests__/MatrixExplorePage.test.tsx`
- Test: `tests/recent-history-computed-style.test.mjs`

**Interfaces:**
- Consumes: existing `HistoryList` collapse state and lottery `data-lottery` attributes.
- Produces: `showOrderText?: boolean`, title collapse control, per-lottery row and ball geometry.

- [ ] **Step 1: Write failing component and computed-style tests**
- [ ] **Step 2: Run the focused tests and verify the confirmed title, row, font, underline, and alignment assertions fail**
- [ ] **Step 3: Add the optional order display flag and scoped responsive CSS**
- [ ] **Step 4: Run the focused tests and verify they pass**
- [ ] **Step 5: Commit the self-contained recent-history change**

### Task 2: Repeated statistics and section spacing

**Files:**
- Modify: `src/matrix-explore-spacing.css`
- Test: `tests/matrix-explore-requested-computed-style.test.mjs`

**Interfaces:**
- Consumes: existing `.feature-body`, `.repeat-stats-panel`, and `.result-summary` structure.
- Produces: both 12px adjacent section gaps, 6px bottom padding, and 14px inherited statistic numbers.

- [ ] **Step 1: Write failing computed-style assertions**
- [ ] **Step 2: Run the focused test and verify it fails on the old values**
- [ ] **Step 3: Apply the minimal scoped spacing and typography rules**
- [ ] **Step 4: Run the focused test and verify it passes**
- [ ] **Step 5: Commit the self-contained statistics change**

### Task 3: Road toggle and validation summary

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/matrix-explore-spacing.css`
- Modify: `src/feature-pages.css`
- Test: `src/__tests__/MatrixExplorePage.test.tsx`
- Test: `tests/matrix-explore-requested-computed-style.test.mjs`

**Interfaces:**
- Consumes: existing expanded-road state and `RoadValidationProcess` inputs.
- Produces: 3px toggle right spacing, 4px summary padding, 10px text, border-mounted consecutive label, and semantic number color classes.

- [ ] **Step 1: Write failing component and computed-style assertions for the summary content and layout**
- [ ] **Step 2: Run focused tests and verify they fail for missing markup and old styles**
- [ ] **Step 3: Add semantic numeric spans and minimal scoped styles**
- [ ] **Step 4: Run focused tests and verify they pass**
- [ ] **Step 5: Commit the self-contained summary change**

### Task 4: Responsive and regression verification

**Files:**
- Modify only if a confirmed regression requires correction.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified branch commit ready for GitHub.

- [ ] **Step 1: Run focused Node and Vitest suites**
- [ ] **Step 2: Run the full unit suite and production build**
- [ ] **Step 3: Check 360px, 375px, and 390px computed geometry for horizontal overflow**
- [ ] **Step 4: Inspect the final diff for global overrides, forced widths, and unrelated changes**
- [ ] **Step 5: Push detached HEAD to `探索` and verify the remote commit**
