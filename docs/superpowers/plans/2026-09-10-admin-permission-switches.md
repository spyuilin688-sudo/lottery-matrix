# Admin Permission Switches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the two existing Matrix permission switches into a native, role-protected administrator menu and safely retire the standalone updater after production verification.

**Architecture:** The admin UI calls authenticated routes in the canonical Supabase `admin-api`. Reads reuse `matrix_permission_settings()`; writes use a new service-role-only RPC that revalidates the active super administrator and the optimistic revision while keeping the private settings table and all PWA consumers unchanged. The legacy token updater is removed only in a second cutover after the new path is proven in production.

**Tech Stack:** React 19, TypeScript, Vitest/Testing Library, Supabase Edge Functions, PostgREST RPC, PostgreSQL/PGlite, Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-09-10-admin-permission-switches-design.md`

## Global Constraints

- The menu label is exactly `權限切換`.
- All active administrator roles may read; only `超級管理員` may write.
- Preserve `subscriptionPurchaseVisible`, `registeredMemberFreeAccess`, `revision`, and `updatedAt` exactly.
- Preserve all current PWA purchase-visibility and entitlement behavior.
- Never expose the Supabase service role or legacy management token to the browser.
- Use only exact, directly related test files; never run the full suite.
- Retire the legacy updater only after the native production path is verified.

---

### Task 1: Record the approved contract

**Files:**
- Create: `docs/superpowers/specs/2026-09-10-admin-permission-switches-design.md`
- Create: `docs/superpowers/plans/2026-09-10-admin-permission-switches.md`
- Modify: `UX-CONTRACT.md`
- Modify: `apps/admin/DESIGN.md`

**Interfaces:**
- Consumes: the two existing permission-setting keys and the current administrator role model.
- Produces: the durable navigation, authorization, confirmation, conflict, responsive, and two-stage cutover contract.

- [ ] **Step 1: Update the UX contract**

Replace the standalone-site ownership sentence with the native admin route, all-role read, super-admin write, app-owned confirmation, revision refresh, and two-stage retirement behavior.

- [ ] **Step 2: Update the admin design context**

Add `Permission Switches` to the component ownership table with `PermissionSwitches.tsx` and `permission-switches.css` as owners, and document the compact 760px responsive row.

- [ ] **Step 3: Review the document diff**

Run: `git diff -- UX-CONTRACT.md apps/admin/DESIGN.md docs/superpowers/specs/2026-09-10-admin-permission-switches-design.md docs/superpowers/plans/2026-09-10-admin-permission-switches.md`

Expected: only the approved permission-switch migration contract is changed.

- [ ] **Step 4: Commit**

```bash
git add UX-CONTRACT.md apps/admin/DESIGN.md docs/superpowers/specs/2026-09-10-admin-permission-switches-design.md docs/superpowers/plans/2026-09-10-admin-permission-switches.md
git commit -m "docs: design admin permission switch migration"
```

### Task 2: Add the service-role-only database mutation

**Files:**
- Create: `supabase/migrations/<generated>_admin_matrix_permission_settings.sql`
- Modify: `scripts/tests/permission-switches.test.mjs`

**Interfaces:**
- Consumes: `public.admin_accounts`, `private.matrix_permission_settings`, and `{key,value,expectedRevision}`.
- Produces: `public.admin_matrix_permission_settings_update(p_admin_id uuid, p_change jsonb) returns jsonb`.

- [ ] **Step 1: Create the migration with the current CLI**

Run: `npx supabase --help` and then `npx supabase migration new admin_matrix_permission_settings`.

Expected: one timestamped empty migration file under `supabase/migrations/`.

- [ ] **Step 2: Write the failing PGlite assertions**

Extend the existing exact test so it loads the generated migration and asserts that `anon` and `authenticated` cannot execute the new RPC, a non-super or disabled actor is rejected, service role can update one key, and a stale revision raises `SETTINGS_CONFLICT`.

- [ ] **Step 3: Verify RED**

Run: `node --test scripts/tests/permission-switches.test.mjs`

Expected: FAIL because `admin_matrix_permission_settings_update` does not exist.

- [ ] **Step 4: Implement the minimal SQL**

Create a `SECURITY DEFINER` function with `set search_path=''`, an explicit service-role JWT claim check, an active super-admin lookup, exact JSON validation, `FOR UPDATE`, revision comparison, one-key update, explicit revokes from `PUBLIC`, `anon`, `authenticated`, and a grant only to `service_role`.

- [ ] **Step 5: Verify GREEN**

Run: `node --test scripts/tests/permission-switches.test.mjs`

Expected: PASS, including all existing entitlement and independence assertions.

### Task 3: Add the canonical backend adapter and routes

**Files:**
- Create: `apps/admin/backend/permission-settings.ts`
- Create: `apps/admin/backend/permission-settings.test.ts`
- Modify: `apps/admin/backend/index.ts`
- Modify: `apps/admin/backend/index-wiring.test.ts`
- Modify: `apps/admin/backend/supabase.ts`
- Modify: `apps/admin/backend/supabase.test.ts`

**Interfaces:**
- Consumes: `supabase.supabaseRequest`, the authenticated `ctx.admin.id`, URL key, `value`, and `expectedRevision`.
- Produces: `createPermissionSettings(transport)` with `get()` and `update(actorId, key, value, expectedRevision)` plus `GET /api/permission-settings` and `PUT /api/permission-settings/:key`.

- [ ] **Step 1: Write adapter and response-validation tests**

Assert exact setting DTO parsing, RPC paths/bodies, rejection of malformed upstream payloads, unknown keys, non-boolean values, and invalid revisions.

- [ ] **Step 2: Verify adapter RED**

Run: `npx vitest run apps/admin/backend/permission-settings.test.ts`

Expected: FAIL because the adapter module does not exist.

- [ ] **Step 3: Implement the adapter**

Add strict `MatrixPermissionSettings` parsing and the two calls:

```ts
supabaseRequest('rpc/matrix_permission_settings', { method: 'POST', body: '{}' })
supabaseRequest('rpc/admin_matrix_permission_settings_update', {
  method: 'POST',
  body: JSON.stringify({ p_admin_id: actorId, p_change: { key, value, expectedRevision } }),
})
```

- [ ] **Step 4: Write route authorization tests**

Assert GET uses `sessionGuard`, PUT uses `sessionGuard` plus a super-role guard, the client cannot override the actor ID, invalid bodies do not call Supabase, and the update result is returned.

- [ ] **Step 5: Verify route RED**

Run: `npx vitest run apps/admin/backend/index-wiring.test.ts`

Expected: FAIL because the permission-setting routes are absent.

- [ ] **Step 6: Implement routes and exact domain errors**

Wire the adapter in `index.ts`. Extend `supabase.ts` so only exact errors from `admin_matrix_permission_settings_update` preserve 400/403/409; unknown database text remains a redacted 503.

- [ ] **Step 7: Verify GREEN**

Run: `npx vitest run apps/admin/backend/permission-settings.test.ts apps/admin/backend/index-wiring.test.ts apps/admin/backend/supabase.test.ts`

Expected: PASS.

### Task 4: Build the permission-switch workspace test-first

**Files:**
- Create: `apps/admin/src/PermissionSwitches.tsx`
- Create: `apps/admin/src/permission-switches.css`
- Create: `apps/admin/src/permission-switches.test.tsx`

**Interfaces:**
- Consumes: a client with `get('/api/permission-settings')` and `put('/api/permission-settings/:key', body)`, `canEdit`, and the existing async confirmation callback.
- Produces: an accessible loading/error/read-only/editable two-switch section.

- [ ] **Step 1: Write failing component tests**

Cover initial load, read failure and retry, all-role read-only controls, super-admin confirmation/cancel, successful one-key update, busy duplicate prevention, and failed/conflicting update refresh.

- [ ] **Step 2: Verify component RED**

Run: `npx vitest run apps/admin/src/permission-switches.test.tsx`

Expected: FAIL because `PermissionSwitches` does not exist.

- [ ] **Step 3: Implement the component**

Use controlled native checkboxes with `role="switch"`, the exact two labels, persistent status/alert feedback, one in-flight mutation, confirmation before write, and a fresh GET after failed writes.

- [ ] **Step 4: Add scoped responsive styling**

Use existing admin colors and radii, a maximum 720px content width, visible focus, disabled/busy states, 44px switch hit area, natural wrapping, and a single-column layout below 760px.

- [ ] **Step 5: Verify GREEN**

Run: `npx vitest run apps/admin/src/permission-switches.test.tsx`

Expected: PASS.

### Task 5: Wire the independent navigation item

**Files:**
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/src/admin-permissions-app.test.tsx`

**Interfaces:**
- Consumes: `PermissionSwitches`, current `admin.role`, and `requestConfirmation`.
- Produces: the `權限切換` sidebar item for all roles and native page rendering with `canEdit={admin.role === '超級管理員'}`.

- [ ] **Step 1: Add failing app-level tests**

Assert the menu exists for super, operations, and viewer roles; the component receives editable behavior only for super; and navigation invokes `/api/permission-settings` without loading unrelated data tables.

- [ ] **Step 2: Verify app RED**

Run: `npx vitest run apps/admin/src/admin-permissions-app.test.tsx`

Expected: FAIL because the menu is absent.

- [ ] **Step 3: Wire the menu and page**

Add the Lucide toggle icon, import the component, add the module entry, keep `load('權限切換')` local-data-free, and render the component with the canonical confirmation callback.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run apps/admin/src/admin-permissions-app.test.tsx apps/admin/src/permission-switches.test.tsx apps/admin/src/admin-confirmation.test.ts`

Expected: PASS.

### Task 6: Verify and ship the native path

**Files:**
- Review all files changed by Tasks 1–5.

**Interfaces:**
- Consumes: the integrated migration, backend, Edge adapter, and admin UI.
- Produces: a conflict-free PR with focused verification evidence.

- [ ] **Step 1: Run focused verification**

```bash
node --test scripts/tests/permission-switches.test.mjs
npx vitest run apps/admin/backend/permission-settings.test.ts apps/admin/backend/index-wiring.test.ts apps/admin/backend/supabase.test.ts apps/admin/src/permission-switches.test.tsx apps/admin/src/admin-permissions-app.test.tsx apps/admin/src/admin-confirmation.test.ts
npx tsc --noEmit -p apps/admin/tsconfig.json
npm run build:admin:pages
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the premium static audit**

Run: `python /root/.codex/plugins/cache/openai-curated-remote/frontend-design-premium/1.4.0/skills/frontend-design-premium/scripts/audit_project.py apps/admin --mode strict --no-write`

Expected: no blocking finding caused by the changed permission-switch workflow.

- [ ] **Step 3: Inspect the final diff**

Search changed code for browser-native dialogs, client secrets, non-semantic click targets, missing error/loading states, and unrelated changes. Compare against `main` and resolve any conflicts before creating the PR.

- [ ] **Step 4: Create and merge PR 1**

Create the GitHub branch from the latest `main`, commit only the changed files, open the PR, wait for required checks, verify no merge conflict and no new review blocker, then squash-merge with the expected head SHA.

- [ ] **Step 5: Verify production**

Confirm the Supabase migration and Edge Function version, Cloudflare Pages deployment, admin GET/update/403 behavior through authenticated browser sessions, and PWA reflection of both switches.

### Task 7: Retire the legacy updater after cutover

**Files:**
- Create: `supabase/migrations/<generated>_retire_legacy_matrix_permission_site.sql`
- Modify: `scripts/tests/permission-switches.test.mjs`

**Interfaces:**
- Consumes: the verified native admin updater.
- Produces: removal of `public.matrix_permission_settings_update(jsonb)` and `private.matrix_permission_credentials`.

- [ ] **Step 1: Add a failing legacy-retirement assertion**

Assert the legacy token update function and credential table no longer exist after the retirement migration, while public read and the native admin update still work.

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/tests/permission-switches.test.mjs`

Expected: FAIL while the legacy objects still exist.

- [ ] **Step 3: Generate and implement the retirement migration**

Use `npx supabase migration new retire_legacy_matrix_permission_site`, then drop the legacy function and credential table with explicit object names; do not touch the settings table or public read RPC.

- [ ] **Step 4: Verify GREEN and merge PR 2**

Run the exact database and backend permission tests, create the follow-up PR from the then-current `main`, inspect conflicts and CI, and merge only after success.

- [ ] **Step 5: Retire the Sites surface**

Keep it owner-only, remove its now-unused management secret when supported, and publish a no-control retirement notice if deletion/unpublishing is unavailable. Verify the old URL cannot mutate settings.
