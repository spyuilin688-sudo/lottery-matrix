# Matrix Pro Manual Bank Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓登入會員選擇 Matrix Pro 方案並按下「確定付款」後進入轉帳頁面，提交帳號末五碼，由管理後臺確認後開通或延長方案並建立付款紀錄。

**Architecture:** 沿用既有 Supabase `plans`、`members`、`transfer_requests` 與 `payments`。新增只允許登入會員操作的轉帳申請與付款紀錄 RPC，並把管理後臺確認流程改為由已登入管理員直接呼叫的原子 RPC；前臺新增獨立轉帳頁面，方案頁不顯示銀行資料。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Supabase PostgreSQL/RPC、現有 CSS 響應式系統

**Spec:** `docs/superpowers/specs/2026-08-30-manual-bank-transfer-design.md`

## Global Constraints

- 月方案為 NT$1,880／30 天；季方案為 NT$4,580／90 天；年方案為 NT$16,800／365 天。
- 銀行為「連線銀行」，銀行代碼為 `824`，帳號為 `111023004501`，戶名為「黎小姐」。
- 方案頁不顯示銀行資料；選擇方案並按下「確定付款」後才顯示轉帳頁面。
- 使用者只輸入五位數字的帳號末五碼。
- 提交時間由伺服器產生。
- 同一會員同一時間只允許一筆「待確認」申請。
- 管理後臺確認後才開通或延長方案並建立付款紀錄。
- 手動轉帳不得啟用自動續訂。
- 自動續訂入口保留但不可使用。
- 不改動 LINE 登入、Matrix 演算法、Railway Worker 或舊 AppDeploy 清除工作。
- 所有畫面維持現有手機響應式規則，不使用固定寬度覆蓋現有響應式設定。

---

## File Structure

- `supabase/migrations/20260830060000_manual_bank_transfer.sql`: 方案補齊、待確認唯一限制、會員提交／查詢 RPC、管理員審核 RPC及權限。
- `tests/manual-bank-transfer-rpc-security.test.mjs`: migration 的權限、伺服器時間、唯一待確認及手動續訂契約。
- `src/member-api.ts`: 會員轉帳申請、待確認申請及付款紀錄的型別與 RPC 封裝。
- `src/member-api.test.ts`: 會員 RPC 參數與回傳測試。
- `src/manual-transfer-selection.ts`: 方案頁與轉帳頁之間傳遞已選方案代碼。
- `src/manual-transfer-selection.test.ts`: 已選方案寫入、讀取與無效值測試。
- `src/FeaturePages.tsx`: 方案確認、轉帳頁面、付款紀錄與新畫面路由。
- `src/__tests__/ManualBankTransferPage.test.tsx`: 方案確認後才顯示銀行資料、複製、末五碼及待確認狀態。
- `src/feature-pages.css`: 轉帳頁面手機排版。
- `src/admin/api.ts`: 管理員確認／拒絕 RPC 封裝。
- `src/admin/types.ts`: 審核決定型別。
- `src/admin/AdminTransfers.tsx`: 啟用待確認申請的確認與退回按鈕。
- `src/admin/__tests__/api.test.ts`: 管理員審核 RPC 測試。
- `src/admin/__tests__/AdminTransfers.test.tsx`: 審核按鈕、處理中狀態及重新整理測試。

---

### Task 1: Supabase 手動轉帳資料與 RPC

**Files:**
- Create: `tests/manual-bank-transfer-rpc-security.test.mjs`
- Create: `supabase/migrations/20260830060000_manual_bank_transfer.sql`

**Interfaces:**
- Produces: `member_transfer_request_submit(p_plan_code text, p_account_last_five text) returns jsonb`
- Produces: `member_pending_transfer_request() returns jsonb`
- Produces: `member_payment_history() returns jsonb`
- Produces: `admin_transfer_request_review(p_transfer_id uuid, p_decision text) returns jsonb`
- Plan codes: `month | quarter | year`

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/manual-bank-transfer-rpc-security.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("../supabase/migrations/20260830060000_manual_bank_transfer.sql", import.meta.url);

test("manual transfer RPCs enforce server-owned member, amount and time", async () => {
  const sql = await readFile(path, "utf8");
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /pg_catalog\.now\(\)/);
  assert.match(sql, /select[\s\S]+price[\s\S]+duration_days[\s\S]+from public\.plans/i);
  assert.match(sql, /account_last_five[\s\S]+\^\[0-9\]\{5\}\$/);
  assert.match(sql, /where status = 'pending'/);
  assert.match(sql, /create unique index[\s\S]+transfer_requests[\s\S]+member_id[\s\S]+where status = 'pending'/i);
});

test("manual confirmation keeps auto renewal disabled and writes payment once", async () => {
  const sql = await readFile(path, "utf8");
  assert.match(sql, /auto_renew = false/);
  assert.match(sql, /insert into public\.payments/);
  assert.match(sql, /transfer_request_id/);
  assert.match(sql, /status <> 'pending'/);
});

test("RPC privileges are limited to authenticated users and checked administrators", async () => {
  const sql = await readFile(path, "utf8");
  assert.match(sql, /revoke all on function public\.member_transfer_request_submit[\s\S]+from public, anon/i);
  assert.match(sql, /grant execute on function public\.member_transfer_request_submit[\s\S]+to authenticated/i);
  assert.match(sql, /if not public\.is_admin\(\)/);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
node --test tests/manual-bank-transfer-rpc-security.test.mjs
```

Expected: FAIL with `ENOENT` because the migration does not exist.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260830060000_manual_bank_transfer.sql` with these exact behaviors:

```sql
begin;

insert into public.plans (name, price, duration_days)
values
  ('月費方案', 1880, 30),
  ('季費方案', 4580, 90),
  ('年費方案', 16800, 365)
on conflict (name) do update
set price = excluded.price,
    duration_days = excluded.duration_days;

create unique index if not exists transfer_requests_one_pending_per_member
  on public.transfer_requests (member_id)
  where status = 'pending';

create or replace function public.member_transfer_request_submit(
  p_plan_code text,
  p_account_last_five text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_plan public.plans%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_request jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_account_last_five is null or p_account_last_five !~ '^[0-9]{5}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_LAST_FIVE';
  end if;

  select id into v_member_id
  from public.members
  where auth_user_id = (select auth.uid());

  if v_member_id is null then
    raise exception using errcode = '42501', message = 'MEMBER_REQUIRED';
  end if;

  select * into v_plan
  from public.plans
  where name = case p_plan_code
    when 'month' then '月費方案'
    when 'quarter' then '季費方案'
    when 'year' then '年費方案'
    else null
  end;

  if v_plan.id is null then
    raise exception using errcode = '22023', message = 'INVALID_PLAN';
  end if;

  if exists (
    select 1 from public.transfer_requests
    where member_id = v_member_id and status = 'pending'
  ) then
    raise exception using errcode = '23505', message = 'PENDING_TRANSFER_EXISTS';
  end if;

  insert into public.transfer_requests (
    member_id, plan_id, amount, transferred_at,
    account_last_five, submitted_at, status
  )
  values (
    v_member_id, v_plan.id, v_plan.price, v_now,
    p_account_last_five, v_now, 'pending'
  )
  returning jsonb_build_object(
    'id', id,
    'planName', v_plan.name,
    'amount', amount,
    'accountLastFive', account_last_five,
    'submittedAt', submitted_at,
    'status', status
  ) into v_request;

  return v_request;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'PENDING_TRANSFER_EXISTS';
end;
$$;
```

In the same migration:

- Define `member_pending_transfer_request()` to resolve `auth.uid()`, return only that member's newest `pending` request, and return JSON `null` when none exists.
- Define `member_payment_history()` to resolve `auth.uid()` and return only that member's transfer/payment rows ordered by server time descending.
- Replace the externally callable review path with `admin_transfer_request_review(p_transfer_id, p_decision)`. It must reject unauthenticated callers, require `public.is_admin()`, lock the request and member rows, accept only `confirmed | rejected`, reject non-pending requests, and use `pg_catalog.now()`.
- On confirmation, insert one `payments` row with `transfer_request_id`, extend from `greatest(now(), current expiry)`, and set `auto_renew = false`.
- On rejection, update only the transfer request status and audit record.
- Revoke all four RPCs from `public, anon`; grant execute only to `authenticated`.
- Keep direct client insert/update/delete privileges on `transfer_requests`, `payments`, and `members` revoked.

Finish with:

```sql
commit;
```

- [ ] **Step 4: Run contract and existing Supabase security tests**

Run:

```bash
node --test tests/manual-bank-transfer-rpc-security.test.mjs tests/supabase-rpc-security.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add tests/manual-bank-transfer-rpc-security.test.mjs supabase/migrations/20260830060000_manual_bank_transfer.sql
git commit -m "feat: 新增手動轉帳會員與審核 RPC"
```

---

### Task 2: 會員轉帳 API 與方案選擇傳遞

**Files:**
- Modify: `src/member-api.ts`
- Modify: `src/member-api.test.ts`
- Create: `src/manual-transfer-selection.ts`
- Create: `src/manual-transfer-selection.test.ts`

**Interfaces:**
- Consumes: Task 1 RPCs.
- Produces: `submitTransferRequest(planCode, accountLastFive)`
- Produces: `fetchPendingTransferRequest()`
- Produces: `fetchMemberPaymentHistory()`
- Produces: `saveManualTransferPlan(planCode)`
- Produces: `readManualTransferPlan()`
- Types: `ManualTransferPlanCode = "month" | "quarter" | "year"`, `TransferRequestStatus = "pending" | "confirmed" | "rejected"`

- [ ] **Step 1: Write failing member API tests**

Add tests asserting these exact calls:

```ts
expect(rpc).toHaveBeenCalledWith("member_transfer_request_submit", {
  p_plan_code: "month",
  p_account_last_five: "12345",
});
expect(rpc).toHaveBeenCalledWith("member_pending_transfer_request");
expect(rpc).toHaveBeenCalledWith("member_payment_history");
```

Create selection tests:

```ts
saveManualTransferPlan("year");
expect(readManualTransferPlan()).toBe("year");
sessionStorage.setItem("matrix-manual-transfer-plan", "invalid");
expect(readManualTransferPlan()).toBeNull();
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm run test:unit -- src/member-api.test.ts src/manual-transfer-selection.test.ts
```

Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Add exact types and wrappers**

In `src/member-api.ts` add:

```ts
export type ManualTransferPlanCode = "month" | "quarter" | "year";
export type TransferRequestStatus = "pending" | "confirmed" | "rejected";

export type MemberTransferRequest = {
  id: string;
  planName: string;
  amount: number;
  accountLastFive: string;
  submittedAt: string;
  status: TransferRequestStatus;
};

export type MemberPaymentHistoryItem = {
  id: string;
  planName: string;
  amount: number;
  submittedAt: string;
  status: TransferRequestStatus;
};

export function submitTransferRequest(planCode: ManualTransferPlanCode, accountLastFive: string) {
  return memberRpc<MemberTransferRequest>("member_transfer_request_submit", {
    p_plan_code: planCode,
    p_account_last_five: accountLastFive,
  });
}

export function fetchPendingTransferRequest() {
  return memberRpc<MemberTransferRequest | null>("member_pending_transfer_request");
}

export function fetchMemberPaymentHistory() {
  return memberRpc<MemberPaymentHistoryItem[]>("member_payment_history");
}
```

In `src/manual-transfer-selection.ts`, validate the three permitted values before storing or returning them:

```ts
import type { ManualTransferPlanCode } from "./member-api";

const KEY = "matrix-manual-transfer-plan";
const VALUES = new Set<ManualTransferPlanCode>(["month", "quarter", "year"]);

export function saveManualTransferPlan(value: ManualTransferPlanCode) {
  window.sessionStorage.setItem(KEY, value);
}

export function readManualTransferPlan(): ManualTransferPlanCode | null {
  const value = window.sessionStorage.getItem(KEY);
  return VALUES.has(value as ManualTransferPlanCode)
    ? value as ManualTransferPlanCode
    : null;
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- src/member-api.test.ts src/manual-transfer-selection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/member-api.ts src/member-api.test.ts src/manual-transfer-selection.ts src/manual-transfer-selection.test.ts
git commit -m "feat: 新增會員手動轉帳 API"
```

---

### Task 3: 方案確認、轉帳頁面與付款紀錄

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-pages.css`
- Create: `src/__tests__/ManualBankTransferPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 API and selection helpers.
- Produces: new `ScreenId` value `manual-transfer`.
- Produces: exported `ProPlansPage`, `ManualTransferPage`, and `PaymentHistoryPage` for focused tests.

- [ ] **Step 1: Write failing UI tests**

Create tests covering:

```tsx
render(<ProPlansPage onNavigate={onNavigate} />);
expect(screen.queryByText("111023004501")).not.toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "確定付款" }));
await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("manual-transfer"));

render(<ManualTransferPage onNavigate={onNavigate} />);
expect(screen.getByText("連線銀行")).toBeInTheDocument();
expect(screen.getByText("824")).toBeInTheDocument();
expect(screen.getByText("111023004501")).toBeInTheDocument();
expect(screen.getByText("黎小姐")).toBeInTheDocument();

fireEvent.change(screen.getByLabelText("帳號末五碼"), { target: { value: "12a3456" } });
expect(screen.getByLabelText("帳號末五碼")).toHaveValue("12345");

fireEvent.click(screen.getByRole("button", { name: "提交" }));
await waitFor(() => expect(memberApi.submitTransferRequest).toHaveBeenCalledWith("month", "12345"));
expect(await screen.findByText("待確認")).toBeInTheDocument();
```

Also test:

- Clicking copy calls `navigator.clipboard.writeText("111023004501")`.
- A pending request shows `已有待確認申請` and disables submit.
- A missing selected plan returns to `pro-plans` without displaying bank data.
- Payment history renders plan, amount, system submission time, and status from `fetchMemberPaymentHistory`.
- Auto renewal remains visible, disabled, and does not claim automatic deduction.

- [ ] **Step 2: Run the UI test and verify failure**

Run:

```bash
npm run test:unit -- src/__tests__/ManualBankTransferPage.test.tsx
```

Expected: FAIL because the page and exports do not exist.

- [ ] **Step 3: Implement the plan-to-transfer navigation**

In `ProPlansPage`:

- Add a stable `code` to each existing plan: `month`, `quarter`, `year`.
- Remove the functional auto-renew checkbox state and confirmation handler.
- Render the existing auto-renew area as visible but disabled.
- On `確定付款`, keep the existing confirmation dialog. After confirmation, call `saveManualTransferPlan(selected.code)`, then `onNavigate("manual-transfer")`.
- Do not render bank details anywhere in `ProPlansPage`.

- [ ] **Step 4: Implement `ManualTransferPage`**

Add `"manual-transfer"` to `ScreenId` and route it in `OriginalFeaturePageRouter`.

The page must:

- Read the selected plan with `readManualTransferPlan()`.
- Resolve the exact display values from a local fixed map:

```ts
const manualTransferPlans = {
  month: { name: "月費方案", amount: 1880 },
  quarter: { name: "季費方案", amount: 4580 },
  year: { name: "年費方案", amount: 16800 },
} as const;
```

- Fetch `fetchPendingTransferRequest()` on mount.
- Show selected plan and amount, then bank, code, account with copy button, and account holder.
- Sanitize the input with `value.replace(/\D/g, "").slice(0, 5)`.
- Disable submit unless the value has exactly five digits, while loading, or when a pending request exists.
- On `PENDING_TRANSFER_EXISTS`, refresh the pending request and display `已有待確認申請`.
- On success, replace the form action with the returned `待確認` status.
- Use `ProfileDetailShell` and existing panel/button styles.

- [ ] **Step 5: Replace the payment history placeholder**

Load `fetchMemberPaymentHistory()` and render only returned records. Use exact status labels:

```ts
const labels = {
  pending: "待確認",
  confirmed: "已確認",
  rejected: "已退回",
} as const;
```

Keep `目前沒有付款紀錄。` only when the returned array is empty.

- [ ] **Step 6: Add responsive CSS**

Add selectors scoped under `.manual-transfer-screen`:

```css
.manual-transfer-bank-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.manual-transfer-account {
  min-width: 0;
  overflow-wrap: anywhere;
}

.manual-transfer-copy,
.manual-transfer-submit {
  min-height: 44px;
}

.manual-transfer-last-five {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
```

Do not add a fixed screen width. Reuse existing page padding and card radius.

- [ ] **Step 7: Run UI and regression tests**

Run:

```bash
npm run test:unit -- src/__tests__/ManualBankTransferPage.test.tsx src/__tests__/MemberProfilePage.test.tsx
node --test tests/pro-plans-carousel-peek.test.mjs tests/responsive-feature-pages-request.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/FeaturePages.tsx src/feature-pages.css src/__tests__/ManualBankTransferPage.test.tsx
git commit -m "feat: 新增 Matrix Pro 手動轉帳頁面"
```

---

### Task 4: 管理後臺確認與拒絕

**Files:**
- Modify: `src/admin/types.ts`
- Modify: `src/admin/api.ts`
- Modify: `src/admin/AdminTransfers.tsx`
- Modify: `src/admin/__tests__/api.test.ts`
- Create: `src/admin/__tests__/AdminTransfers.test.tsx`

**Interfaces:**
- Consumes: Task 1 `admin_transfer_request_review`.
- Produces: `reviewTransferRequest(transferId, decision)`.
- Type: `TransferReviewDecision = "confirmed" | "rejected"`.

- [ ] **Step 1: Write failing API and component tests**

API assertion:

```ts
await reviewTransferRequest(transfer.id, "confirmed");
expect(rpc).toHaveBeenCalledWith("admin_transfer_request_review", {
  p_transfer_id: transfer.id,
  p_decision: "confirmed",
});
```

Component assertions:

```tsx
expect(screen.getByRole("button", { name: "確認收款" })).toBeEnabled();
fireEvent.click(screen.getByRole("button", { name: "確認收款" }));
await waitFor(() =>
  expect(adminApi.reviewTransferRequest).toHaveBeenCalledWith(transfer.id, "confirmed")
);
```

Also assert rejected/confirmed records have disabled action buttons and a successful review calls `fetchTransfers` again.

- [ ] **Step 2: Run focused admin tests and verify failure**

Run:

```bash
npm run test:unit -- src/admin/__tests__/api.test.ts src/admin/__tests__/AdminTransfers.test.tsx
```

Expected: FAIL because the review API and enabled actions do not exist.

- [ ] **Step 3: Add the admin API**

In `src/admin/types.ts`:

```ts
export type TransferReviewDecision = "confirmed" | "rejected";
```

In `src/admin/api.ts`:

```ts
export async function reviewTransferRequest(
  transferId: string,
  decision: TransferReviewDecision,
): Promise<TransferRecord> {
  const { data, error } = await getSupabaseClient().rpc("admin_transfer_request_review", {
    p_transfer_id: transferId,
    p_decision: decision,
  });
  if (error) throw error;
  return data as TransferRecord;
}
```

- [ ] **Step 4: Enable actions only for pending records**

Update `AdminTransfers` so table and card layouts share one action component receiving the transfer record.

- `確認收款` sends `confirmed`.
- `退回` sends `rejected`.
- Both buttons are disabled while that record is processing.
- Non-pending records keep both buttons disabled.
- Successful review reloads `fetchTransfers()`.
- Failed review keeps the current list and exposes the existing error state without changing the record locally.

- [ ] **Step 5: Run focused admin tests**

Run:

```bash
npm run test:unit -- src/admin/__tests__/api.test.ts src/admin/__tests__/AdminTransfers.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/admin/types.ts src/admin/api.ts src/admin/AdminTransfers.tsx src/admin/__tests__/api.test.ts src/admin/__tests__/AdminTransfers.test.tsx
git commit -m "feat: 串接後臺轉帳審核"
```

---

### Task 5: 套用資料庫變更與完整驗證

**Files:**
- Verify: all files from Tasks 1–4
- No new source files

**Interfaces:**
- Consumes: completed application and migration.
- Produces: verified feature branch and pull request.

- [ ] **Step 1: Rebase the implementation branch on latest `main`**

Fetch latest `main`, compare touched files, and resolve only conflicts involving this feature. Do not overwrite unrelated changes from other conversations.

- [ ] **Step 2: Run the full local verification**

Run:

```bash
npm run test:unit
node --test tests/*.test.mjs
npm run build:pages
```

Expected: all commands exit 0.

- [ ] **Step 3: Apply the migration to Supabase project `wcimzbbapfrdotjsfyxa`**

Apply `20260830060000_manual_bank_transfer.sql` through the Supabase migration action.

Expected:

- All four RPCs exist.
- Year plan is present with 16,800 and 365 days.
- The partial unique index exists.
- Only authenticated callers can execute member RPCs.
- `admin_transfer_request_review` rejects non-admin authenticated callers.

- [ ] **Step 4: Verify the live data flow**

Using one logged-in test member:

1. Select a plan and press `確定付款`.
2. Confirm the plan page did not expose bank data before navigation.
3. Confirm the transfer page shows the exact bank data.
4. Copy the account and verify `111023004501`.
5. Submit a five-digit suffix.
6. Confirm Supabase recorded server time and `pending`.
7. Attempt a second submission and verify `已有待確認申請`.
8. Confirm the request in admin.
9. Verify one payment row exists, expiry extended by the chosen plan, and `auto_renew = false`.
10. Verify the member payment history displays the confirmed record.
11. Repeat with a new request and reject it; verify no payment row and no expiry change.

- [ ] **Step 5: Run Supabase advisors**

Run security and performance advisors for project `wcimzbbapfrdotjsfyxa`. Resolve only findings introduced by this migration.

- [ ] **Step 6: Verify the deployed mobile presentation**

On the existing PWA deployment at Pixel 10 reference width 390 px:

- Plan carousel remains operable.
- Bank data appears only after `確定付款`.
- Account and copy button fit one row.
- Last-five input and submit button remain fully visible.
- No horizontal overflow is introduced.
- Admin table and mobile cards both expose working review actions.

- [ ] **Step 7: Create the pull request**

Push the implementation branch and create a pull request to `main`. Include:

- Exact files changed.
- Unit, Node, build, Supabase and live browser results.
- Migration name.
- Confirmation that no LINE login, Matrix algorithm, Railway Worker, or AppDeploy removal files changed.

Do not merge until the user explicitly requests merging.
