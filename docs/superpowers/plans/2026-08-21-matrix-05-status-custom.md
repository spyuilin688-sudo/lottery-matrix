# Matrix Status and Custom Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Chapter 15 status evaluation, member-specific custom trigger settings, synchronized home/status results, and the approved mobile custom-settings page.

**Architecture:** Completed thirteen-period/full-range analysis remains in AppDeploy artifacts. Chapter 15 and custom evaluators are pure functions. Supabase stores only versioned member settings per lottery/status; AppDeploy API validates, applies entitlements, and returns derived summaries/cards without persisting member-specific algorithm results.

**Tech Stack:** TypeScript, Supabase Postgres/RLS, AppDeploy API/Database, React/Vite, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-matrix-full-api-integration-design.md`

## Global Constraints

- Four lotteries and ACTIVE/FOCUS/RESONANCE/CRITICAL are independently configurable.
- DORMANT is derived only when no state triggers and is never configurable.
- A group is AND across rows; a state is OR across all groups in its one-code and two-code sections.
- Limits are 20 groups per hit type and 10 rows per group; same-row duplicates are forbidden only inside one group.
- Custom settings replace Chapter 15 only for the selected member/lottery/status.
- Expired custom entitlement preserves settings but applies Chapter 15. Monthly downgrade excludes whole groups containing composite rows and preserves them for later restoration.
- Summary priority is CRITICAL, RESONANCE, FOCUS, ACTIVE, DORMANT.

---

### Task 1: Lock Chapter 15 Default Evaluation

**Files:**
- Create: `backend/matrix-status.ts`
- Create: `backend/matrix-status.test.ts`

**Interfaces:**
- Produces: `MatrixStatus`, `StatusTriggerCard`, `StatusSummary`, `evaluateChapter15(source)`.

- [ ] **Step 1: Write failing threshold tests**

Create table-driven tests for every First A/B/C/special and Second D/special threshold in Section 7.2 of the design spec, including exact lower/upper boundaries and the requirement that mixed add-drag or sum-drag rules contain at least one result from each source.

```ts
it.each(chapter15Cases)('$name', ({ source, expected }) => {
  expect(evaluateChapter15(source)).toEqual(expected);
});
```

Add tests for priority, one card per satisfied rule, duplicate-road display removal inside a card, stable card/detail sorting, and DORMANT with count zero.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-status.test.ts`

Expected: FAIL because the evaluator is absent.

- [ ] **Step 3: Implement Chapter 15 as named predicates**

Implement separate pure predicates for A, B, C, D, and both special classes. Feed predicates normalized add/sum/drag one-code and two-code rows from the complete status artifact. Keep the rule-class name internal; do not expose A/B/C/D in cards.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- backend/matrix-status.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/matrix-status.ts backend/matrix-status.test.ts
git commit -m "feat(api): evaluate Chapter 15 Matrix status"
```

### Task 2: Implement Custom Trigger Validation and Evaluation

**Files:**
- Create: `backend/matrix-custom-status.ts`
- Create: `backend/matrix-custom-status.test.ts`

**Interfaces:**
- Produces: `CustomHitType`, `CustomConditionRow`, `CustomConditionGroup`, `CustomStatusConfig`.
- Produces: `validateCustomStatusConfig(config, entitlements)` and `evaluateCustomStatus(source, config, entitlements)`.

- [ ] **Step 1: Write failing validation tests**

Cover exactly these invariants:

- one-code streaks: 4→5, 5→6, 6→7, 7→8; locked code count exactly one;
- two-code streaks: 5→6, 6→7, 7→8, 9→10, 11→12; locked code count exactly two;
- number order is `number-ascending` or `draw-order`;
- same-code quantity is an integer 1–99;
- maximum 20 groups per hit type and 10 rows per group;
- identical rows rejected within one group, but identical complete groups accepted across groups;
- monthly accepts add/sum/drag and rejects composite; quarterly/yearly/lifetime accept composite.

- [ ] **Step 2: Write failing evaluation tests**

Test AND within a group, OR across groups and across hit types, one trigger count per satisfied group, four lottery/four state independence, and the two-code rule where two road values predicting the same number still satisfy two locked codes.

Test downgrade behavior by proving a composite-containing group is excluded whole while non-composite groups still apply; then prove the same preserved config applies again after upgrade.

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-custom-status.test.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 4: Implement canonical validation and evaluation**

Canonicalize rows only for duplicate comparison; do not reorder user-visible groups. Return stable field-level error codes and paths. Evaluation returns satisfied group ids plus cards generated from those groups; it never mutates or drops saved groups.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- backend/matrix-custom-status.test.ts backend/matrix-status.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/matrix-custom-status.ts backend/matrix-custom-status.test.ts
git commit -m "feat(api): evaluate custom Matrix status triggers"
```

### Task 3: Store Member Settings in Supabase with RLS

**Files:**
- Create: `supabase/migrations/20260821000000_matrix_custom_status_settings.sql`
- Create: `backend/matrix-custom-status-store.ts`
- Create: `backend/matrix-custom-status-store.test.ts`

**Interfaces:**
- Produces: `createCustomStatusStore(fetcher, config)` with `get`, `put`, and `reset` scoped by `memberId`, `lottery`, and `status`.

- [ ] **Step 1: Create the fixed migration file**

Create `supabase/migrations/20260821000000_matrix_custom_status_settings.sql` so every implementation worker targets the same ordered migration.

- [ ] **Step 2: Write the migration**

Create `matrix_custom_status_settings` with `member_id uuid references members(id) on delete cascade`, constrained lottery/status text columns, `schema_version integer`, `config jsonb`, timestamps, and primary key `(member_id, lottery, status)`. Enable RLS. Add owner select/insert/update/delete policies by joining `members.auth_user_id = auth.uid()`. Add an `updated_at` trigger using the project's existing timestamp helper.

- [ ] **Step 3: Write failing store tests**

Assert all reads/writes include the exact member/lottery/status scope, `put` performs an upsert without deleting other scopes, `reset` deletes only one scope, and the service-role key never appears in returned values/errors.

- [ ] **Step 4: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-custom-status-store.test.ts`

Expected: FAIL because the store is absent.

- [ ] **Step 5: Implement the store and verify migration syntax**

Use backend-only service-role REST calls and store `schema_version = 1`. Keep validation in Task 2 mandatory before `put`; RLS remains defense in depth.

Run: `npx supabase db lint --local`

Expected: no migration lint errors.

- [ ] **Step 6: Run tests and commit**

Run: `npm run test:unit -- backend/matrix-custom-status-store.test.ts`

Expected: PASS.

```bash
git add supabase/migrations backend/matrix-custom-status-store.ts backend/matrix-custom-status-store.test.ts
git commit -m "feat(db): store custom Matrix status settings"
```

### Task 4: Add Status Summary, Cards, and Custom-Settings APIs

**Files:**
- Create: `backend/matrix-status-service.ts`
- Create: `backend/matrix-status-service.test.ts`
- Create: `backend/matrix-status-routes.test.ts`
- Modify: `backend/index.ts`

**Interfaces:**
- Produces: `resolveMemberStatus(lottery, artifact, member, savedSettings)`.
- Produces: `GET /api/matrix/status/summary` for all four lottery summaries.
- Produces: `GET /api/matrix/status/cards/:lottery` and `POST /api/matrix/status/validation`.
- Produces: `GET`, `PUT`, and `DELETE /api/matrix/status/custom/:lottery/:status`.

- [ ] **Step 1: Write failing service tests**

Assert Chapter 15 applies with no saved setting; active monthly/quarterly/yearly/lifetime settings replace defaults only in their exact scope; expiry preserves but does not apply settings; renewal restores; downgrade/upgrade behavior matches Task 2; summary count equals satisfied custom groups of the highest state; cards use those same groups; and all-false returns DORMANT.

- [ ] **Step 2: Write failing route and authorization tests**

Assert login is required everywhere; free/trial cannot read/write/reset custom settings; monthly cannot save composite; all plan checks are repeated on read/write/reset/apply; validation details obey two-period free visibility versus seven/thirteen locked detail; and incomplete/stale analysis errors use the common error envelope.

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-status-service.test.ts backend/matrix-status-routes.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement service and routes**

Evaluate all four states from one completed artifact and one settings read set. `PUT` validates before upsert. `DELETE` resets only the requested scope by removing its saved override. Summary and cards share the same resolved object so counts cannot diverge. Detail ordering follows type, streak, prediction period, and position.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- backend/matrix-status.test.ts backend/matrix-custom-status.test.ts backend/matrix-custom-status-store.test.ts backend/matrix-status-service.test.ts backend/matrix-status-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/matrix-status-service.ts backend/matrix-status-service.test.ts backend/matrix-status-routes.test.ts backend/index.ts
git commit -m "feat(api): serve member Matrix status"
```

### Task 5: Build the Custom Trigger Settings Page

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/Prototype.tsx`
- Modify: `src/feature-pages.css`
- Modify: `src/prototype.css`
- Modify: `src/matrix-algorithm-api.ts`
- Create: `src/__tests__/MatrixCustomStatusPage.test.tsx`

**Interfaces:**
- Adds: `ScreenId = ... | 'custom-status'`.
- Produces: `fetchCustomStatus`, `saveCustomStatus`, and `resetCustomStatus`.

- [ ] **Step 1: Write failing page tests**

Assert navigation begins on Matrix Status, then opens custom settings. Verify visual order: logo/title, home-style four-lottery switcher, four-state switcher, collapsible one-code/two-code sections with counts, group edit/delete/add, reset, save. Verify independent scope reloads when lottery/state changes.

Add interaction tests for 20-group and 10-row limits, duplicate-row errors, 1–99 quantity, allowed streak lists, locked-code count, two order choices, monthly composite lock, quarterly composite access, unsaved-change confirmation, API field errors, successful save, and reset-to-Chapter-15 confirmation.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- src/__tests__/MatrixCustomStatusPage.test.tsx`

Expected: FAIL because the screen and API methods do not exist.

- [ ] **Step 3: Implement the responsive page**

Follow the supplied screenshot's black/gold Matrix visual direction while using real controls and accessible labels. Keep server data visible during scope refresh. Do not infer triggers in the browser; this page edits settings only.

- [ ] **Step 4: Run UI and width checks**

Run: `npm run test:unit -- src/__tests__/MatrixCustomStatusPage.test.tsx && npm run test:sites`

Expected: PASS, including 390px, 375px, and 360px layouts.

- [ ] **Step 5: Commit**

```bash
git add src/FeaturePages.tsx src/Prototype.tsx src/feature-pages.css src/prototype.css src/matrix-algorithm-api.ts src/__tests__/MatrixCustomStatusPage.test.tsx
git commit -m "feat(pwa): add custom Matrix status settings"
```

### Task 6: Replace Home and Matrix Status Fixtures

**Files:**
- Modify: `src/Prototype.tsx`
- Modify: `src/FeaturePages.tsx`
- Modify: `src/prototype.css`
- Modify: `src/feature-pages.css`
- Create: `src/__tests__/MatrixStatusIntegration.test.tsx`
- Create: `public/assets/lottery/status/dormant.png`

**Interfaces:**
- Consumes: `GET /api/matrix/status/summary`, cards, and validation APIs.

- [ ] **Step 1: Add the approved DORMANT asset**

Copy `/workspace/scratch/374d2965bac4/upload/01-1000018499.png` to `public/assets/lottery/status/dormant.png` without altering the uploaded source.

- [ ] **Step 2: Write failing synchronized-display tests**

Assert home renders the API's highest state and exact trigger-group count; status cards use the same analysis version and trigger groups; one result may appear under multiple statuses; cards sort CRITICAL to ACTIVE and within state by same-code road count; and DORMANT uses the approved asset with no custom-settings action.

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:unit -- src/__tests__/MatrixStatusIntegration.test.tsx`

Expected: FAIL because both pages use fixtures.

- [ ] **Step 4: Connect real summaries/cards/details**

Remove `MATRIX_STATUS_BY_LOTTERY` and hardcoded status roads. Keep the existing layout; render explicit syncing, analyzing, unavailable, API-error, empty, and maintenance states. Lazy-load validation and never synthesize card details.

- [ ] **Step 5: Run integration and responsive tests**

Run: `npm run test:unit -- src/__tests__/MatrixStatusIntegration.test.tsx src/__tests__/MatrixCustomStatusPage.test.tsx && npm run test:sites`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/assets/lottery/status/dormant.png src/Prototype.tsx src/FeaturePages.tsx src/prototype.css src/feature-pages.css src/__tests__/MatrixStatusIntegration.test.tsx
git commit -m "feat(pwa): synchronize Matrix status displays"
```
