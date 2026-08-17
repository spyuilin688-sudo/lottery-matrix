# Matrix Explore Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder and proportion the existing Matrix 探索 page to match the user-provided mobile reference while preserving all existing behavior, copy, data logic, and other pages.

**Architecture:** Keep the existing `MatrixExplorePage` component and its current data/interaction state. Verify the desired section order in `src/FeaturePages.tsx`, then consolidate only the scoped `.matrix-explore-main-screen` layout rules in `src/feature-pages.css`; remove only conflicting/obsolete Explore-specific rules instead of appending another override layer.

**Tech Stack:** React, TypeScript, Vite, CSS, Node test runner.

## Global Constraints

- Repository: `lottery-matrix`, branch: `main`.
- `lottery-matrix/main` is the only formal source.
- Mobile left/right page padding remains exactly `12px`.
- Section internal padding and section-to-section gap use the already-confirmed `8px` Matrix Explore layout baseline where applicable.
- Do not change feature logic, data sources, algorithms, copy, navigation, brand header, or bottom navigation.
- Do not add `!important`, negative compensation offsets, duplicate media queries, or a second override layer.
- Only remove rules that conflict with or are obsolete for this Matrix Explore adjustment.

---

### Task 1: Lock the Matrix Explore section order

**Files:**
- Modify only if needed: `src/FeaturePages.tsx`
- Test: `tests/matrix-explore-layout-order.test.mjs`

**Interfaces:**
- Consumes: existing `MatrixExplorePage` JSX and existing state/handlers.
- Produces: the same component API and behavior, with the rendered main-page order `探索設定 → 命中條件/進階探索設定 → 開始探索 → 近10期開獎號碼 → 重複號碼統計 → 免責文字 → 探索結果區`.

- [ ] **Step 1: Write the failing structural test**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');

test('Matrix Explore keeps the approved section order', () => {
  const start = source.indexOf('export function MatrixExplorePage');
  const end = source.indexOf('export function MatrixTiangongPage');
  const block = source.slice(start, end > start ? end : undefined);
  const markers = [
    '探索設定',
    '命中條件',
    'branded-explore-action',
    '近10期開獎號碼',
    'repeat-stats-panel',
    'explore-result-disclaimer',
    'result-panel',
  ];
  const positions = markers.map((marker) => block.indexOf(marker));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});
```

- [ ] **Step 2: Run the structural test**

Run: `node --test tests/matrix-explore-layout-order.test.mjs`
Expected: PASS if the current JSX already matches the approved B ordering; otherwise FAIL and identify the misplaced section.

- [ ] **Step 3: Reorder only existing JSX blocks if the test fails**

Move existing blocks intact. Do not rename labels, add controls, alter handlers, or change conditional rendering.

- [ ] **Step 4: Re-run the structural test**

Run: `node --test tests/matrix-explore-layout-order.test.mjs`
Expected: PASS.

---

### Task 2: Consolidate Matrix Explore proportions and spacing

**Files:**
- Modify: `src/feature-pages.css`
- Test: `tests/matrix-explore-layout-style.test.mjs`

**Interfaces:**
- Consumes: existing `.matrix-explore-main-screen` DOM structure and existing global design tokens.
- Produces: a single effective Explore-specific layout source with 12px page edges, compact reference-like cards, balanced field/control proportions, compact history table, 6-column repeat-stat grid, and unchanged interaction semantics.

- [ ] **Step 1: Write the CSS guard test**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const start = css.indexOf('/* Matrix Explore formal layout rules */');
const end = css.indexOf('/* v55 scoped density and hierarchy refinements */');
const block = css.slice(start, end > start ? end : undefined);

test('Matrix Explore formal rules use the approved compact layout without compensation overrides', () => {
  assert.match(block, /\.matrix-explore-main-screen[^\{]*\.repeat-number-grid\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/s);
  assert.doesNotMatch(block, /!important/);
  assert.doesNotMatch(block, /translate[XY]?\([^)]*-\d/);
  assert.doesNotMatch(block, /margin-(?:top|right|bottom|left):\s*-\d/);
});
```

- [ ] **Step 2: Run the CSS guard test**

Run: `node --test tests/matrix-explore-layout-style.test.mjs`
Expected: FAIL until the formal Explore rules are consolidated to the approved layout.

- [ ] **Step 3: Modify the existing formal Explore rules in place**

Adjust only existing `.matrix-explore-main-screen` rules controlling: card padding/gaps, setting-grid column proportions, segmented/select/action heights, history-table density and column sizing, repeat-stat 6-column grid, disclaimer spacing, and result-card proportions. Preserve all necessary responsive constraints and existing visual assets.

- [ ] **Step 4: Remove only conflicting Explore-specific stale rules**

Within the formal Explore scope, delete duplicate declarations, obsolete selectors, and compensation rules that conflict with the new single source. Do not touch unrelated page selectors.

- [ ] **Step 5: Re-run the CSS guard test**

Run: `node --test tests/matrix-explore-layout-style.test.mjs`
Expected: PASS.

---

### Task 3: Verify, sync, deploy, and inspect

**Files:**
- Verify: `src/FeaturePages.tsx`
- Verify: `src/feature-pages.css`
- Verify: `tests/matrix-explore-layout-order.test.mjs`
- Verify: `tests/matrix-explore-layout-style.test.mjs`

**Interfaces:**
- Consumes: completed tasks 1–2.
- Produces: tested `main`, updated formal deployment, and an inspected public preview.

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/matrix-explore-layout-order.test.mjs tests/matrix-explore-layout-style.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run existing project verification**

Run the repository's existing test/typecheck/build commands from `package.json` without changing project logic.
Expected: PASS.

- [ ] **Step 3: Review the diff for scope**

Confirm no unrelated page, logic, copy, data source, navigation, brand, or bottom-navigation changes; confirm no new `!important`, duplicate override block, negative compensation, or conflicting Explore rule.

- [ ] **Step 4: Commit to `main`**

Commit message: `style: align Matrix Explore layout with approved reference`.

- [ ] **Step 5: Update the formal AppDeploy build to the new `main` commit and deploy**

Use the existing formal deployment app, not a new independent product version.

- [ ] **Step 6: Inspect the deployed 390px mobile page**

Confirm 12px side padding; correct section order; no text/control/ball/card collisions; no clipping/stretching/abnormal whitespace; history and result tables remain readable; bottom navigation does not cover content.
