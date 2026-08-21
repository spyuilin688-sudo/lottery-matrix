# Matrix Explore Settings Visual Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the confirmed icon sizing, row spacing, control hierarchy, hit-button consistency, and responsive safeguards to Matrix Explore.

**Architecture:** Keep all production changes inside the canonical last-loaded `matrix-explore-spacing.css` stylesheet under `.matrix-explore-main-screen`. Update real computed-style tests first so the cascade, selected and unselected states, and responsive sizing are verified without introducing a second override layer.

**Tech Stack:** CSS, Node test runner, JSDOM.

**Spec:** `docs/superpowers/specs/2026-08-21-explore-settings-visual-hierarchy-design.md`

## Global Constraints

- Only modify the Matrix Explore main page styles and their tests.
- Preserve all functionality, data, copy, and interaction flow.
- Functional setting icons are exactly `28.8px`.
- Setting and advanced row gaps are exactly `7px`.
- Card borders remain `#755329`; inactive control borders must be darker, while active controls retain the current gold treatment.
- Do not add `!important`, negative margins, fixed total widths, `zoom`, or transform compensation.
- Verify responsive behavior at `360px`, `375px`, and `390px`.

---

### Task 1: Explore setting hierarchy and responsive geometry

**Files:**
- Modify: `tests/matrix-explore-requested-computed-style.test.mjs`
- Modify: `tests/matrix-explore-fluid-layout.test.mjs`
- Modify: `tests/matrix-explore-ui-refinement.test.mjs`
- Modify: `tests/matrix-explore-option-layout.test.mjs`
- Modify: `src/matrix-explore-spacing.css`

**Interfaces:**
- Consumes: existing `.matrix-explore-main-screen`, `.setting-grid`, `.advanced-panel`, `.segmented`, `.hit-options`, and `data-selected` DOM structure.
- Produces: responsive `28.8px` functional icons, `7px` row spacing, narrower label groups, explicit active/inactive control hierarchy, equal hit-condition controls, and lower advanced-title weight.

- [ ] **Step 1: Write failing computed-style tests**

  Update the JSDOM fixture to include selected and unselected option buttons and assert literal computed values for `28.8px` icons, `7px` row gaps, `88.8px` label width, active/inactive colors and borders, equal hit-button sizing and padding, and `600` advanced-row weight.

- [ ] **Step 2: Run focused tests and verify RED**

  Run: `node --test tests/matrix-explore-requested-computed-style.test.mjs tests/matrix-explore-fluid-layout.test.mjs tests/matrix-explore-ui-refinement.test.mjs tests/matrix-explore-option-layout.test.mjs`

  Expected: failure on the old `32px`, `5px`, `92px`, inactive border, and `700` advanced-row values.

- [ ] **Step 3: Apply the minimal canonical CSS change**

  Edit the existing declarations in `src/matrix-explore-spacing.css`: set icons and flex basis to `1.8rem`, row gaps to `7px`, label minimum widths to `88.8px` and `104.8px`, advanced-row weight to `600`, and add scoped select/active/inactive control presentation plus explicit equal hit-button flex, box sizing, height, and padding.

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run the Step 2 command and require all focused tests to pass.

- [ ] **Step 5: Verify build and responsive safeguards**

  Run `npx tsc --noEmit`, `npx vite build`, the Matrix Explore-related Node tests, and the full unit suite. Inspect the final CSS and diff for `!important`, negative margins, width locks, transform compensation, duplicated selectors, or unrelated changes.

- [ ] **Step 6: Commit the task**

  Stage only the five listed test/style files and these two approved implementation documents, then commit with `fix: refine explore setting hierarchy`.
