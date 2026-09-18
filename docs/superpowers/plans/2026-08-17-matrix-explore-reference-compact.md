# Matrix Explore Reference-Compact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Matrix Explore page below the unchanged title image match the compact density and proportions of the user-provided reference image while preserving the current structure, behavior, copy, colors, 12px page insets, and confirmed 8px spacing.

**Architecture:** Modify only the existing formal Matrix Explore sizing rules in `src/feature-pages.css`; do not add scale/zoom/translate/negative-margin/!important fixes and do not create a second override layer. Keep shared rules unchanged when they would affect other pages. Verify with targeted CSS contract tests and the project build.

**Tech Stack:** React, TypeScript, CSS, Vite, Node test runner.

## Global Constraints

- `lottery-matrix/main` is the only source.
- Logo/title image unchanged.
- Page left/right inset remains 12px.
- Confirmed 8px spacing remains unchanged.
- Function, flow, copy, colors, data, component order and bottom navigation unchanged.
- No AppDeploy deployment.
- No `scale`, `zoom`, new `translate`, negative margin, or `!important` for this work.
- Remove obsolete conflicting size locks only when directly related.

### Task 1: Compact settings and hit-condition density

**Files:**
- Modify: `src/feature-pages.css`
- Test: `tests/matrix-explore-reference-density.test.mjs`

- [ ] Add a failing contract test for the approved compact sizes.
- [ ] Reduce Explore-only panel padding to 10px and non-settings section titles to 16px/22px.
- [ ] Set settings rows to 34px controls, 30px icons, 14px labels, compact grid columns, and 6px vertical gaps.
- [ ] Set hit-condition buttons to 38px and advanced row to 38px with 28px icon.
- [ ] Set the main Explore action to 42px with 18px text and 20px icon.
- [ ] Run targeted test.

### Task 2: Compact history and result density

**Files:**
- Modify: `src/feature-pages.css`
- Test: `tests/matrix-explore-reference-density.test.mjs`

- [ ] Reduce Explore history heading to 44px and 14px title while preserving the existing responsive columns and ball layout.
- [ ] Reduce repeat/result section headings to 16px, repeat cells to 42px, and supporting text proportionally.
- [ ] Preserve existing 6+1 no-overflow rules and number-ball source sizes unless a direct Explore-only conflict is found.
- [ ] Run targeted test.

### Task 3: Verification and main sync

**Files:**
- Verify: `src/feature-pages.css`
- Verify: `tests/matrix-explore-reference-density.test.mjs`

- [ ] Run `node --test tests/matrix-explore-reference-density.test.mjs`.
- [ ] Run existing Matrix Explore/recent-history tests.
- [ ] Run `npm run build`.
- [ ] Confirm no new forbidden transform/scale/zoom/negative-margin/important rule was introduced in the changed Explore formal block.
- [ ] Commit verified changes to `main`.
