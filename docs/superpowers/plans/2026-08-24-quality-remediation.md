# 樂彩 Matrix Quality Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓最新正式 UI、測試與 Frontend Design Premium 契約重新一致，修正已確認的真實互動、表單、捲動與可及性問題，同時移除測試對舊版 CSS、舊 override、失效 marker 與未受控 artifact 的依賴。

**Architecture:** `src/` 與其 canonical CSS 繼續是唯一 production source。測試透過共用 helper 解析本地 CSS imports，再鎖定最新正式 contract；Premium 以 `premium-ui.json`、`DESIGN.md`、`UX-CONTRACT.md` 宣告既有 token、native control 與互動 ownership。產品修正採最小、可測試、無版面重設的 direct actions 與 app-owned validation。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Node test runner、Testing Library、Playwright、Frontend Design Premium strict auditor、CSS custom properties。

**Spec:** `docs/superpowers/specs/2026-08-24-quality-remediation-design.md`

**Execution baseline:** `c37d61deb510ad664b9f2feae2045de910c50502` (`main` = `origin/main` on 2026-08-24).

**Required order:** Execute `docs/superpowers/plans/2026-08-24-line-login-api-completion.md` first. That plan removes the out-of-scope `LineAuthGate` regression and gives the profile logout button a real owner; this plan must not recreate or separately patch that gate.

## Current Evidence at the Execution Baseline

| Check | Result |
|---|---|
| `npm run test:unit` | 459 tests: 450 pass, 9 fail |
| `node --test tests/*.test.mjs` | 222 tests: 152 pass, 70 fail |
| `npx tsc --noEmit` | pass |
| `npm run build` | pass in an isolated copy |
| `npm run test:sites` | 4/4 pass |
| Premium strict/no-write | 34 errors: 4 unresolved ownership + 30 violations |
| `npm run test:runtime` | browser executable missing; 19 fail/2 skip before product assertions |

Eight Vitest failures and the 70 Node failures are stale/brittle test contracts. The ninth Vitest failure is the now-out-of-scope gate and is removed by the prerequisite LINE plan.

## Global Constraints

- Fetch `origin/main` before execution; stop and re-plan if HEAD no longer descends from the execution baseline.
- Never copy rules from imported canonical CSS back into `src/homepage-repair.css` merely to satisfy string tests.
- Keep Tianyan near-10 cards, Matrix Core container background, current `1536 / 414` sizing token, 82px bottom-navigation token, and current responsive geometry.
- Do not recreate `project-overrides.css` or `project-overrides.js`.
- Do not restore `buildTongXingPairs`, comment markers, deleted selectors, or superseded dimensions.
- Do not change Matrix algorithms, data APIs, referral mutation behavior, layout hierarchy, typography, card proportions, or spacing unless a confirmed current production defect in this plan requires it.
- `app/` remains compatibility/example source and is excluded from production audit. Do not edit it to make the PWA audit pass.
- Do not add empty handlers, empty links, or dummy API calls. Every enabled action must perform the approved behavior.
- Do not generate design images. The PNG task exports the existing rendered ticket; it does not introduce a new visual design.
- When Tasks 7 and 9 edit `FeaturePages.tsx` or `feature-pages.css`, preserve the prerequisite LINE plan's direct profile logout, revoke-before-signOut ordering, pending/disabled state, failure alert, and UI-free `MemberSessionBridge`; never restore document delegation or `LineAuthGate`.
- Because Premium scans `src/__tests__`, any new literal test-fixture button must either exercise a real test action or be disabled; do not introduce an actionless fixture finding.

---

### Task 1: Add one recursive local CSS test reader

**Files:**
- Create: `tests/helpers/read-local-css.mjs`
- Create: `tests/read-local-css.test.mjs`

**Interfaces:**
- Produces: `readLocalCss(entry: string | URL): string`.
- Resolves: quoted local `@import` paths recursively and in declaration order.
- Preserves: remote/data/root imports as source text; detects local import cycles.

- [ ] **Step 1: Write the failing helper test**

Use a temporary directory with `entry.css -> nested/base.css -> colors.css` and assert the returned text includes all three rule bodies in cascade order. Add a cycle test that rejects `a.css -> b.css -> a.css` with `CSS_IMPORT_CYCLE`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/read-local-css.test.mjs`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the helper**

```js
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/g;

export function readLocalCss(entry, stack = []) {
  const absolute = entry instanceof URL ? fileURLToPath(entry) : resolve(entry);
  if (stack.includes(absolute)) throw new Error(`CSS_IMPORT_CYCLE:${absolute}`);
  const nextStack = [...stack, absolute];
  const source = readFileSync(absolute, "utf8");
  return source.replace(LOCAL_IMPORT, (statement, request) => {
    if (/^(?:[a-z]+:|\/)/i.test(request)) return statement;
    return readLocalCss(resolve(dirname(absolute), request), nextStack);
  });
}
```

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test tests/read-local-css.test.mjs
git add tests/helpers/read-local-css.mjs tests/read-local-css.test.mjs
git commit -m "test: resolve canonical CSS imports"
```

---

### Task 2: Align the remaining Vitest assertions with current production

**Files:**
- Modify: `src/__tests__/homepage-home-controls-style.test.ts`
- Modify: `src/__tests__/homepage-lottery-switcher-style.test.ts`
- Modify: `src/__tests__/MatrixTianyanPage.test.tsx`

**Interfaces:**
- Tests current homepage cascade and current Tianyan interaction.
- Does not change production files.

- [ ] **Step 1: Keep the known tests RED before changing expectations**

Run:

```bash
npx vitest run src/__tests__/homepage-home-controls-style.test.ts src/__tests__/homepage-lottery-switcher-style.test.ts src/__tests__/MatrixTianyanPage.test.tsx
```

Expected at baseline: 8 failures.

- [ ] **Step 2: Read the real imported cascade**

Import `../../tests/helpers/read-local-css.mjs` with the existing `@ts-expect-error` convention and read `homepage-repair.css` once in both style suites. Do not separately concatenate `homepage/base.css`; the helper must prove imports work.

- [ ] **Step 3: Replace only superseded expectations**

Use these exact contracts:

| Surface | Current contract |
|---|---|
| lottery card | gold outer border in imported canonical rule |
| draw order | `height: 26px` |
| embedded next draw | `padding: 0 20px 5px` |
| logo/switcher gap | `--home-gap-logo-switcher: 8px` |
| Matrix Core | container background; height token based on `1536 / 414`; no child image requirement |
| Tianyan | near-10 cards render and can expand; do not assert their absence |

Delete the obsolete `1774 / 568` child-image assertions and invert the Tianyan expectation to the behavior established by commit `16ea751`.

- [ ] **Step 4: Verify GREEN and commit**

Run the targeted command from Step 1. Expected: PASS.

```bash
git add src/__tests__/homepage-home-controls-style.test.ts src/__tests__/homepage-lottery-switcher-style.test.ts src/__tests__/MatrixTianyanPage.test.tsx
git commit -m "test: align Vitest contracts with current UI"
```

---

### Task 3: Migrate Node homepage tests to the imported cascade

**Files:**
- Modify: `tests/bottom-navigation-safe-area-position.test.mjs`
- Modify: `tests/bottom-navigation-cleanup.test.mjs`
- Modify: `tests/bottom-navigation.test.mjs`
- Modify: `tests/home-layout-contract.test.mjs`
- Modify: `tests/home-lottery-cards.test.mjs`
- Modify: `tests/home-nextdraw-spacing.test.mjs`
- Modify: `tests/home-tongxing-bounded.test.mjs`
- Modify: `tests/homepage-card-fit.test.mjs`
- Modify: `tests/homepage-logo-layout.test.mjs`
- Modify: `tests/homepage-lottery-switcher-selected.test.mjs`
- Modify: `tests/latest-draw-card-layout.test.mjs`
- Modify: `tests/layout-inline-12px.test.mjs`
- Modify: `tests/matrix-core-effects.test.mjs`
- Modify: `tests/countdown.test.mjs`

**Interfaces:**
- Consumes: `readLocalCss("src/homepage-repair.css")`.
- Tests the current production cascade rather than the two-line import entry.

- [ ] **Step 1: Replace direct homepage entry reads**

Every listed test that currently calls `readFileSync("src/homepage-repair.css")` must use `readLocalCss`. Keep `design-tokens.css`, TSX, and unrelated CSS reads direct.

- [ ] **Step 2: Converge conflicting assertions**

Apply these exact replacements:

```text
bottom navigation: 95px -> var(--bottom-navigation-height) = 82px
next draw padding: 0 20px or 0 20px 2px -> 0 20px 5px
countdown: "08/14 (五) 20:30" -> "08/14(五) 20:30"
Matrix Core: child <img> / 1774:568 -> container background / 1536:414 token
selected lottery: border-image -> current ::after mask
draw toolbar: removed selector -> current card/grid owner
```

Do not weaken assertions to `source.includes("px")`; assert the named selector/token and current value.

- [ ] **Step 3: Run the homepage group**

```bash
node --test tests/bottom-navigation-cleanup.test.mjs tests/bottom-navigation-safe-area-position.test.mjs tests/bottom-navigation.test.mjs tests/home-layout-contract.test.mjs tests/home-lottery-cards.test.mjs tests/home-nextdraw-spacing.test.mjs tests/home-tongxing-bounded.test.mjs tests/homepage-card-fit.test.mjs tests/homepage-logo-layout.test.mjs tests/homepage-lottery-switcher-selected.test.mjs tests/latest-draw-card-layout.test.mjs tests/layout-inline-12px.test.mjs tests/matrix-core-effects.test.mjs tests/countdown.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/bottom-navigation-cleanup.test.mjs tests/bottom-navigation-safe-area-position.test.mjs tests/bottom-navigation.test.mjs tests/home-layout-contract.test.mjs tests/home-lottery-cards.test.mjs tests/home-nextdraw-spacing.test.mjs tests/home-tongxing-bounded.test.mjs tests/homepage-card-fit.test.mjs tests/homepage-logo-layout.test.mjs tests/homepage-lottery-switcher-selected.test.mjs tests/latest-draw-card-layout.test.mjs tests/layout-inline-12px.test.mjs tests/matrix-core-effects.test.mjs tests/countdown.test.mjs
git commit -m "test: converge homepage contracts on latest cascade"
```

---

### Task 4: Align feature, history, number-ball, TongXing, and Explore contracts

**Files:**
- Create: `tests/helpers/css-rules.mjs`
- Create: `tests/css-rules.test.mjs`
- Modify: `tests/draw-history-table-layout.test.mjs`
- Modify: `tests/history-filter-select-layering.test.mjs`
- Modify: `tests/matrix-explore-fluid-layout.test.mjs`
- Modify: `tests/matrix-explore-option-layout.test.mjs`
- Modify: `tests/matrix-explore-ui-refinement.test.mjs`
- Modify: `tests/number-ball-style-source.test.mjs`
- Modify: `tests/number-reference-special-number-style.test.mjs`
- Modify: `tests/number-reference-title-actions.test.mjs`
- Modify: `tests/page-title-card.test.mjs`
- Modify: `tests/recent-history-computed-style.test.mjs`
- Modify: `tests/recent-history-layout.test.mjs`
- Modify: `tests/requested-history-quick-logo.test.mjs`
- Modify: `tests/responsive-feature-pages-request.test.mjs`
- Modify: `tests/tongxing-reference-responsive-layout.test.mjs`
- Modify: `tests/ui-repair-20260823.test.mjs`
- Modify: `tests/ui-responsive-cleanup-contract.test.mjs`

**Interfaces:**
- Tests canonical rules in `feature-pages.css`, `responsive-feature-pages.css`, `matrix-explore-spacing.css`, `number-ball.css`, and `tongxing-compact.css`.
- Replaces source-shape regexes that cannot parse grouped selectors with rule-body assertions.

- [ ] **Step 1: Capture the current RED set with the complete command**

Run:

```bash
node --test --test-reporter=tap tests/draw-history-table-layout.test.mjs tests/history-filter-select-layering.test.mjs tests/matrix-explore-fluid-layout.test.mjs tests/matrix-explore-option-layout.test.mjs tests/matrix-explore-ui-refinement.test.mjs tests/number-ball-style-source.test.mjs tests/number-reference-special-number-style.test.mjs tests/number-reference-title-actions.test.mjs tests/page-title-card.test.mjs tests/recent-history-computed-style.test.mjs tests/recent-history-layout.test.mjs tests/requested-history-quick-logo.test.mjs tests/responsive-feature-pages-request.test.mjs tests/tongxing-reference-responsive-layout.test.mjs tests/ui-repair-20260823.test.mjs tests/ui-responsive-cleanup-contract.test.mjs
```

Fresh execution-baseline result: 90 tests, 52 pass, 38 fail. After this task's import-only migration in Step 2, any count reduction must be attributable to imported canonical rules becoming visible; the remaining tests must stay RED until the replacements below are made.

- [ ] **Step 2: Migrate the three moved cascade readers**

In `number-ball-style-source.test.mjs`, `page-title-card.test.mjs`, and `ui-repair-20260823.test.mjs`, replace direct reads of `src/homepage-repair.css` with Task 1's `readLocalCss("src/homepage-repair.css")`. Keep unrelated TSX and canonical CSS reads direct. This preserves imported-cascade coverage after these files moved from Task 3 to Task 4 ownership.

- [ ] **Step 3: Add one grouped-selector rule helper**

Create `tests/helpers/css-rules.mjs` with `ruleBodies(source, selectorPattern)`, returning bodies whose complete selector matches a supplied `RegExp`; write exactly two tests in `tests/css-rules.test.mjs`, one for comma groups and one for `:is()`. Use it instead of regexes that assume a selector is alone or first in a group.

- [ ] **Step 4: Apply the failure-to-owner matrix**

| Failing tests | Current source owner | Exact replacement/drop rationale |
|---|---|---|
| `draw-history-table-layout`, `history-filter-select-layering` | `feature-pages.css`, `responsive-feature-pages.css` | retain current history grid and deep select surface; drop 27.4px and obsolete underline-layer assumptions |
| `matrix-explore-fluid-layout`, `matrix-explore-option-layout`, `matrix-explore-ui-refinement` | `matrix-explore-spacing.css` loaded last by `main.tsx` | assert scoped 100% flow/current compact control rules; do not restore old viewport locks |
| `number-ball-style-source`, `number-reference-special-number-style` | `number-ball.css` | assert 9–10px Mark Six text, 0px underline baseline, current per-tone optical offsets and white/red special-number treatment |
| `number-reference-title-actions`, title portions of `page-title-card` | `responsive-feature-pages.css`, `brand-header-unify.css` | assert current 22px/24.7px controls and content/auto action width; drop old 40% lock |
| `recent-history-computed-style`, `recent-history-layout` | `feature-pages.css`, `responsive-feature-pages.css` | keep current 40px six-plus-one rows, current responsive balls, and current grouped selectors; drop translateY(2px) legacy rule |
| `requested-history-quick-logo` | `FeaturePagesCore.tsx`, `brand-header-unify.css` | assert the currently imported brand asset and header owner; do not reintroduce deleted override markup |
| `responsive-feature-pages-request` | `responsive-feature-pages.css` | assert current 16px floating inline offsets and current title-card token ownership; drop 20px/40% superseded requests |
| `tongxing-reference-responsive-layout` | `tongxing-compact.css`, `FeaturePagesCore.tsx` | assert current CSS variables, auto grid and API-rendered rows; drop obsolete fixed divider/width tokens |
| `ui-repair-20260823`, `ui-responsive-cleanup-contract` | `BottomNavigation.tsx`, all canonical feature styles above | assert current touch/mouse/click path and shared final rules; remove compensating old selectors rather than weakening checks |

Use these verified values across the matrix:

Converge the tests on this verified mapping:

| Capability | Current production contract |
|---|---|
| tool/matrix floating inline offsets | 16px |
| title compact controls | 22px controls with current 24.7px variant where defined |
| title action width | content/auto, not old 40% lock |
| Mark Six number ball text | current 9–10px range |
| number-ball underline | 0px baseline |
| number-ball optical alignment | current per-tone offsets |
| grouped rules | comma groups and `:is()` are valid canonical selectors |
| Explore spacing | scoped rules in `matrix-explore-spacing.css` |

Where a regex currently assumes one selector, use a helper that extracts all rule bodies for a selector/group and assert that one matching body contains the property. Do not duplicate grouped production rules.

- [ ] **Step 5: Verify GREEN**

Run `node --test tests/css-rules.test.mjs` and the complete 16-file command from Step 1. Expected: 92 tests, all pass (90 migrated contracts plus two helper tests).

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/css-rules.mjs tests/css-rules.test.mjs tests/draw-history-table-layout.test.mjs tests/history-filter-select-layering.test.mjs tests/matrix-explore-fluid-layout.test.mjs tests/matrix-explore-option-layout.test.mjs tests/matrix-explore-ui-refinement.test.mjs tests/number-ball-style-source.test.mjs tests/number-reference-special-number-style.test.mjs tests/number-reference-title-actions.test.mjs tests/page-title-card.test.mjs tests/recent-history-computed-style.test.mjs tests/recent-history-layout.test.mjs tests/requested-history-quick-logo.test.mjs tests/responsive-feature-pages-request.test.mjs tests/tongxing-reference-responsive-layout.test.mjs tests/ui-repair-20260823.test.mjs tests/ui-responsive-cleanup-contract.test.mjs
git commit -m "test: align feature layout contracts with production"
```

---

### Task 5: Remove stale test infrastructure dependencies

**Files:**
- Modify: `tests/draw-history-week-cards-structure.test.mjs`
- Modify: `tests/home-navigation-and-back-button.test.mjs`
- Modify: `tests/number-reference-sticky.test.mjs`
- Modify: `tests/feature-tool-logic.test.mjs`
- Modify: `src/__tests__/lottery-api.test.ts`
- Modify: `tests/matrix-explore-inline-source.test.mjs`
- Modify: `tests/mobile-runtime-frame.test.mjs`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- No test reads deleted override files or imports removed exports.
- Rendered HTML test builds into a unique temporary directory and supplies `/index.html` through its ASSETS fixture.

- [ ] **Step 1: Point override tests at canonical owners**

Replace `project-overrides.js/css` reads with:

```text
history grouping/rendering -> src/FeaturePages.tsx
history scrolling/layout -> src/feature-pages.css + src/responsive-feature-pages.css
back navigation/header -> src/FeaturePages.tsx + src/brand-header-unify.css
number-reference sticky behavior -> src/feature-pages.css + src/responsive-feature-pages.css
```

Delete ENOENT expectations; do not create replacement override files.

- [ ] **Step 2: Remove the retired local TongXing calculation contract**

Remove only the `buildTongXingPairs` import/test from `feature-tool-logic.test.mjs`. Add/retain an API test in `src/__tests__/lottery-api.test.ts` that verifies `fetchTongXing` posts the selected lottery, number order, normalized numbers, and `futureOffset` to `/api/matrix/tongxing` and returns normalized groups.

- [ ] **Step 3: Replace the Explore marker test**

Delete `formalStart/formalEnd` slicing. Read `src/main.tsx` and assert `matrix-explore-spacing.css` is imported after `feature-pages.css`; read `matrix-explore-spacing.css` directly and assert the scoped width/height rules. No comment marker becomes a contract.

- [ ] **Step 4: Fix the invalid mobile regex**

Use valid literals:

```js
assert.match(source, /import \{ PhoneFrame \} from "\.\/PhoneFrame";/);
assert.match(source, /<PhoneFrame>[\s\S]*<\/PhoneFrame>/);
```

- [ ] **Step 5: Build a controlled rendered fixture**

In `rendered-html.test.mjs`, use Vite's programmatic `build` with a `mkdtemp` output directory, read that directory's `index.html`, and import `worker/index.js` directly. The ASSETS mock must return 404 for the initial application route and return the built HTML for `/index.html`. Assert current production metadata: `lang="zh-Hant-TW"`, viewport with `viewport-fit=cover`, theme color `#02070c`, and title `樂彩 Matrix`. Remove the obsolete `codex-preview=development` assertion. Delete the temp directory in `after`.

- [ ] **Step 6: Verify GREEN and commit**

```bash
node --test tests/draw-history-week-cards-structure.test.mjs tests/home-navigation-and-back-button.test.mjs tests/number-reference-sticky.test.mjs tests/feature-tool-logic.test.mjs tests/matrix-explore-inline-source.test.mjs tests/mobile-runtime-frame.test.mjs tests/rendered-html.test.mjs
npx vitest run src/__tests__/lottery-api.test.ts
git add tests/draw-history-week-cards-structure.test.mjs tests/home-navigation-and-back-button.test.mjs tests/number-reference-sticky.test.mjs tests/feature-tool-logic.test.mjs src/__tests__/lottery-api.test.ts tests/matrix-explore-inline-source.test.mjs tests/mobile-runtime-frame.test.mjs tests/rendered-html.test.mjs
git commit -m "test: remove stale UI test infrastructure"
```

---

### Task 6: Establish the Premium design and UX ownership layer

**Files:**
- Create: `premium-ui.json`
- Create: `DESIGN.md`
- Create: `UX-CONTRACT.md`
- Create: `tests/premium-contract.test.mjs`
- Modify: `docs/DESIGN_TOKENS.md`

**Interfaces:**
- Audit profile: `product-admin`.
- Production root: `src` only.
- Native ownership: `Select/Listbox`, `Date`.
- Runtime token owner remains `src/design-tokens.css`; `DESIGN.md` is a maintained descriptive mirror, not a generator.

- [ ] **Step 1: Write the failing contract test**

Assert `premium-ui.json` equals the intentional minimum:

```json
{
  "profile": "product-admin",
  "sourceRoots": ["src"],
  "locale": "zh-TW",
  "canonicalMap": "UX-CONTRACT.md",
  "requiredCapabilities": ["Select/Listbox", "Date", "Form", "Scrollbar"],
  "ownership": {
    "Select/Listbox": "native",
    "Date": "native"
  }
}
```

Assert `DESIGN.md` names `src/design-tokens.css` as runtime owner and `UX-CONTRACT.md` contains the exact five-column heading:

```text
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
```

The test must also require non-empty rows for `Select/Listbox`, `Date`, `Form`, and `Scrollbar`, and verify the exact runtime values `#02070c`, `#c49145`, `#f4ce67`, `12px`, `8px`, `10px`, and `82px` are traceable from `DESIGN.md`/`docs/DESIGN_TOKENS.md` to `src/design-tokens.css`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/premium-contract.test.mjs`

Expected: FAIL because all three root contracts are absent.

- [ ] **Step 3: Write evidence-based design context**

Start from the installed Premium assets `assets/DESIGN.template.md` and `assets/UX-CONTRACT.template.md`; remove every bracketed prompt and non-applicable empty row. Keep the Google DESIGN.md `version: alpha` frontmatter valid.

`DESIGN.md` must describe the existing dark navy/gold product interface, Traditional Chinese locale, mobile-first/PWA usage, Roboto/system fallbacks, safe areas, current component map, and current CSS tokens. Use exact existing values such as `#02070c`, `#c49145`, `#f4ce67`, 12px page inline, 8px section gap, 10px card radius, and 82px bottom navigation. Do not introduce new tokens or change runtime CSS.

`UX-CONTRACT.md` must document:

- Native Select/Listbox and Date are intentional OS-owned controls for the supported mobile PWA.
- Forms are app-owned, use `noValidate`, field associations, busy state, failure recovery, and first-error focus.
- Scrollbars are browser-native with product color/width styling and forced-colors fallback.
- Direct actions: PNG download, invite route, referral disabled, member logout/revoke.
- Existing `docs/COMPONENT_MAP.md`, `docs/ASSET_MANIFEST.md`, and `docs/DESIGN_TOKENS.md` remain supporting evidence.

Add a **Model B: existing runtime canonical** section to `docs/DESIGN_TOKENS.md`: `src/design-tokens.css` is the authoring/runtime owner, `DESIGN.md` is a descriptive mirror, and the contract test is the drift gate. Updates flow from CSS owner to documentation in the same changeset, never from generated docs back into CSS during this remediation.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test tests/premium-contract.test.mjs
npx -p @google/design.md designmd lint DESIGN.md
git add premium-ui.json DESIGN.md UX-CONTRACT.md tests/premium-contract.test.mjs docs/DESIGN_TOKENS.md
git commit -m "docs: establish Premium UI ownership"
```

---

### Task 7: Resolve real and static action ownership without fake handlers

**Files:**
- Create: `src/matrix-ticket-download.ts`
- Create: `src/__tests__/matrix-ticket-download.test.ts`
- Create: `src/__tests__/FeatureActions.test.tsx`
- Modify: `src/FeaturePages.tsx`
- Modify: `src/BottomNavigation.tsx`
- Modify: `src/__tests__/BottomNavigation.test.tsx`
- Modify: `src/mobile/Device.tsx`
- Create: `src/mobile/Device.test.tsx`
- Modify: `tests/mobile-runtime.spec.ts`

**Interfaces:**
- Matrix ticket: existing ticket DOM -> downloaded `matrix-ticket.png`.
- Matrix ticket states: idle, pending/disabled with `aria-busy`, recoverable failure alert, retry.
- Invite: existing button -> existing `invite-friends` route.
- Referral confirmation: disabled until a mutation API is specified.
- Bottom navigation and Radix trigger preserve current behavior with statically explicit owners.

- [ ] **Step 1: Write failing product interaction tests**

Add tests for:

```tsx
await user.click(screen.getByRole("button", { name: "下載 PNG" }));
expect(downloadMatrixTicket).toHaveBeenCalledWith(expect.any(HTMLElement), "matrix-ticket.png");

await user.click(screen.getByRole("button", { name: "邀請好友" }));
expect(onNavigate).toHaveBeenCalledWith("invite-friends");

expect(screen.getByRole("button", { name: "確認" })).toBeDisabled();
expect(screen.getByRole("button", { name: "紀錄設定" })).toBeDisabled();
```

For PNG rejection, assert the button re-enables, `role="alert"` displays `下載失敗，請稍後再試`, and a second click retries successfully.

Before production rewrites, add these RED contracts:

- `BottomNavigation.test.tsx`: source has a literal `onClick` on the rendered button, no `{...quickProps}`, and quick short-click/long-press plus ordinary navigation still fire exactly once.
- `Device.test.tsx`: pointer click and keyboard Enter open the Radix device menu; selecting another device updates the trigger label and restores focus.
- `FeatureActions.test.tsx`: in notebook settings edit mode, clicking the first reorder control moves that tag down once; ArrowUp/ArrowDown obey bounds, preserve focus, and announce an accurate accessible label.

- [ ] **Step 2: Write the PNG boundary test**

Inject document/canvas/image/URL boundaries. Prove the helper:

- waits for `document.fonts.ready` and every ticket image to decode;
- converts same-origin image assets to data URLs before SVG serialization;
- materializes visible `::before`/`::after` computed styles in the clone;
- creates an `image/png` Blob whose first eight bytes equal the PNG signature and whose canvas width/height are non-zero;
- clicks one temporary anchor with `download="matrix-ticket.png"` and revokes the object URL;
- rejects without clicking when fonts/assets/SVG/canvas/blob creation fails.

- [ ] **Step 3: Verify RED**

Run:

```bash
npx vitest run src/__tests__/matrix-ticket-download.test.ts src/__tests__/FeatureActions.test.tsx src/__tests__/BottomNavigation.test.tsx src/mobile/Device.test.tsx
```

Expected: action tests fail because the current controls are actionless and the export helper is absent.

- [ ] **Step 4: Implement PNG export from the existing DOM**

After fonts and images are ready, clone the `.matrix-ticket`, inline computed styles recursively, convert same-origin image sources to data URLs, and insert synthetic children for non-empty `::before`/`::after` styles. Serialize the clone inside an SVG `foreignObject` at the element's measured width/height, draw the loaded SVG to a canvas at up to 2x device pixel ratio, then use `canvas.toBlob("image/png")`. Use the existing logo already present in the ticket; do not add ticket content, formats, or alternate artwork.

In `MatrixCardPage`, attach a ref to the existing section, use pending/failure state to prevent double clicks and permit retry, keep the visible label `下載 PNG` unchanged, and add `disabled`, `aria-busy`, plus the scoped failure alert.

The browser test in Task 11 must read the downloaded bytes, assert the PNG signature, non-zero file size, and successful browser decode with non-zero natural dimensions. Record SVG `foreignObject` export on real iOS Safari/PWA as unverified until device evidence exists; Chromium success must not be presented as Safari proof.

- [ ] **Step 5: Wire or disable the other literal actions**

- Add `onClick={() => onNavigate("invite-friends")}` to `邀請好友`.
- Add `disabled` to referral `確認`; do not create a mutation.
- Add `disabled` to the unreachable `紀錄設定` action until its flow has an approved contract.
- Delete unused `SelectBox` and unused `LegacyMatrixNotebookPage`; do not delete the routed `NotesPage`.
- Replace `BottomNavigation`'s spread-only click ownership with a literal `onClick={label === "快捷" ? handleQuickClick : ...}` while preserving touch/mouse long-press handlers.
- Render `DropdownMenu.Trigger` directly as the device trigger instead of an actionless literal button under `asChild`.
- Give the tag reorder button a real click behavior that moves the tag one position down, or one position up when already last; reuse the same bounded reorder helper for keyboard ArrowUp/ArrowDown.

- [ ] **Step 6: Verify GREEN and commit**

Run the targeted command from Step 3 plus `npx vitest run src/__tests__/app-production-shell.test.tsx`. Expected: PASS.

```bash
git add src/matrix-ticket-download.ts src/__tests__/matrix-ticket-download.test.ts src/__tests__/FeatureActions.test.tsx src/FeaturePages.tsx src/BottomNavigation.tsx src/__tests__/BottomNavigation.test.tsx src/mobile/Device.tsx src/mobile/Device.test.tsx tests/mobile-runtime.spec.ts
git commit -m "fix: connect existing product actions"
```

---

### Task 8: Make admin login validation app-owned and accessible

**Files:**
- Modify: `src/admin/AdminLogin.tsx`
- Create: `src/admin/__tests__/AdminLogin.test.tsx`
- Modify: `src/admin/admin.css`

**Interfaces:**
- Form owns validation with `noValidate`.
- Field errors: `請輸入 Email`, `Email 格式不正確`, `請輸入密碼`.
- Auth failure: `登入失敗，請確認 Email 與密碼後再試`.
- Invalid fields expose `aria-invalid` and `aria-describedby`; first invalid field receives focus.

- [ ] **Step 1: Write failing tests**

Cover blank submit, invalid email, missing password, Supabase rejection, successful submission, and double-submit prevention. Representative assertion:

```tsx
await user.click(screen.getByRole("button", { name: "登入" }));
expect(email).toHaveAttribute("aria-invalid", "true");
expect(email).toHaveAttribute("aria-describedby", "admin-email-error");
expect(screen.getByText("請輸入 Email")).toHaveAttribute("id", "admin-email-error");
expect(signInWithPassword).not.toHaveBeenCalled();
expect(email).toHaveFocus();
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/admin/__tests__/AdminLogin.test.tsx`

Expected: FAIL because native validation owns the current form and the alert is empty.

- [ ] **Step 3: Implement minimal validation**

Add `noValidate`, refs for first-error focus, field error state, and a form error. Validate trimmed email with a conservative `^[^\s@]+@[^\s@]+\.[^\s@]+$` check and require a non-empty password. Keep the existing fields, labels, button, and visual hierarchy. Clear a field's error when the user edits it; retain the server failure only until the next submission/edit.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npx vitest run src/admin/__tests__/AdminLogin.test.tsx src/admin/__tests__/AdminApp.test.tsx
git add src/admin/AdminLogin.tsx src/admin/__tests__/AdminLogin.test.tsx src/admin/admin.css
git commit -m "fix: own admin login validation"
```

---

### Task 9: Normalize textarea and scrollbar ownership

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/mobile/Keyboard.tsx`
- Modify: `src/feature-pages.css`
- Modify: `src/styles.css`
- Create: `src/__tests__/scroll-and-textarea-contract.test.ts`

**Interfaces:**
- Product textareas keep current height but use `resize: none`.
- Scrollable regions retain native scrolling with Firefox standards properties and WebKit geometry/theme fallbacks.
- Forced-colors mode returns control to system colors.

- [ ] **Step 1: Write failing source-contract tests**

Assert every product textarea has a class containing `resize-none`, `.record-form-section > textarea` no longer declares `resize: vertical`, and the loaded global CSS contains both `scrollbar-color` and `scrollbar-width` plus WebKit track/thumb rules. Assert no reachable carousel/mobile-scroll rule contains `scrollbar-width: none` or `::-webkit-scrollbar { display: none; }`.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/__tests__/scroll-and-textarea-contract.test.ts`

Expected: FAIL on the current resizable textarea and hidden scrollbars.

- [ ] **Step 3: Implement one standards baseline**

Add a global rule in `styles.css` using existing semantic tokens rather than new hard-coded colors:

```css
:root {
  scrollbar-color: var(--bottom-nav-gold) var(--bottom-nav-panel-950);
  scrollbar-width: thin;
}
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: var(--bottom-nav-panel-950); }
*::-webkit-scrollbar-thumb {
  border: 2px solid var(--bottom-nav-panel-950);
  border-radius: 999px;
  background: var(--bottom-nav-gold);
}
*::-webkit-scrollbar-thumb:hover { background: var(--bottom-nav-gold-bright); }
*::-webkit-scrollbar-thumb:active { background: var(--lottery-gold-300); }
@media (forced-colors: active) {
  :root { scrollbar-color: auto; }
  *::-webkit-scrollbar-track { background: Canvas; }
  *::-webkit-scrollbar-thumb { border-color: Canvas; background: ButtonText; }
}
```

Remove the hiding rules from `.mobile-carousel`, `.mobile-scroll`, and `.plan-carousel`. Keep touch scrolling and overscroll behavior unchanged.

Add a literal `resize-none` class to routed textareas and merge `KeyboardTextarea`'s caller class with `mobile-textarea-resize-none`; both classes must resolve to `resize: none` while retaining current min-height/height rules. Delete the unused legacy notebook textarea together with the unused legacy component in Task 7. In the source test and Task 11 browser test, verify the root computed `scrollbar-color`/`scrollbar-width` and a newly created overflow container's inherited standards values, plus WebKit hover/active and forced-colors source rules.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npx vitest run src/__tests__/scroll-and-textarea-contract.test.ts
git add src/FeaturePages.tsx src/mobile/Keyboard.tsx src/feature-pages.css src/styles.css src/__tests__/scroll-and-textarea-contract.test.ts
git commit -m "fix: standardize textarea and scrollbar ownership"
```

---

### Task 10: Drive Premium strict audit to zero

**Files:**
- Modify only files already owned by Tasks 6–9 when a remaining finding proves an unresolved real/static contract.

- [ ] **Step 1: Run the mandatory anti-pattern scan before static audit**

```bash
rg -n 'window\.(alert|confirm|prompt)\(' src
rg -n "href=[\"']#[\"']|onClick=\\{\\(\\) => \\{\\}\\}" src
```

Classify every match as reachable product flow, test/unused source, or false positive. The current reachable `MatrixNotebookPage` uses native `window.confirm()` for destructive/name-change decisions. Replacing those dialogs requires a separately approved confirmation-dialog UX contract and is outside this no-redesign remediation. Record the exact source locations under `UX-CONTRACT.md` **Known native-dialog risk**; do not claim full Premium runtime compliance and do not silently replace them with new flows.

- [ ] **Step 2: Run the exact strict audit**

```bash
python /root/.codex/plugins/cache/openai-curated-remote/frontend-design-premium/1.4.0/skills/frontend-design-premium/scripts/audit_project.py . --mode strict --no-write
```

Expected: exit 0, zero errors.

- [ ] **Step 3: Classify any static residue before editing**

- `app/` finding means `sourceRoots` is not being read; fix the manifest, not `app/`.
- Literal actionless production button means connect the approved action or disable it.
- Spread/Radix finding means make the real owner statically visible; do not add a no-op.
- Test-only `LineAuthGate` finding means the prerequisite LINE plan was not completed; do not suppress it.
- Native Date/Select finding means the manifest/contract is malformed; do not replace mobile-native controls.

- [ ] **Step 4: Re-run audit and contract tests**

```bash
node --test tests/premium-contract.test.mjs
python /root/.codex/plugins/cache/openai-curated-remote/frontend-design-premium/1.4.0/skills/frontend-design-premium/scripts/audit_project.py . --mode strict --no-write
```

Expected: PASS/exit 0.

- [ ] **Step 5: Commit any evidence-backed residue fix**

Commit with a message that names the actual contract; never commit an audit-only no-op.

---

### Task 11: Full regression, mobile browser verification, and build

**Files:**
- Modify tests only when browser execution reveals a stale assertion; modify production only when a reproduced current defect exists.

- [ ] **Step 1: Run all deterministic checks**

```bash
npm run check:runtime
npx tsc --noEmit
npm run test:unit
node --test tests/*.test.mjs
npm run test:sites
npx -p @google/design.md designmd lint DESIGN.md
npm run build
git diff --check
```

Expected:

```text
runtime integrity: pass
TypeScript: pass
Vitest: all pass
Node tests: 222 existing tests plus new tests, all pass
Sites: 4/4 pass
production build: pass
diff check: clean
```

- [ ] **Step 2: Install the pinned Playwright browser if absent**

```bash
npm run install:test-browser
```

This repairs the test environment only; do not classify the prior missing executable as a product failure.

- [ ] **Step 3: Verify 360/375/390px behavior**

Extend an existing Playwright spec to run the touched flows at widths 360, 375, and 390 with a mobile-height viewport. Verify:

- PNG download button is visible, exposes pending/retry states, and creates a file with the PNG signature, non-zero byte length, and decodable non-zero image dimensions.
- Invite routes to `invite-friends`.
- Referral confirmation and note settings are disabled.
- Admin login errors remain within viewport and focus the first invalid field.
- Textareas do not expose a resize handle.
- Horizontal carousels and vertical mobile scroll remain wheel/touch/keyboard scrollable.
- No horizontal document overflow is introduced.

- [ ] **Step 4: Run browser regression**

```bash
npm run test:runtime
```

Expected: PASS. If an old test still expects superseded geometry such as a 93/95px nav, update the test to the current 82px token; do not change production backward.

- [ ] **Step 5: Final clean-state proof**

```bash
git status --short
git log -1 --oneline
```

Expected: no uncommitted files and a final scoped commit.

## Completion Criteria

- Latest production behavior, Vitest, Node tests, Playwright, and build agree.
- Tests resolve canonical CSS imports and no longer depend on deleted files, exports, markers, invalid regex, or uncontrolled `dist`.
- Premium strict **static auditor** reports zero unresolved/violation findings for `src`; reachable native `window.confirm()` debt is documented and full Premium runtime compliance is not claimed in this scope.
- PNG download and invite actions work; referral/settings actions with no contract are disabled.
- Admin login owns validation, associations, pending state, and visible failure recovery.
- Textareas are non-resizable without losing height; scrollbars remain operable in Firefox/WebKit/forced-colors.
- No old UI layer, fake handler, referral API, algorithm change, or redesign is introduced.
