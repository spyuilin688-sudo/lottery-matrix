# Admin Dashboard and Activation Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected `/admin` dashboard backed by Supabase, plus batch activation-code generation and redemption through the existing 「我的推薦碼/啟動碼」 entry.

**Architecture:** Keep the existing member application and `Prototype` navigation intact. `App.tsx` selects the isolated admin application only when `window.location.pathname` starts with `/admin`; all other paths continue to render `Prototype`. Supabase Auth protects the admin UI, PostgreSQL RLS protects stored records, and security-definer RPC functions perform admin statistics, batch code generation, and atomic code redemption.

**Tech Stack:** React 19, TypeScript, Vite, Supabase Auth, Supabase PostgreSQL, `@supabase/supabase-js`, Vitest, Playwright.

## Global Constraints

- Formal repository: `spyuilin688-sudo/lottery-matrix`, branch `main`.
- Admin route: `/admin`.
- Admin authentication: Supabase Email＋密碼.
- Member-side activation redemption must reuse the existing 「我的推薦碼/啟動碼」 entry in `src/FeaturePages.tsx`.
- Do not add a second activation-code entry.
- Activation durations are exactly 7 days, 15 days, 30 days, 90 days, 365 days, and lifetime.
- Generate exactly 10 codes per batch.
- Each code is 16 uppercase letters/digits displayed as four groups of four characters.
- Each code expires one month after generation and can be redeemed once.
- Active subscriptions extend from the current expiration; expired subscriptions start from redemption time; lifetime redemption sets lifetime access.
- Do not create discount codes.
- Do not connect FastAPI, LINE member import, third-party payments, or refunds in this implementation.
- Do not add a formal annual-plan price because the confirmed specification does not provide one.
- Existing member pages, homepage, Logo, back button, bottom navigation, and lottery switcher remain unchanged except for wiring the existing activation-code confirmation button.
- No demonstration members, transfers, payments, or activation records may be inserted.
- Supabase URL and anon key are deployment environment values and must never be committed.

## File Map

- Modify `package.json`: add Supabase client and Vitest test commands.
- Modify `src/App.tsx`: add the minimal `/admin` route boundary.
- Modify `src/main.tsx`: import isolated admin styles.
- Modify `src/FeaturePages.tsx`: wire the existing activation-code field and confirm button only.
- Create `.env.example`: declare `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Create `src/lib/supabase.ts`: validated singleton Supabase client.
- Create `src/admin/types.ts`: admin and activation domain types.
- Create `src/admin/api.ts`: all Supabase queries and RPC calls.
- Create `src/admin/AdminApp.tsx`: session and admin authorization boundary.
- Create `src/admin/AdminLogin.tsx`: Email＋密碼 login form.
- Create `src/admin/AdminLayout.tsx`: admin navigation and logout.
- Create `src/admin/AdminDashboard.tsx`: overview statistics.
- Create `src/admin/AdminMembers.tsx`: member records.
- Create `src/admin/AdminTransfers.tsx`: transfer review records.
- Create `src/admin/AdminPayments.tsx`: payment records.
- Create `src/admin/AdminActivationCodes.tsx`: batch generation and code records.
- Create `src/admin/admin.css`: isolated responsive admin styles.
- Create `src/activation/redeemActivationCode.ts`: member redemption client.
- Create `supabase/migrations/202608140001_admin_dashboard.sql`: tables, indexes, RLS, policies, functions, and seed plans.
- Create `src/admin/__tests__/api.test.ts`: query/RPC contract tests.
- Create `src/admin/__tests__/AdminApp.test.tsx`: auth and route-state tests.
- Create `src/activation/__tests__/redeemActivationCode.test.ts`: redemption contract tests.
- Create `tests/admin-dashboard.spec.ts`: browser route and responsive tests.

---

### Task 1: Supabase Client and Minimal Admin Route Boundary

**Files:**
- Modify: `package.json`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Create: `.env.example`
- Create: `src/lib/supabase.ts`
- Create: `src/admin/AdminApp.tsx`
- Create: `src/admin/admin.css`
- Test: `src/admin/__tests__/AdminApp.test.tsx`

**Interfaces:**
- Produces: `getSupabaseClient(): SupabaseClient`
- Produces: `hasSupabaseConfig(): boolean`
- Produces: `AdminApp(): JSX.Element`
- Consumes: existing `Prototype` and `MobileRuntime`

- [ ] **Step 1: Add the required dependencies and test script**

Add `@supabase/supabase-js`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom`. Add:

```json
"test:unit": "vitest run"
```

Run: `npm install`  
Expected: `package-lock.json` updates without dependency errors.

- [ ] **Step 2: Write the failing route-boundary test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../AdminApp", () => ({ default: () => <div>admin-root</div> }));
vi.mock("../../Prototype", () => ({ default: () => <div>member-root</div> }));

describe("App route boundary", () => {
  it("renders admin only for /admin", async () => {
    window.history.replaceState({}, "", "/admin");
    const { default: App } = await import("../../App");
    render(<App />);
    expect(screen.getByText("admin-root")).toBeInTheDocument();
    expect(screen.queryByText("member-root")).not.toBeInTheDocument();
  });
});
```

Run: `npm run test:unit -- src/admin/__tests__/AdminApp.test.tsx`  
Expected: FAIL because the admin boundary does not exist.

- [ ] **Step 3: Create the validated Supabase singleton**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
let client: SupabaseClient | null = null;

export function hasSupabaseConfig() {
  return Boolean(url && anonKey);
}

export function getSupabaseClient() {
  if (!url || !anonKey) throw new Error("SUPABASE_CONFIG_MISSING");
  client ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
```

Create `.env.example` with only:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 4: Implement the minimal route boundary**

Update `App.tsx` so `/admin` renders `AdminApp` outside `MobileRuntime`; every other path preserves the existing `MobileRuntime > Prototype` structure.

```tsx
const isAdminPath = window.location.pathname === "/admin" ||
  window.location.pathname.startsWith("/admin/");

if (isAdminPath) return <AdminApp />;
return <MobileRuntime><Prototype /></MobileRuntime>;
```

Import `./admin/admin.css` from `main.tsx`.

- [ ] **Step 5: Run focused tests and production build**

Run: `npm run test:unit -- src/admin/__tests__/AdminApp.test.tsx && npm run build`  
Expected: PASS; production build completes and the member route remains compiled.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example src/App.tsx src/main.tsx src/lib/supabase.ts src/admin/AdminApp.tsx src/admin/admin.css src/admin/__tests__/AdminApp.test.tsx
git commit -m "feat: add isolated admin route foundation"
```

---

### Task 2: Supabase Schema, RLS, Admin Statistics, and Atomic Activation RPCs

**Files:**
- Create: `supabase/migrations/202608140001_admin_dashboard.sql`

**Interfaces:**
- Produces tables: `admin_profiles`, `members`, `plans`, `transfer_requests`, `payments`, `activation_code_batches`, `activation_codes`
- Produces RPC: `is_admin() returns boolean`
- Produces RPC: `admin_dashboard_stats() returns jsonb`
- Produces RPC: `generate_activation_code_batch(p_duration_type text) returns setof activation_codes`
- Produces RPC: `redeem_activation_code(p_code text) returns jsonb`

- [ ] **Step 1: Write the migration with exact constraints**

Create UUID primary keys, UTC timestamps, foreign keys, indexes, and these checks:

```sql
check (duration_type in ('7_days','15_days','30_days','90_days','365_days','lifetime'))
check (status in ('pending','confirmed','rejected'))
check (code ~ '^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$')
unique (code)
```

Represent lifetime membership with `members.is_lifetime boolean not null default false`; `plan_expires_at` remains nullable only when `is_lifetime = true`.

- [ ] **Step 2: Seed only confirmed paid plans**

Insert exactly:

```sql
insert into public.plans (name, price, duration_days)
values ('月費方案', 1880, 30), ('季費方案', 4580, 90);
```

Do not insert an annual paid-plan price.

- [ ] **Step 3: Enable RLS and admin-only read policies**

Enable RLS on all seven tables. Define `is_admin()` as a stable security-definer lookup of `auth.uid()` in `admin_profiles`. Add select policies using `public.is_admin()` for admin tables; members may select their own `members` record using `auth_user_id = auth.uid()`.

- [ ] **Step 4: Add admin statistics RPC**

Return keys exactly matching:

```json
{
  "total_members": 0,
  "today_members": 0,
  "paid_members": 0,
  "active_members": 0,
  "expired_members": 0,
  "today_confirmed_amount": 0,
  "month_confirmed_amount": 0,
  "lifetime_confirmed_amount": 0
}
```

The function must reject non-admin callers before reading data.

- [ ] **Step 5: Add batch generation RPC**

Validate `p_duration_type` against the six confirmed values, require `is_admin()`, create one batch with `quantity = 10`, and loop until 10 unique codes are inserted. Build each code from uppercase letters and digits and store the formatted four-by-four value. Set `expires_at = created_at + interval '1 month'`.

- [ ] **Step 6: Add atomic redemption RPC**

Normalize input with `upper(trim(p_code))`. Lock the matching unused record `for update`; reject missing, used, or expired codes. Lock the caller's member record. For non-lifetime codes, calculate the base as `greatest(coalesce(plan_expires_at, now()), now())` and add 7, 15, 30, 90, or 365 days. For lifetime, set `is_lifetime = true` and `plan_expires_at = null`. Mark the code used with `redeemed_by_member_id` and `redeemed_at` in the same transaction.

- [ ] **Step 7: Validate the migration in Supabase SQL Editor**

Run the complete migration in a new Supabase project.  
Expected: all tables, policies, indexes, and four RPC functions are created; unauthenticated table reads return no rows; non-admin batch generation is rejected.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202608140001_admin_dashboard.sql
git commit -m "feat: add admin and activation database schema"
```

---

### Task 3: Admin Email Login and Authorization Boundary

**Files:**
- Modify: `src/admin/AdminApp.tsx`
- Create: `src/admin/AdminLogin.tsx`
- Test: `src/admin/__tests__/AdminApp.test.tsx`

**Interfaces:**
- Consumes: `getSupabaseClient()`, Supabase `auth.getSession()`, `auth.onAuthStateChange()`, RPC `is_admin`
- Produces: authenticated admin state passed to `AdminLayout`

- [ ] **Step 1: Write failing auth-state tests**

Test all four states with mocked Supabase responses:

```tsx
it.each([
  ["missing-config", "config-missing"],
  ["no-session", "login"],
  ["session-without-admin", "forbidden"],
  ["admin-session", "admin-layout"],
])("renders %s state", async (_name, expectedTestId) => {
  render(<AdminApp />);
  expect(await screen.findByTestId(expectedTestId)).toBeInTheDocument();
});
```

Run: `npm run test:unit -- src/admin/__tests__/AdminApp.test.tsx`  
Expected: FAIL because authorization states are not implemented.

- [ ] **Step 2: Implement login form behavior**

`AdminLogin` owns `email`, `password`, and `submitting`. Submit:

```ts
await getSupabaseClient().auth.signInWithPassword({ email, password });
```

Use `type="email"`, `type="password"`, required fields, a 48px submit button, and a non-copy-specific `role="alert"` state container keyed by `data-error-code`. Do not invent permanent product wording for unconfirmed error messages.

- [ ] **Step 3: Implement session and admin checks**

Subscribe once to `onAuthStateChange`, call `getSession()` on mount, then call `rpc("is_admin")`. Render records only when both a session and `is_admin = true` exist. On forbidden state, call `auth.signOut()` before returning to login state.

- [ ] **Step 4: Create the first administrator**

In Supabase Authentication, create the administrator Email＋密碼 account. Insert its Auth UUID into `admin_profiles.user_id`. Do not store the Email or password in GitHub.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- src/admin/__tests__/AdminApp.test.tsx`  
Expected: PASS for missing config, logged out, forbidden, and authorized states.

- [ ] **Step 6: Commit**

```bash
git add src/admin/AdminApp.tsx src/admin/AdminLogin.tsx src/admin/__tests__/AdminApp.test.tsx
git commit -m "feat: protect admin with Supabase email login"
```

---

### Task 4: Typed Admin Data Layer

**Files:**
- Create: `src/admin/types.ts`
- Create: `src/admin/api.ts`
- Create: `src/admin/__tests__/api.test.ts`

**Interfaces:**
- Produces types: `AdminSection`, `DashboardStats`, `MemberRecord`, `TransferRecord`, `PaymentRecord`, `ActivationCodeRecord`, `ActivationDuration`
- Produces functions: `fetchDashboardStats()`, `fetchMembers()`, `fetchTransfers()`, `fetchPayments()`, `fetchActivationCodes()`, `generateActivationCodes(duration)`

- [ ] **Step 1: Define exact domain types**

```ts
export type AdminSection = "dashboard" | "members" | "transfers" | "payments" | "activation-codes";
export type ActivationDuration = "7_days" | "15_days" | "30_days" | "90_days" | "365_days" | "lifetime";
export type DashboardStats = {
  total_members: number;
  today_members: number;
  paid_members: number;
  active_members: number;
  expired_members: number;
  today_confirmed_amount: number;
  month_confirmed_amount: number;
  lifetime_confirmed_amount: number;
};
```

Define record fields one-to-one with the migration; do not add display-only persisted fields.

- [ ] **Step 2: Write failing API contract tests**

Mock `getSupabaseClient()` and assert:

```ts
expect(client.rpc).toHaveBeenCalledWith("admin_dashboard_stats");
expect(client.from).toHaveBeenCalledWith("members");
expect(client.rpc).toHaveBeenCalledWith("generate_activation_code_batch", {
  p_duration_type: "30_days",
});
```

Run: `npm run test:unit -- src/admin/__tests__/api.test.ts`  
Expected: FAIL because `api.ts` does not exist.

- [ ] **Step 3: Implement query functions**

Each function returns `data` on success and throws the Supabase `error` on failure. Order members by `registered_at desc`, transfers by `submitted_at desc`, payments by `paid_at desc`, and activation codes by `created_at desc`.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/admin/__tests__/api.test.ts`  
Expected: PASS with exact table and RPC names.

- [ ] **Step 5: Commit**

```bash
git add src/admin/types.ts src/admin/api.ts src/admin/__tests__/api.test.ts
git commit -m "feat: add typed admin data access"
```

---

### Task 5: Admin Layout and Overview Dashboard

**Files:**
- Create: `src/admin/AdminLayout.tsx`
- Create: `src/admin/AdminDashboard.tsx`
- Modify: `src/admin/AdminApp.tsx`
- Modify: `src/admin/admin.css`
- Test: `src/admin/__tests__/AdminApp.test.tsx`

**Interfaces:**
- Consumes: `AdminSection`, `fetchDashboardStats()`
- Produces: navigation among five admin sections and logout action

- [ ] **Step 1: Write the failing dashboard test**

Mock `fetchDashboardStats()` with eight numeric values. Assert the eight confirmed labels and formatted amounts render, and assert logout calls `auth.signOut()`.

- [ ] **Step 2: Implement admin navigation**

Create five entries only:

```ts
[
  ["dashboard", "總覽"],
  ["members", "會員管理"],
  ["transfers", "轉帳審核"],
  ["payments", "付款紀錄"],
  ["activation-codes", "啟動碼管理"],
]
```

Use React state inside `AdminLayout`; do not add React Router.

- [ ] **Step 3: Implement overview cards**

Fetch once on entry and render exactly the eight confirmed statistics. Use `Intl.NumberFormat("zh-TW")` for counts and amounts. Empty statistics remain numeric zero; do not insert sample data.

- [ ] **Step 4: Add isolated responsive styles**

Scope every selector under `.admin-app`. Desktop uses a left navigation and content grid; widths below 720px use a top navigation and single-column cards. Do not reuse or override `.home-*`, `.brand-header`, `.bottom-navigation`, or member page selectors.

- [ ] **Step 5: Run tests and build**

Run: `npm run test:unit -- src/admin/__tests__/AdminApp.test.tsx && npm run build`  
Expected: PASS; no TypeScript or CSS build errors.

- [ ] **Step 6: Commit**

```bash
git add src/admin/AdminLayout.tsx src/admin/AdminDashboard.tsx src/admin/AdminApp.tsx src/admin/admin.css src/admin/__tests__/AdminApp.test.tsx
git commit -m "feat: add admin overview dashboard"
```

---

### Task 6: Members, Transfers, and Payments Screens

**Files:**
- Create: `src/admin/AdminMembers.tsx`
- Create: `src/admin/AdminTransfers.tsx`
- Create: `src/admin/AdminPayments.tsx`
- Modify: `src/admin/AdminLayout.tsx`
- Modify: `src/admin/admin.css`
- Test: `src/admin/__tests__/AdminApp.test.tsx`

**Interfaces:**
- Consumes: `fetchMembers()`, `fetchTransfers()`, `fetchPayments()`
- Produces: read-only records for the three confirmed sections

- [ ] **Step 1: Write failing rendering tests**

Provide one complete mocked record per screen and assert every confirmed field renders. Also provide `[]` and assert the screen renders an empty `data-state="empty"` container without creating fake rows.

- [ ] **Step 2: Implement members screen**

Desktop table columns: member ID, LINE identification, registration date, current plan, plan start, plan expiry, member status, payment record count, referral code, invitation code. Mobile renders the same fields in record cards.

- [ ] **Step 3: Implement transfer review screen**

Render member, plan, amount, transfer time, account last five digits, submission time, status, confirm button, and reject button. In this phase buttons are disabled because automatic confirmation and membership activation are outside the confirmed implementation scope; do not issue update queries.

- [ ] **Step 4: Implement payment records screen**

Render order ID, member, plan, amount, payment time, and payment status. Keep it read-only.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- src/admin/__tests__/AdminApp.test.tsx`  
Expected: PASS for populated and empty states.

- [ ] **Step 6: Commit**

```bash
git add src/admin/AdminMembers.tsx src/admin/AdminTransfers.tsx src/admin/AdminPayments.tsx src/admin/AdminLayout.tsx src/admin/admin.css src/admin/__tests__/AdminApp.test.tsx
git commit -m "feat: add admin member and payment records"
```

---

### Task 7: Activation-Code Batch Management

**Files:**
- Create: `src/admin/AdminActivationCodes.tsx`
- Modify: `src/admin/AdminLayout.tsx`
- Modify: `src/admin/admin.css`
- Test: `src/admin/__tests__/AdminApp.test.tsx`

**Interfaces:**
- Consumes: `fetchActivationCodes()`, `generateActivationCodes(duration)`
- Produces: exactly 10 one-time codes per generation action

- [ ] **Step 1: Write failing generation tests**

For each duration option, choose it and submit. Assert `generateActivationCodes` receives the exact enum. Mock 10 returned records and assert all 10 appear. Assert no amount or discount control exists.

- [ ] **Step 2: Implement duration selection**

Render six options only: 7天, 15天, 月, 季, 年, 終生. The generate button calls the RPC once; quantity is not editable and is displayed as 10.

- [ ] **Step 3: Implement code records**

Render code, duration, created time, expiration time, usage status, redeemed member, and redeemed time. Do not add copy, export, revoke, delete, edit, or custom-quantity actions because they are not in the confirmed specification.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/admin/__tests__/AdminApp.test.tsx`  
Expected: PASS; one action produces exactly the 10 RPC-returned records.

- [ ] **Step 5: Commit**

```bash
git add src/admin/AdminActivationCodes.tsx src/admin/AdminLayout.tsx src/admin/admin.css src/admin/__tests__/AdminApp.test.tsx
git commit -m "feat: add activation code batch management"
```

---

### Task 8: Wire the Existing Member Activation-Code Entry

**Files:**
- Create: `src/activation/redeemActivationCode.ts`
- Create: `src/activation/__tests__/redeemActivationCode.test.ts`
- Modify: `src/FeaturePages.tsx`

**Interfaces:**
- Produces: `redeemActivationCode(code: string): Promise<ActivationRedemptionResult>`
- Consumes: existing `ActivationCodePage` input, existing confirm button, RPC `redeem_activation_code`

- [ ] **Step 1: Write failing redemption contract tests**

```ts
it("normalizes and submits the existing activation code", async () => {
  await redeemActivationCode("a7k9-p2xm-4q8r-n6ty");
  expect(client.rpc).toHaveBeenCalledWith("redeem_activation_code", {
    p_code: "A7K9-P2XM-4Q8R-N6TY",
  });
});
```

Also assert empty input rejects locally without an RPC call.

Run: `npm run test:unit -- src/activation/__tests__/redeemActivationCode.test.ts`  
Expected: FAIL because the redemption client does not exist.

- [ ] **Step 2: Implement redemption client**

Trim, uppercase, and validate `/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/`. Call the RPC and return its typed result. Throw stable internal error codes for invalid format and Supabase failures; do not add unconfirmed permanent user-facing copy.

- [ ] **Step 3: Wire only the existing confirm button**

In the existing `ActivationCodePage`, add `submitting` and `resultState`. Replace the inert existing confirm button with `onClick={handleActivation}`. Keep the current menu entry, panel, input, instructions, title, layout, and all referral sections unchanged.

- [ ] **Step 4: Verify duration behavior against the database**

Use one test member for each case in Supabase:

1. Expired member + 7-day code → expiry equals redemption time plus 7 days.
2. Active member + 15-day code → expiry equals old expiry plus 15 days.
3. Active member + lifetime code → `is_lifetime = true`, expiry null.
4. Reuse an already redeemed code → rejected with no member change.
5. Use a code older than one month → rejected with no member change.

- [ ] **Step 5: Run tests and build**

Run: `npm run test:unit -- src/activation/__tests__/redeemActivationCode.test.ts && npm run build`  
Expected: PASS; existing member application still builds.

- [ ] **Step 6: Commit**

```bash
git add src/activation/redeemActivationCode.ts src/activation/__tests__/redeemActivationCode.test.ts src/FeaturePages.tsx
git commit -m "feat: connect existing activation code redemption"
```

---

### Task 9: End-to-End Verification and Deployment Configuration

**Files:**
- Create: `tests/admin-dashboard.spec.ts`
- Modify: deployment environment only; do not commit secrets

**Interfaces:**
- Consumes: completed `/admin`, Supabase project, administrator account, existing member activation entry
- Produces: verified desktop/mobile admin and unchanged member route

- [ ] **Step 1: Write browser tests**

Cover:

```ts
test("unauthenticated admin route shows login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("member home remains available", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("首頁彩種切換元件預覽")).toBeVisible();
});
```

Add authenticated tests using deployment-only admin credentials for the five admin navigation entries and one 390px-wide mobile viewport check.

- [ ] **Step 2: Configure environment variables**

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the deployment environment. Do not use the Supabase service-role key in the browser build.

- [ ] **Step 3: Run the complete verification suite**

Run:

```bash
npm run test:unit
npm run test:runtime
npm run test:sites
npm run build
npm run validate:artifact
```

Expected: all commands exit 0.

- [ ] **Step 4: Verify database access boundaries**

Confirm:

- anonymous callers cannot read admin tables;
- authenticated non-admin members cannot open admin records;
- admin can read all five admin sections;
- code generation is admin-only;
- code redemption only changes the signed-in member;
- code redemption is atomic and single-use.

- [ ] **Step 5: Verify responsive layout**

At 390px width, confirm no table or card overlaps, no horizontal page overflow, and all admin actions remain tappable. At desktop width, confirm navigation and data columns remain readable.

- [ ] **Step 6: Deploy and verify the current online site**

Deploy the same `main` source to the current Sites project. Verify deployment status succeeds and the deployed version includes the two environment variable names.

- [ ] **Step 7: Commit final verification**

```bash
git add tests/admin-dashboard.spec.ts
git commit -m "test: verify admin dashboard and activation flow"
```
