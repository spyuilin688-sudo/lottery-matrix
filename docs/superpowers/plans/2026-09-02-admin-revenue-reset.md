# Admin Revenue Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make transfer-request cards compact and mobile-safe, and add a confirmed revenue reset that only super administrators can see and execute without deleting payment records.

**Architecture:** Store one server-only reset timestamp in Supabase through an atomic, monotonic database function. Dashboard revenue queries apply that timestamp as a lower bound and paginate confirmed payments to exhaustion while retaining every payment row. The admin UI reuses the shared confirmation dialog and refreshes the dashboard after the authenticated, server-authorized reset succeeds.

**Tech Stack:** React, TypeScript, Vitest, AppDeploy SDK/client, Supabase Postgres/PostgREST, CSS.

**Spec:** User-approved design in the 2026-09-02 conversation; reset all five displayed revenue totals, preserve payment records, and limit the control to super administrators.

## Global Constraints

- Only change code, styles, tests, database rules, and documentation directly required by this request.
- Preserve existing functions and responsive behavior outside the transfer-request and revenue-reset surfaces.
- Avoid fixed-width text actions and conflicting mobile overrides.
- Enforce super-administrator authorization on the server even when the UI hides the button.
- Require explicit confirmation before executing the reset.

---

### Task 1: Revenue Reset Baseline

**Files:**
- Create: `supabase/migrations/20260902064500_admin_revenue_reset_baseline.sql`
- Create: `supabase/migrations/20260902070030_limit_admin_revenue_settings_privileges.sql`
- Create: `supabase/migrations/20260902071500_admin_revenue_reset_rpc.sql`
- Modify: `apps/admin/backend/admin-data.ts`
- Test: `apps/admin/backend/admin-data.test.ts`
- Test: `apps/admin/backend/admin-writes.test.ts`
- Test: `apps/admin/backend/admin-revenue-reset-migration.test.ts`

**Interfaces:**
- Consumes: confirmed `payments.amount`, `payments.paid_at`, and the existing server-side Supabase transport.
- Produces: `resetRevenue(actor) => Promise<{ resetAt: string }>` and fully paginated dashboard totals filtered to `paid_at >= reset_at`.

- [x] **Step 1: Write failing tests**

```ts
await expect(getDashboard(api, now)).resolves.toMatchObject({ cumulativeRevenue: 80 });
await expect(data.resetRevenue(superActor, now)).resolves.toEqual({ resetAt: now.toISOString() });
```

- [x] **Step 2: Run tests and verify the missing baseline behavior fails**

Run: `npx vitest run apps/admin/backend/admin-data.test.ts apps/admin/backend/admin-writes.test.ts apps/admin/backend/admin-revenue-reset-migration.test.ts`

Expected: FAIL because `resetRevenue`, the lower-bound query, and the migration do not exist.

- [x] **Step 3: Add the singleton baseline table and minimal server implementation**

```sql
create table if not exists public.admin_revenue_settings (
  id smallint primary key default 1 check (id = 1),
  reset_at timestamp with time zone not null
);
alter table public.admin_revenue_settings enable row level security;
revoke all on table public.admin_revenue_settings from public, anon, authenticated;
grant select, insert, update on table public.admin_revenue_settings to service_role;
```

```ts
async function resetRevenue(actor: AdminActor) {
  if (actor.role !== '超級管理員') throw new AdminDataError('僅超級管理員可重設收入', 403);
  const [saved] = await transport.supabaseRequest('rpc/admin_reset_revenue_baseline', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return { resetAt: new Date(saved.reset_at).toISOString() };
}
```

- [x] **Step 4: Run the backend and migration tests**

Expected: PASS, with no payment `DELETE` or `UPDATE` statement.

### Task 2: Authenticated Reset Endpoint

**Files:**
- Modify: `apps/admin/backend/index.ts`
- Test: `apps/admin/backend/index-wiring.test.ts`

**Interfaces:**
- Consumes: authenticated admin identity and `adminData.resetRevenue`.
- Produces: `POST /api/revenue/reset`, returning `{ resetAt }`.

- [x] **Step 1: Write failing route tests**

```ts
expect(routes).toHaveProperty('POST /api/revenue/reset');
await expect(nonSuperGuard(ctx)).resolves.toEqual({ error: '僅超級管理員可重設收入', status: 403 });
```

- [x] **Step 2: Run the test and verify the route is missing**

Expected: FAIL because the reset route is not registered.

- [x] **Step 3: Add the route and dedicated super-admin guard**

```ts
'POST /api/revenue/reset': [requireAuth(), revenueResetGuard, async (ctx) => {
  const admin = await getAdmin(ctx);
  return json(await adminData.resetRevenue(actorOf(admin)));
}],
```

- [x] **Step 4: Run route tests**

Expected: PASS for authentication, non-super rejection, and successful upsert wiring.

### Task 3: Confirmed Super-Admin UI

**Files:**
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/src/admin-operations.css`
- Test: `apps/admin/src/admin-button-styles.test.ts`

**Interfaces:**
- Consumes: `isSuper`, shared `requestConfirmation`, and `POST /api/revenue/reset`.
- Produces: a danger-styled `重設收入` action visible only to super administrators.

- [x] **Step 1: Write failing source-contract tests**

```ts
expect(appSource).toContain('title: "確認重設收入"');
expect(appSource).toContain('await api.post("/api/revenue/reset")');
```

- [x] **Step 2: Add the confirmed action and refresh behavior**

```tsx
{isSuper && <button className="compactButton revenueResetButton" onClick={onReset}>重設收入</button>}
```

The action must show `五項收入將歸零，付款紀錄仍會保留。`, execute only after confirmation, and reload `收入報表` on success.

- [x] **Step 3: Run admin UI tests**

Expected: PASS with the control absent for non-super administrators.

### Task 4: Compact Transfer Requests and Responsive Verification

**Files:**
- Modify: `apps/admin/src/admin-operations.css`
- Test: `apps/admin/src/admin-density.test.ts`
- Modify: `UX-CONTRACT.md`

**Interfaces:**
- Consumes: existing `.transferPanel`, `.transferRow`, and `.rowActions` markup.
- Produces: smaller card padding and horizontally stable text actions at phone widths.

- [x] **Step 1: Write failing responsive CSS tests**

```ts
expect(operationsCss).toMatch(/\.transferPanel \{[^}]*padding: 10px;/);
expect(operationsCss).toMatch(/\.transferRow \.rowActions button \{[^}]*width: auto;[^}]*white-space: nowrap;/);
```

- [x] **Step 2: Add scoped transfer rules**

```css
.transferPanel { margin-top: 10px; padding: 10px; }
.transferRow { gap: 8px; padding: 8px 0; }
.transferRow .rowActions button { width: auto; min-width: 52px; white-space: nowrap; }
@media (max-width: 760px) {
  .transferRow .rowActions { display: flex; flex-wrap: nowrap; }
}
```

- [ ] **Step 3: Run focused tests, full unit tests, type/build checks, and visual responsive verification**

Run the focused Vitest files, `npm run test:unit -- --reporter=dot`, the admin build, and viewport checks at phone and desktop sizes.

- [ ] **Step 4: Apply and verify the Supabase migration, deploy the admin app, and verify health**

Expected: the table has RLS and service-role-only grants; the deployed app is ready with no frontend or backend errors.
