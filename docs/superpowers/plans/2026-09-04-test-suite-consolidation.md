# Test Suite Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant CI execution, audit every file under `tests/`, consolidate fragmented tests by feature domain, remove obsolete/duplicate assertions without weakening regression coverage, then prove the final tree with Full Node, Vitest, Playwright, and production build.

**Architecture:** Keep the existing test layers (Node source/contract tests, Vitest component/unit tests, Playwright browser/runtime tests) and consolidate only within a layer when tests protect the same feature-domain contract. Preserve algorithm, security, migration, runtime-integrity, and browser-only regression boundaries even when their assertion syntax looks similar. Make the audit report the traceability source for every KEEP/MERGE/DELETE decision.

**Tech Stack:** Node.js 22 `node:test`, Vitest 4, Playwright 1.61, TypeScript 7, Vite 8, GitHub Actions YAML.

**Spec:** `docs/superpowers/specs/2026-09-04-test-suite-consolidation-design.md`

## Global Constraints

- Start execution from the then-current `main`; if `main` moved after this plan was written, rebase the work branch by creating a fresh branch/worktree rather than force-pushing or resetting shared history.
- Production source, production CSS, Supabase schema/migration contents, Matrix API algorithms, Admin features, and deployment settings are out of scope unless a test audit exposes a real defect; such defects are recorded separately rather than silently fixed to make tests green.
- Never delete a failing test merely because it fails. First classify it as real regression, obsolete specification, duplicate assertion, or test/fixture/environment defect.
- `matrix-explore-formula-core-regression-20260904.test.mjs`, security/RPC tests, migration contract tests, runtime-integrity tests, and browser-only interaction/responsive tests are protected regression boundaries.
- Do not reintroduce fixed width/height locks, `!important`, fixed canvas widths, fixed `flex-basis`, or obsolete pixel contracts merely to satisfy old UI assertions.
- Final verification must run on the exact final commit/tree: Full Node, Full Vitest, Playwright, production build, `git diff --check`, and the CI workflow contract.

---

## File Structure

### Files created

- `docs/testing/test-suite-audit-20260904.md` — complete inventory and decision log for every `tests/` entry.
- `tests/bottom-navigation-contract.test.mjs` — canonical Node contract for bottom navigation source/layout/interaction invariants that do not require a browser.
- `tests/homepage-contract.test.mjs` — canonical Node contract for current homepage layout/spacing/responsive-source invariants.
- `tests/history-contract.test.mjs` — canonical Node contract for draw/recent-history layout, filters, grouping, and current responsive-source invariants.
- `tests/matrix-explore-ui-contract.test.mjs` — canonical Node contract for current Matrix Explore UI/responsive/source invariants; formula core and migration contracts remain separate.
- `tests/notification-contract.test.mjs` — canonical Node contract for notification UI/layout/source invariants.
- `tests/number-reference-contract.test.mjs` — canonical Node contract for number-reference list, special-number, sticky/title action invariants.
- `tests/subscription-contract.test.mjs` — canonical Node contract for current subscription copy/assets/carousel/plan UI invariants.

### Files modified

- `.github/workflows/ci.yml` — remove the redundant `Targeted Explore tests` step and make the one Full Node step explicit before build.
- `tests/ci-workflow-coverage.test.mjs` — lock the deduplicated CI contract.
- Existing feature-domain test files only when their still-valid assertions need to be migrated before the old file is deleted.
- `docs/testing/test-suite-audit-20260904.md` throughout execution as the source of truth.

### Files intentionally kept separate unless the audit proves exact duplication

- `tests/matrix-explore-formula-core-regression-20260904.test.mjs`
- `tests/explore-v11-forward-migration.test.mjs`
- `tests/explore-v12-forward-migration.test.mjs`
- `tests/explore-v12-cleanup-migration.test.mjs`
- `tests/matrix-explore-v11-draw-order.test.mjs`
- `tests/matrix-latest-run-draw-order.test.mjs`
- `tests/matrix-analysis-run-lease-migration.test.mjs`
- `tests/manual-bank-transfer-rpc-security.test.mjs`
- `tests/supabase-rpc-security.test.mjs`
- `tests/mobile-push-notification-migration.test.mjs`
- `tests/repair-pg-catalog-greatest.test.mjs`
- `tests/runtime-integrity-atomic-commit.test.mjs`
- `tests/runtime-integrity-scope.test.mjs`
- Playwright `*.spec.ts` files whose browser/computed-layout/interaction coverage cannot be reproduced by Node source assertions.

---

### Task 1: Establish baseline and build the complete test inventory

**Files:**
- Create: `docs/testing/test-suite-audit-20260904.md`
- Read: `tests/**`
- Read: `src/__tests__/**`
- Read: `.github/workflows/ci.yml`
- Read: `package.json`

**Interfaces:**
- Consumes: repository state from latest `main`, the approved design spec.
- Produces: an audit table with one row for every tracked entry under `tests/`, including classification and canonical replacement path where applicable. All later consolidation tasks consume this report.

- [ ] **Step 1: Create an isolated execution worktree/branch from latest main**

Run:

```bash
git fetch origin main
git worktree add ../lottery-matrix-test-consolidation -b chore/test-suite-consolidation-impl origin/main
cd ../lottery-matrix-test-consolidation
```

Expected: clean worktree on a new branch; `git status --short` prints nothing.

- [ ] **Step 2: Capture the exact tracked inventory and group it by test layer**

Run:

```bash
git ls-files 'tests/**' | sort > /tmp/tests-inventory.txt
git ls-files 'tests/**/*.test.mjs' 'tests/*.test.mjs' | sort > /tmp/node-tests.txt
git ls-files 'tests/**/*.spec.ts' 'tests/*.spec.ts' | sort > /tmp/playwright-tests.txt
git ls-files 'src/__tests__/**' | sort > /tmp/vitest-tests.txt
wc -l /tmp/tests-inventory.txt /tmp/node-tests.txt /tmp/playwright-tests.txt /tmp/vitest-tests.txt
```

Expected: every tracked `tests/` path appears exactly once in `/tmp/tests-inventory.txt`.

- [ ] **Step 3: Record the pre-change baseline before classifying failures**

Run in this order and save complete output:

```bash
npm ci
node --test tests/*.test.mjs 2>&1 | tee /tmp/baseline-node.log
npm run test:unit 2>&1 | tee /tmp/baseline-vitest.log
PLAYWRIGHT_BROWSERS_PATH=.sites-runtime/playwright npx playwright install --with-deps chromium
npm run test:runtime 2>&1 | tee /tmp/baseline-playwright.log
npm run build 2>&1 | tee /tmp/baseline-build.log
```

Expected: all baseline failures, if any, are recorded verbatim. Do not change tests yet.

- [ ] **Step 4: Detect exact duplicate assertion/source-contract lines as candidates, not automatic deletions**

Run:

```bash
python - <<'PY'
from pathlib import Path
from collections import defaultdict

needles = ('assert.match(', 'assert.doesNotMatch(', 'assert.equal(', 'assert.strictEqual(', 'assert.ok(')
seen = defaultdict(list)
for path in sorted(Path('tests').glob('*.test.mjs')):
    for lineno, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        line = ' '.join(raw.strip().split())
        if any(n in line for n in needles):
            seen[line].append(f'{path}:{lineno}')
for assertion, locations in sorted(seen.items()):
    if len(locations) > 1:
        print(assertion)
        for location in locations:
            print('  ', location)
PY
```

Expected: output is only a candidate list. Semantic duplicates still require production target + failure-mode comparison.

- [ ] **Step 5: Write the audit report skeleton and one row for every `tests/` path**

The report must begin with:

```markdown
# Test Suite Audit — 2026-09-04

| Path | Layer | Domain | Production target / invariant | Current spec? | Duplicate? | Decision | Canonical replacement | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

Use only these `Decision` values: `KEEP`, `MERGE`, `DELETE_DUPLICATE`, `DELETE_OBSOLETE`, `FIX_TEST_ENVIRONMENT`.

For helpers/fixtures/docs, use `KEEP` or `MERGE`; never call them obsolete only because they are not executable tests.

- [ ] **Step 6: Classify every baseline failure before any deletion**

For each failing test in `/tmp/baseline-node.log`, record one of:

```text
REAL_REGRESSION
OBSOLETE_SPEC
DUPLICATE_ASSERTION
TEST_FIXTURE_OR_ENVIRONMENT
```

Evidence order is mandatory: latest user-approved spec -> merged regression contract -> `UX-CONTRACT.md` -> current main behavior -> Git/PR history.

- [ ] **Step 7: Verify inventory completeness**

Run:

```bash
python - <<'PY'
from pathlib import Path
tracked = [line.strip() for line in Path('/tmp/tests-inventory.txt').read_text().splitlines() if line.strip()]
report = Path('docs/testing/test-suite-audit-20260904.md').read_text(encoding='utf-8')
missing = [p for p in tracked if f'`{p}`' not in report]
assert not missing, 'Missing audit rows: ' + ', '.join(missing)
print(f'audited {len(tracked)} tracked tests/ entries')
PY
```

Expected: PASS and a nonzero audited count.

- [ ] **Step 8: Commit the inventory before changing tests**

```bash
git add docs/testing/test-suite-audit-20260904.md
git commit -m "test: inventory current test suite"
```

---

### Task 2: Remove the duplicate Targeted Explore CI execution with a regression contract

**Files:**
- Modify: `tests/ci-workflow-coverage.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: current Project CI structure.
- Produces: exactly one `node --test tests/*.test.mjs` execution in `test-and-build`, no `Targeted Explore tests` step, while retaining Vitest, build, Playwright runtime, Admin, runtime-integrity, and Matrix API jobs.

- [ ] **Step 1: Add the failing CI deduplication test first**

Append to `tests/ci-workflow-coverage.test.mjs`:

```js
test('Project CI runs the root Node suite once without a targeted Explore duplicate', () => {
  const testAndBuild = job('test-and-build');
  const fullNodeRuns = testAndBuild.match(/run:\s+node --test tests\/\*\.test\.mjs/g) ?? [];

  assert.equal(fullNodeRuns.length, 1);
  assert.doesNotMatch(testAndBuild, /Targeted Explore tests/);
  assert.doesNotMatch(
    testAndBuild,
    /node --test[^\n]*matrix-explore-fluid-layout\.test\.mjs[^\n]*matrix-explore-option-layout\.test\.mjs[^\n]*recent-history-layout\.test\.mjs/,
  );
});
```

- [ ] **Step 2: Run the new contract and verify RED**

Run:

```bash
node --test tests/ci-workflow-coverage.test.mjs
```

Expected: FAIL because `Targeted Explore tests` is still present.

- [ ] **Step 3: Remove only the redundant workflow step and normalize order**

Change `test-and-build` to this sequence:

```yaml
      - name: Full Vitest suite
        run: npm run test:unit

      - name: Full Node tests
        run: node --test tests/*.test.mjs

      - name: Production build for packaging tests
        run: npm run build
```

Delete the entire previous block:

```yaml
      - name: Targeted Explore tests
        run: node --test tests/matrix-explore-fluid-layout.test.mjs tests/matrix-explore-option-layout.test.mjs tests/recent-history-layout.test.mjs
```

- [ ] **Step 4: Run the CI contract and verify GREEN**

```bash
node --test tests/ci-workflow-coverage.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Update the audit report**

Record the removed CI duplicate and explicitly state that no test file was removed by this task.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml tests/ci-workflow-coverage.test.mjs docs/testing/test-suite-audit-20260904.md
git commit -m "ci: remove duplicate targeted explore test run"
```

---

### Task 3: Consolidate Matrix Explore Node UI contracts without weakening #259/#284 regressions

**Files:**
- Create: `tests/matrix-explore-ui-contract.test.mjs`
- Keep: `tests/matrix-explore-formula-core-regression-20260904.test.mjs`
- Keep unless exact audit evidence proves otherwise: `tests/matrix-explore-result-refinement-20260904.test.mjs`
- Review/Merge/Delete as classified: 
  - `tests/matrix-explore-accessibility-refinement.test.mjs`
  - `tests/matrix-explore-filter-hit-area.test.mjs`
  - `tests/matrix-explore-fluid-layout.test.mjs`
  - `tests/matrix-explore-inline-source.test.mjs`
  - `tests/matrix-explore-lower-density.test.mjs`
  - `tests/matrix-explore-option-layout.test.mjs`
  - `tests/matrix-explore-reference-proportions.test.mjs`
  - `tests/matrix-explore-reference-two-layout.test.mjs`
  - `tests/matrix-explore-requested-computed-style.test.mjs`
  - `tests/matrix-explore-special-number-flex-basis.test.mjs`
  - `tests/matrix-explore-tag-and-period-size.test.mjs`
  - `tests/matrix-explore-ui-refinement.test.mjs`
  - `tests/matrix-explore-validation-preview-merge.test.mjs`
- Keep: `tests/matrix-explore-settings-responsive.spec.ts`
- Keep migration/data-order contracts separate.

**Interfaces:**
- Consumes: audit classifications and current production selectors/JSX.
- Produces: one canonical Node UI contract plus protected standalone formula/migration/browser contracts.

- [ ] **Step 1: Build an assertion map before moving anything**

For every candidate file, add an audit subsection with:

```markdown
### Matrix Explore assertion map
- `<file>` -> `<selector/function/data contract>` -> `<expected invariant>` -> `<KEEP/MOVE/DELETE reason>`
```

A file cannot be deleted until every valid row points either to `matrix-explore-ui-contract.test.mjs` or to a protected standalone test.

- [ ] **Step 2: Start the canonical file with shared source readers only**

Use direct source reads rather than copying helper implementations from multiple files:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const featurePages = readFileSync('src/FeaturePages.tsx', 'utf8');
const spacingCss = readFileSync('src/matrix-explore-spacing.css', 'utf8');
const previewCss = readFileSync('src/explore-result-preview.css', 'utf8');
```

Add only assertions marked `MOVE` in the audit report.

- [ ] **Step 3: Preserve the approved special-number and responsive invariants in the canonical UI contract**

The canonical file must protect at least these current invariants, either directly or by reference to a protected standalone test:

```js
assert.match(spacingCss, /padding-block:\s*0\.3px/);
assert.match(spacingCss, /padding-inline:\s*0\.7px/);
assert.match(spacingCss, /border-width:\s*0\.7px/);
assert.match(spacingCss, /explore-validation-special-number[^}]*>[^{]*\.explore-validation-number[^{]*\{[^}]*flex-basis:\s*auto/s);
```

Do not reintroduce older 0.5px state-frame expectations or fixed special-number flex basis.

- [ ] **Step 4: Preserve formula semantics exclusively in the formula-core regression**

`tests/matrix-explore-formula-core-regression-20260904.test.mjs` remains the authority for:

```text
lotteryMaximum + normalizeFormulaNumber
formulaResultNumber
formulaRules value + algorithmType exact resolution
drag-road reverse ordering
RHS = computed formula result, not hitNumbers/predictionNumbers
```

If another Explore test repeats only those exact invariants, delete that duplicate assertion from the UI test instead of duplicating formula-core coverage.

- [ ] **Step 5: Replace obsolete UI assertions only when the audit has evidence**

Examples of forbidden carry-over into the canonical test:

```text
old 0.5px validation frames
fixed width/height that conflict with current fluid/clamp behavior
fixed special-number flex basis
hitNumbers/predictionNumbers as formula RHS
```

An obsolete assertion is deleted; its file is deleted only after all other valid assertions have moved.

- [ ] **Step 6: Run Explore Node contracts after each migration batch**

Run:

```bash
node --test \
  tests/matrix-explore-ui-contract.test.mjs \
  tests/matrix-explore-formula-core-regression-20260904.test.mjs \
  tests/matrix-explore-result-refinement-20260904.test.mjs
```

Expected: PASS after each batch.

- [ ] **Step 7: Run the Explore Playwright spec**

```bash
PLAYWRIGHT_BROWSERS_PATH=.sites-runtime/playwright npx playwright test tests/matrix-explore-settings-responsive.spec.ts
```

Expected: PASS; Node consolidation must not replace browser-only responsive validation.

- [ ] **Step 8: Delete only candidate files whose audit rows are fully covered**

Before each deletion, run:

```bash
git grep -n '<unique invariant or selector from old file>' -- tests/matrix-explore-*.test.mjs
```

Expected: the invariant exists in the canonical or protected test, or is explicitly marked `DELETE_OBSOLETE`/`DELETE_DUPLICATE` with evidence.

- [ ] **Step 9: Commit Matrix Explore consolidation**

```bash
git add tests docs/testing/test-suite-audit-20260904.md
git commit -m "test: consolidate matrix explore contracts"
```

---

### Task 4: Consolidate Bottom Navigation Node contracts while preserving browser behavior

**Files:**
- Create: `tests/bottom-navigation-contract.test.mjs`
- Merge/Delete as classified:
  - `tests/bottom-navigation-cleanup.test.mjs`
  - `tests/bottom-navigation-double-tap.test.mjs`
  - `tests/bottom-navigation-height.test.mjs`
  - `tests/bottom-navigation-safe-area-position.test.mjs`
  - `tests/bottom-navigation.test.mjs`
- Keep: `tests/bottom-navigation.spec.ts`

**Interfaces:**
- Consumes: Bottom Navigation audit assertion map.
- Produces: one Node source/layout contract and one Playwright browser contract.

- [ ] **Step 1: Map each old assertion to behavior, source-layout, or browser-only coverage**

Use these buckets in the audit report:

```text
NODE_SOURCE_CONTRACT
BROWSER_INTERACTION
BROWSER_SAFE_AREA_COMPUTED_LAYOUT
OBSOLETE_OR_DUPLICATE
```

Double-tap/long-press behavior stays in Node only if it validates source wiring not already exercised by Playwright; actual timing/gesture behavior stays in Playwright.

- [ ] **Step 2: Create the canonical Node contract**

Start with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync('src/App.tsx', 'utf8');
const styles = readFileSync('src/App.css', 'utf8');
```

If actual ownership is in another current source file, read that exact file instead and record it in the audit. Do not duplicate Playwright computed-layout assertions.

- [ ] **Step 3: Migrate valid Node assertions and delete exact duplicates**

For each moved assertion, run the canonical file immediately:

```bash
node --test tests/bottom-navigation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run the browser spec before deleting old Node files**

```bash
PLAYWRIGHT_BROWSERS_PATH=.sites-runtime/playwright npx playwright test tests/bottom-navigation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Delete fully covered old Node files and commit**

```bash
git add tests docs/testing/test-suite-audit-20260904.md
git commit -m "test: consolidate bottom navigation contracts"
```

---

### Task 5: Consolidate Homepage Node contracts around the current responsive specification

**Files:**
- Create: `tests/homepage-contract.test.mjs`
- Review/Merge/Delete as classified:
  - `tests/home-layout-contract.test.mjs`
  - `tests/home-lottery-cards.test.mjs`
  - `tests/home-lottery-frame-and-matrix-spacing.test.mjs`
  - `tests/home-navigation-and-back-button.test.mjs`
  - `tests/home-nextdraw-spacing.test.mjs`
  - `tests/home-octagon-hidden-scrollbar.test.mjs`
  - `tests/home-reference-quick-settings-contract.test.mjs`
  - `tests/home-shortcut-canonical-ownership.test.mjs`
  - `tests/home-switcher-status-frame-final.test.mjs`
  - `tests/home-tongxing-bounded.test.mjs`
  - `tests/homepage-approved-optimization.test.mjs`
  - `tests/homepage-card-fit.test.mjs`
  - `tests/homepage-core-symbol-frame-polish.test.mjs`
  - `tests/homepage-density-and-guide-native-scroll.test.mjs`
  - `tests/homepage-feature-visible-gap.test.mjs`
  - `tests/homepage-followup-layout.test.mjs`
  - `tests/homepage-independent-insets-and-guide-scroll.test.mjs`
  - `tests/homepage-layout-request.test.mjs`
  - `tests/homepage-logo-layout.test.mjs`
  - `tests/homepage-lottery-switcher-selected.test.mjs`
  - `tests/homepage-responsive-features-nav-gap.test.mjs`
  - `tests/homepage-status-layout.test.mjs`
  - `tests/homepage-visual-language.test.mjs`
  - `tests/latest-draw-card-layout.test.mjs`
  - `tests/matrix-loop-reference-home-spacing.test.mjs`

**Interfaces:**
- Consumes: latest homepage responsive/UI contract and audit classification.
- Produces: one current Node homepage contract with obsolete fixed-layout assertions removed.

- [ ] **Step 1: Mark each homepage assertion as invariant vs historical implementation detail**

Keep assertions for user-visible invariants such as component ownership, intended spacing relationships, responsive `clamp`/fluid behavior, correct switcher/status structure, hidden-scrollbar semantics, and latest-draw content structure.

Delete or rewrite only when the audit proves an assertion locks an obsolete implementation detail such as a superseded one-off pixel override or fixed width/height.

- [ ] **Step 2: Create a single source reader per production file**

Canonical pattern:

```js
const sources = {
  app: readFileSync('src/App.tsx', 'utf8'),
  featurePages: readFileSync('src/FeaturePages.tsx', 'utf8'),
  css: readFileSync('src/App.css', 'utf8'),
};
```

Only include files actually used by migrated assertions.

- [ ] **Step 3: Migrate by subsection, not by historical PR name**

Use test names beginning with these stable behavior groups:

```text
homepage: latest draw
homepage: lottery switcher
homepage: Matrix status/core
homepage: five feature cards
homepage: shortcuts/navigation
homepage: responsive sizing and scroll
```

Do not retain historical labels such as `requested`, `followup`, or dates when the invariant has a stable domain name.

- [ ] **Step 4: Run canonical homepage test after every subsection**

```bash
node --test tests/homepage-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Delete fully covered old homepage files and commit**

```bash
git add tests docs/testing/test-suite-audit-20260904.md
git commit -m "test: consolidate homepage contracts"
```

---

### Task 6: Consolidate History Node contracts and split mixed History/Explore assertions cleanly

**Files:**
- Create: `tests/history-contract.test.mjs`
- Review/Merge/Delete as classified:
  - `tests/draw-history-table-layout.test.mjs`
  - `tests/draw-history-week-cards-structure.test.mjs`
  - `tests/history-filter-select-layering.test.mjs`
  - `tests/history-floating-spacing.test.mjs`
  - `tests/history-reset-height.test.mjs`
  - `tests/history-week-groups.test.mjs`
  - `tests/marksix-history-ball-size.test.mjs`
  - `tests/recent-history-computed-style.test.mjs`
  - `tests/recent-history-layout.test.mjs`
  - `tests/requested-history-and-explore-data.test.mjs`
  - `tests/requested-history-quick-logo.test.mjs`

**Interfaces:**
- Consumes: audit map plus Matrix Explore canonical test from Task 3.
- Produces: one History Node contract; any still-valid Explore assertion from a mixed file moves to `matrix-explore-ui-contract.test.mjs` rather than remaining in History.

- [ ] **Step 1: Split mixed file assertions by owner before deleting the mixed file**

For `requested-history-and-explore-data.test.mjs`, annotate every assertion as either:

```text
HISTORY -> tests/history-contract.test.mjs
EXPLORE -> tests/matrix-explore-ui-contract.test.mjs
OBSOLETE/DUPLICATE -> audit evidence
```

- [ ] **Step 2: Build canonical History sections**

Use stable groups:

```text
history: row/table structure
history: week grouping
history: filters/reset/layering
history: responsive spacing
history: lottery ball sizing including 6+1
history: title/logo actions
```

- [ ] **Step 3: Keep computed-style coverage only when Node CSS parsing protects a different failure mode than Playwright**

If `recent-history-computed-style.test.mjs` merely repeats source regex assertions already in `recent-history-layout.test.mjs`, merge/delete the duplicate. If it resolves cascade/selector precedence that plain source checks cannot catch, preserve that assertion in the canonical file or a clearly named helper-backed contract.

- [ ] **Step 4: Run History + Explore affected contracts**

```bash
node --test tests/history-contract.test.mjs tests/matrix-explore-ui-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests docs/testing/test-suite-audit-20260904.md
git commit -m "test: consolidate history contracts"
```

---

### Task 7: Consolidate Notification, Number Reference, and Subscription Node contracts

**Files:**
- Create: `tests/notification-contract.test.mjs`
- Create: `tests/number-reference-contract.test.mjs`
- Create: `tests/subscription-contract.test.mjs`
- Review/Merge/Delete as classified:
  - `tests/notification-layout-docx.test.mjs`
  - `tests/notification-status-layout.test.mjs`
  - `tests/notification-visual-hierarchy.test.mjs`
  - `tests/quick-settings-notification-responsive.test.mjs`
  - `tests/status-reference-notification-quick-regression.test.mjs`
  - `tests/number-reference-list-visual.test.mjs`
  - `tests/number-reference-special-number-style.test.mjs`
  - `tests/number-reference-sticky.test.mjs`
  - `tests/number-reference-title-actions.test.mjs`
  - `tests/reference-title-actions-contract.test.mjs`
  - `tests/premium-contract.test.mjs`
  - `tests/pro-plans-carousel-peek.test.mjs`
  - `tests/subscription-copy-assets.test.mjs`
  - `tests/member-plan-icons-notification-toggle.test.mjs`

**Interfaces:**
- Consumes: audit classifications.
- Produces: three stable feature-domain contracts; mixed tests are split by ownership before deletion.

- [ ] **Step 1: Split mixed regression files by feature owner**

`status-reference-notification-quick-regression.test.mjs` and `member-plan-icons-notification-toggle.test.mjs` must be decomposed assertion-by-assertion; do not copy the whole file into two destinations.

- [ ] **Step 2: Preserve current subscription price/copy/assets regression**

The subscription canonical contract must continue to protect the current approved prices and designated assets:

```text
月費 2880
季費 5580
年費 17800
/assets/lottery/functions/訂閱方案標題K.png
/assets/lottery/functions/推薦啟動標題K.png
/assets/lottery/functions/法律資訊標題K.png
```

If `subscription-copy-assets.test.mjs` is the clearest existing authority, it may remain standalone and `subscription-contract.test.mjs` should not duplicate it; record that choice as `KEEP` in the audit instead of forcing a merge.

- [ ] **Step 3: Run each canonical/protected domain independently**

```bash
node --test tests/notification-contract.test.mjs
node --test tests/number-reference-contract.test.mjs
node --test tests/subscription-contract.test.mjs
```

If a protected standalone file remains, include it in the corresponding command.

- [ ] **Step 4: Commit**

```bash
git add tests docs/testing/test-suite-audit-20260904.md
git commit -m "test: consolidate member and reference contracts"
```

---

### Task 8: Audit remaining shared UI tests without over-consolidating security, migration, runtime, or unrelated tools

**Files:**
- Review all remaining `tests/*.test.mjs` not consumed by Tasks 3–7.
- Potential shared UI candidates include:
  - `tests/activation-code-layout.test.mjs`
  - `tests/combined-spacing-filter-switcher-regression.test.mjs`
  - `tests/confirmed-ui-refinements.test.mjs`
  - `tests/final-ui-interaction-spacing-contract.test.mjs`
  - `tests/layout-inline-12px.test.mjs`
  - `tests/layout-inline-spacing.test.mjs`
  - `tests/page-title-card.test.mjs`
  - `tests/responsive-feature-pages-request.test.mjs`
  - `tests/responsive-shell-contract.test.mjs`
  - `tests/shared-title-control-alignment.test.mjs`
  - `tests/title-content-gap.test.mjs`
  - `tests/ui-repair-20260823.test.mjs`
  - `tests/ui-request-20260828-final-regression.test.mjs`
  - `tests/ui-responsive-cleanup-contract.test.mjs`
  - `tests/ui-spacing-and-number-cleanup.test.mjs`
  - `tests/ui-visual-language-refinement.test.mjs`

**Interfaces:**
- Consumes: complete inventory from Task 1 and canonical domain files from Tasks 3–7.
- Produces: zero unclassified `tests/` entries and no unnecessary mega-file.

- [ ] **Step 1: Re-run exact duplicate scan on the reduced suite**

Use the same Python assertion scan from Task 1.

Expected: remaining duplicate candidates are few enough for manual semantic review.

- [ ] **Step 2: For cross-domain UI files, split only assertions that clearly belong to an existing canonical domain**

Rules:

```text
If an assertion belongs to Homepage -> homepage-contract.test.mjs
If it belongs to Explore -> matrix-explore-ui-contract.test.mjs
If it belongs to History -> history-contract.test.mjs
If it belongs to Notification -> notification-contract.test.mjs
If it belongs to Number Reference -> number-reference-contract.test.mjs
If it is a genuinely shared shell/title invariant -> keep a focused shared test file
If ownership is ambiguous -> KEEP; do not guess-delete
```

- [ ] **Step 3: Keep infrastructure and safety boundaries separate**

Do not merge solely because matcher syntax looks alike:

```text
security/RPC
migration contracts
runtime integrity
service worker/push
Cloudflare/sites worker
LINE login
manual bank transfer
Matrix analysis workflow/version/lease
feature tool logic
calculator/tongxing/tiangong/matrix guide behaviors
```

- [ ] **Step 4: Verify every tracked `tests/` entry still has exactly one audit row**

Run the completeness script from Task 1 against the current tracked inventory and also check deleted paths remain documented in the report.

- [ ] **Step 5: Commit**

```bash
git add tests docs/testing/test-suite-audit-20260904.md
git commit -m "test: remove remaining obsolete and duplicate contracts"
```

---

### Task 9: Audit Playwright specs for duplicate purpose without replacing browser-only coverage

**Files:**
- Review: `tests/*.spec.ts`
- Keep browser-only responsive/interaction coverage unless two specs exercise the same route, viewport, interaction, and expected browser outcome.
- Modify/Delete only when the audit proves exact semantic duplication.

**Interfaces:**
- Consumes: Node canonical contracts and the complete Playwright inventory.
- Produces: a Playwright suite whose cases require a browser or provide a distinct end-to-end failure mode.

- [ ] **Step 1: Inventory Playwright cases by route + viewport + interaction + expected outcome**

Add an audit subsection:

```markdown
## Playwright coverage map
| Spec | Route/fixture | Viewport | Browser-only behavior | Overlap decision |
| --- | --- | --- | --- | --- |
```

- [ ] **Step 2: Delete a Playwright test only if all four dimensions are semantically duplicated**

Required duplication dimensions:

```text
same route/fixture
same viewport class
same interaction path
same browser/computed-layout expected outcome
```

Node regex/source assertions never count as a replacement for a browser-only outcome.

- [ ] **Step 3: Run the complete Playwright suite after any spec edit**

```bash
npm run test:runtime
```

Expected: PASS.

- [ ] **Step 4: Commit only if Playwright files changed**

```bash
git add tests docs/testing/test-suite-audit-20260904.md
git commit -m "test: deduplicate browser regression coverage"
```

If no Playwright file changes are justified, update only the audit report in the next task and do not create an empty commit.

---

### Task 10: Final traceability check and complete verification on the exact final tree

**Files:**
- Finalize: `docs/testing/test-suite-audit-20260904.md`
- Verify: `.github/workflows/ci.yml`
- Verify: all remaining tests and build inputs.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a final branch/PR with no unclassified tests, no targeted/full duplicate CI run, and fresh passing evidence for Node, Vitest, Playwright, and Build.

- [ ] **Step 1: Rebuild the final inventory and prove no audit gaps**

Run:

```bash
git ls-files 'tests/**' | sort > /tmp/tests-final.txt
python - <<'PY'
from pathlib import Path
paths = [p for p in Path('/tmp/tests-final.txt').read_text().splitlines() if p]
report = Path('docs/testing/test-suite-audit-20260904.md').read_text(encoding='utf-8')
missing = [p for p in paths if f'`{p}`' not in report]
assert not missing, 'Missing final audit rows: ' + ', '.join(missing)
print(f'final audited paths: {len(paths)}')
PY
```

Expected: PASS.

- [ ] **Step 2: Prove the CI no longer contains duplicate Targeted Explore execution**

```bash
node --test tests/ci-workflow-coverage.test.mjs
grep -n "Targeted Explore tests" .github/workflows/ci.yml && exit 1 || true
test "$(grep -c 'run: node --test tests/\*.test.mjs' .github/workflows/ci.yml)" -eq 1
```

Expected: CI contract PASS; no targeted step; Full Node count exactly 1.

- [ ] **Step 3: Run Full Node**

```bash
node --test tests/*.test.mjs
```

Expected: PASS, zero failed tests.

- [ ] **Step 4: Run Full Vitest**

```bash
npm run test:unit
```

Expected: PASS, zero failed tests.

- [ ] **Step 5: Run Full Playwright**

```bash
PLAYWRIGHT_BROWSERS_PATH=.sites-runtime/playwright npx playwright install --with-deps chromium
npm run test:runtime
```

Expected: PASS, zero failed tests.

- [ ] **Step 6: Run the production build**

```bash
npm run build
```

Expected: PASS; TypeScript, Vite, PWA build versioning, and sites packaging all complete.

- [ ] **Step 7: Check diff hygiene and scope**

```bash
git diff --check origin/main...HEAD
git diff --name-status origin/main...HEAD
```

Expected: no whitespace errors. Production source files (`src/*.tsx`, production CSS, Supabase migrations, Matrix API, Admin application code) are absent from the diff unless a separately approved real defect required them.

- [ ] **Step 8: Final audit report summary**

The report must end with exact counts for:

```text
KEEP files
MERGE files removed
DELETE_DUPLICATE files/assertions removed
DELETE_OBSOLETE files/assertions removed
Playwright specs kept/removed
Node test files before/after
CI Node executions before/after
```

Derive counts from Git/inventory commands; do not estimate.

- [ ] **Step 9: Commit final report/verification-only adjustments**

```bash
git add docs/testing/test-suite-audit-20260904.md .github/workflows/ci.yml tests
git commit -m "test: finalize consolidated regression suite"
```

If nothing changed since the prior commit, do not create an empty commit.

- [ ] **Step 10: Create a review PR without merging**

PR title:

```text
test: consolidate regression suite and remove duplicate CI runs
```

PR body must include:

```markdown
## Scope
- removed Targeted Explore duplicate CI execution
- audited every tracked tests/ entry
- consolidated same-domain Node contracts
- removed only evidenced obsolete/duplicate assertions
- preserved formula, security, migration, runtime, and browser regressions

## Verification
- Full Node: PASS
- Vitest: PASS
- Playwright: PASS
- Build: PASS
- git diff --check: PASS

## Scope control
- production behavior intentionally unchanged
- no Supabase production write
- no deployment action
```

Do not merge until explicit user approval.

---

## Plan Self-Review

- **Spec coverage:** Tasks 1–10 cover CI deduplication, complete `tests/` inventory, obsolete-spec detection, exact/semantic duplicate detection, feature-domain consolidation, protected core regressions, Playwright layer preservation, responsive safeguards, and all four requested final verification suites.
- **Placeholder scan:** No `TBD`, `TODO`, deferred implementation, or unspecified test command remains. Ambiguous ownership is explicitly resolved by KEEP rather than guess-deletion.
- **Type/interface consistency:** The audit report is the shared interface between tasks; canonical file names are fixed in the File Structure section and reused consistently throughout the plan.
