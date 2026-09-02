# 個人頁面與推薦碼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成會員推薦碼實作，以及已確認的個人頁面、啟動碼、聯絡頁、會員方案與更新紀錄調整。

**Architecture:** 推薦碼以兩個僅限登入會員的 Supabase RPC 提供：摘要 RPC 建立與讀取本人推薦碼及成功人數，提交 RPC 在資料庫交易中驗證與寫入一次性的邀請關係。前端只透過 `member-api.ts` 呼叫 RPC；頁面與樣式維持現有 FeaturePages 與 mobile layout polish 的責任分界。

**Tech Stack:** React、TypeScript、Vitest、Supabase Postgres migration／RPC、既有 CSS。

**Spec:** `docs/superpowers/specs/2026-09-02-profile-referral-and-member-pages-design.md`

## Global Constraints

- 推薦碼僅限尚無 `payments.status = 'confirmed'` 紀錄的有效 LINE 會員輸入一次。
- 啟動碼維持付款後仍可填寫與使用，不套用推薦碼付款前限制。
- 推薦成功人數只依既有 `payments.status = 'confirmed'` 規則計算；不新增付款、退款或訂閱流程。
- 版面維持 320px 至 430px 流式響應；不得以固定裝置寬度處理。
- 只修改此規格直接相關的元件、樣式、RPC 與測試。

---

## File Structure

- `src/member-api.ts`：會員端推薦碼 RPC 型別與呼叫封裝。
- `src/member-api.test.ts`：推薦碼 RPC 呼叫、參數與失敗傳遞測試。
- `supabase/migrations/*_member_referral_rpc.sql`：由 Supabase CLI 建立的推薦碼唯一性、摘要 RPC 與一次提交 RPC。
- `apps/admin/backend/member-referral-migration.test.ts`：migration 的驗證、鎖定與權限靜態契約。
- `src/FeaturePages.tsx`：推薦碼載入／提交狀態、個人選單、合併後聯絡頁、更新紀錄頁。
- `src/feature-pages.css`：推薦碼與聯絡頁的元件樣式。
- `src/mobile-layout-polish.css`：會員方案最終間距與訂閱卡小型控制項樣式。
- `src/__tests__/ActivationCodePage.test.tsx`：推薦碼畫面的載入、提交、錯誤與啟動碼不受付款限制測試。
- `src/__tests__/MemberProfilePage.test.tsx`：個人選單移動與合併聯絡入口測試。
- `src/__tests__/profile-detail-pages.test.tsx`：聯絡頁三卡與空更新紀錄頁測試。
- `src/__tests__/pro-plans-layout-refinement.test.ts`：17px／16px 方案間距、粗體文字與勾選框樣式測試。

### Task 1: 建立會員端推薦碼 RPC 契約

**Files:**
- Modify: `src/member-api.ts`
- Modify: `src/member-api.test.ts`

**Interfaces:**
- Produces: `MemberReferralSummary`、`fetchMemberReferralSummary()`、`submitMemberReferralCode(referralCode)`。
- Consumes: 既有私有 `memberRpc<T>()` 與 Supabase `rpc()` client。

- [ ] **Step 1: 寫入失敗的 RPC 呼叫測試**

```ts
await fetchMemberReferralSummary();
await submitMemberReferralCode(' abc123 ');

expect(supabase.rpc.mock.calls).toEqual([
  ['member_referral_summary'],
  ['member_referral_submit', { p_referral_code: ' abc123 ' }],
]);
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/member-api.test.ts`

Expected: FAIL，因推薦碼函式尚未匯出。

- [ ] **Step 3: 寫入最小 API 封裝**

```ts
export type MemberReferralSummary = {
  referralCode: string;
  referralSuccessCount: number;
  hasInvitationCode: boolean;
  canSubmitReferralCode: boolean;
};

export function fetchMemberReferralSummary() {
  return memberRpc<MemberReferralSummary>('member_referral_summary');
}

export function submitMemberReferralCode(referralCode: string) {
  return memberRpc<MemberReferralSummary>('member_referral_submit', {
    p_referral_code: referralCode,
  });
}
```

- [ ] **Step 4: 執行 API 測試確認通過**

Run: `npx vitest run src/member-api.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/member-api.ts src/member-api.test.ts
git commit -m "feat(member): add referral RPC client"
```

### Task 2: 建立推薦碼資料庫 RPC 與權限契約

**Files:**
- Create: `supabase/migrations/*_member_referral_rpc.sql`（用 Supabase CLI 的 `supabase migration new member_referral_rpc` 產生）
- Create: `apps/admin/backend/member-referral-migration.test.ts`

**Interfaces:**
- Consumes: `public.members`、`public.payments`、`private.active_member_id()`。
- Produces: `public.member_referral_summary()`、`public.member_referral_submit(text)`。

- [ ] **Step 1: 寫入失敗的 migration 契約測試**

```ts
expect(sql).toContain('create function public.member_referral_summary()');
expect(sql).toContain('create function public.member_referral_submit(p_referral_code text)');
expect(sql).toContain("payment.status = 'confirmed'");
expect(sql).toContain('for update');
expect(sql).toContain('grant execute on function public.member_referral_summary() to authenticated');
expect(sql).toContain('grant execute on function public.member_referral_submit(text) to authenticated');
expect(sql).toContain('revoke execute on function public.member_referral_submit(text) from public, anon, service_role');
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run apps/admin/backend/member-referral-migration.test.ts`

Expected: FAIL，因 migration 尚不存在。

- [ ] **Step 3: 用 CLI 建立 migration 並實作 RPC**

Run: `supabase migration new member_referral_rpc`

在 CLI 產生的檔案中實作：

```sql
create unique index members_referral_code_upper_key
  on public.members ((pg_catalog.upper(pg_catalog.btrim(referral_code))))
  where pg_catalog.nullif(pg_catalog.btrim(referral_code), '') is not null;

create function public.member_referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = '';

create function public.member_referral_submit(p_referral_code text)
returns jsonb
language plpgsql
security definer
set search_path = '';
```

`member_referral_summary()` 必須鎖定本人資料、確認 LINE 身分、必要時產生唯一推薦碼、計算 `invitation_code = referral_code` 且有確認付款的不同會員數，並回傳四個介面欄位。`member_referral_submit()` 必須鎖定本人與推薦碼擁有者，拒絕空值、本人、已填寫與已有確認付款，成功時只更新本人的 `invitation_code`；兩個 RPC 都必須撤銷預設權限並只授權 `authenticated`。

- [ ] **Step 4: 執行 migration 契約測試確認通過**

Run: `npx vitest run apps/admin/backend/member-referral-migration.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations apps/admin/backend/member-referral-migration.test.ts
git commit -m "feat(member): add secure referral RPCs"
```

### Task 3: 串接推薦碼頁面與保留啟動碼付款後使用

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-pages.css`
- Create: `src/__tests__/ActivationCodePage.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `fetchMemberReferralSummary()`、`submitMemberReferralCode()`；既有 `redeemActivationCode()`。
- Produces: 具載入、提交、錯誤與成功狀態的 `ActivationCodePage`。

- [ ] **Step 1: 寫入失敗的畫面測試**

```tsx
memberApi.fetchMemberReferralSummary.mockResolvedValue({
  referralCode: 'ABCD1234', referralSuccessCount: 3,
  hasInvitationCode: false, canSubmitReferralCode: true,
});
render(<ActivationCodePage onNavigate={vi.fn()} />);

expect(await screen.findByText('ABCD1234')).toBeInTheDocument();
expect(screen.getByText('推薦成功')).toHaveTextContent('3');
const submit = screen.getByRole('button', { name: '確認', exact: true });
expect(submit).toBeDisabled();
```

新增案例：空值不可送出、成功後清空欄位並重新顯示摘要、已填寫不可再次送出、已付款錯誤保留輸入值、摘要讀取錯誤不顯示假資料，以及啟動碼在有已確認付款的推薦摘要下仍不被停用。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/__tests__/ActivationCodePage.test.tsx`

Expected: FAIL，因尚未串接推薦碼資料。

- [ ] **Step 3: 實作頁面狀態與訊息**

```tsx
const [referralSummary, setReferralSummary] = useState<MemberReferralSummary | null>(null);
const [referralSubmitting, setReferralSubmitting] = useState(false);
const [referralResult, setReferralResult] = useState<ReferralResultState>('idle');

useEffect(() => {
  void fetchMemberReferralSummary()
    .then(setReferralSummary)
    .catch(() => setReferralResult('load-error'));
}, []);
```

將 `ActivationCodePage` 改為具名匯出以供畫面測試；「輸入推薦碼」確認按鈕改為呼叫 `submitMemberReferralCode()`；成功時使用 RPC 回傳摘要更新畫面。啟動碼的 `handleActivation()`、付款後可兌換規則與其錯誤碼不修改。將目前硬編碼的 `0` 與 `—` 移除。

在推薦碼／啟動碼頁範圍內加入：收合按鈕 `min-height: 0; padding-block: 4px`，兩個確認按鈕 `height: 40px; min-height: 40px`，不改字級。

- [ ] **Step 4: 執行畫面測試確認通過**

Run: `npx vitest run src/__tests__/ActivationCodePage.test.tsx src/member-api.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/FeaturePages.tsx src/feature-pages.css src/__tests__/ActivationCodePage.test.tsx
git commit -m "feat(profile): implement referral code entry"
```

### Task 4: 修改個人選單、聯絡頁、更新紀錄與會員方案版面

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-pages.css`
- Modify: `src/mobile-layout-polish.css`
- Modify: `src/__tests__/MemberProfilePage.test.tsx`
- Create: `src/__tests__/profile-detail-pages.test.tsx`
- Modify: `src/__tests__/pro-plans-layout-refinement.test.ts`

**Interfaces:**
- Consumes: 既有 `ProfilePage`、`ProfileDetailShell`、`DetailCard`、`FeaturePageRouter`。
- Produces: 合併聯絡頁與不重疊的方案頁最終樣式。

- [ ] **Step 1: 寫入失敗的選單與內容測試**

```tsx
render(<ProfilePage onNavigate={onNavigate} />);
expect(screen.queryByText('客服與支援')).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: '聯絡客服/問題回報/商務合作' }))
  .toBeInTheDocument();

render(<FeaturePageRouter screen="merchant-info" onNavigate={vi.fn()} />);
expect(screen.getAllByText('Matrix1150801@gmail.com')).toHaveLength(3);
expect(screen.getByText('聯絡客服')).toBeInTheDocument();
expect(screen.getByText('問題回報')).toBeInTheDocument();
expect(screen.getByText('商務合作')).toBeInTheDocument();
```

新增更新紀錄頁只保留標題、三卡 gap 為 8px、聯絡頁內容左右 16px，以及方案卡 17px／結帳 16px、粗體與 12px 勾選框的 computed-style 測試。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/__tests__/MemberProfilePage.test.tsx src/__tests__/profile-detail-pages.test.tsx src/__tests__/pro-plans-layout-refinement.test.ts`

Expected: FAIL，因現有選單、聯絡頁、更新訊息與方案間距仍為舊規則。

- [ ] **Step 3: 實作畫面與最終樣式來源**

```tsx
{ title: '法律資訊', items: [
  ['關於 樂彩 Matrix', 'about-matrix'],
  ['服務內容與使用說明', 'service-info'],
  ['會員服務條例', 'member-terms'],
  ['隱私權政策', 'privacy-policy'],
  ['退款規範', 'refund-policy'],
  ['聲明與免責事項', 'disclaimer'],
  ['聯絡客服/問題回報/商務合作', 'merchant-info'],
] }
```

刪除空的客服群組。`merchant-info`、`problem-report`、`business-cooperation` 三個既有畫面識別值都回傳同一個三卡聯絡頁；「更新紀錄」不再渲染 DetailCard。

在 scoped CSS 實作：聯絡頁 `.feature-body { padding-inline: 16px; gap: 8px; }`；方案頁保留外層 16px 結帳 gutter，輪播以 `width: calc(100% + 32px)`、`margin-inline: -16px` 與 `padding-inline: 17px` 讓費用方案卡從 17px 開始；移除舊的 18px 最終覆寫。將訂閱卡可見文字設為粗體，勾選框 `12px`、label gap `4px`。

- [ ] **Step 4: 執行畫面與樣式測試確認通過**

Run: `npx vitest run src/__tests__/MemberProfilePage.test.tsx src/__tests__/profile-detail-pages.test.tsx src/__tests__/pro-plans-layout-refinement.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/FeaturePages.tsx src/feature-pages.css src/mobile-layout-polish.css src/__tests__/MemberProfilePage.test.tsx src/__tests__/profile-detail-pages.test.tsx src/__tests__/pro-plans-layout-refinement.test.ts
git commit -m "feat(profile): refine member pages and support details"
```

### Task 5: 全面驗證與交付前檢查

**Files:**
- Modify only if a failing test demonstrates a direct defect in Tasks 1–4.

**Interfaces:**
- Consumes: Tasks 1–4 的 migration、RPC client、頁面與樣式。
- Produces: 可重現的驗證結果與乾淨工作樹。

- [ ] **Step 1: 執行直接相關測試**

Run:

```bash
npx vitest run src/member-api.test.ts apps/admin/backend/member-referral-migration.test.ts src/__tests__/ActivationCodePage.test.tsx src/__tests__/MemberProfilePage.test.tsx src/__tests__/profile-detail-pages.test.tsx src/__tests__/pro-plans-layout-refinement.test.ts
```

Expected: PASS。

- [ ] **Step 2: 執行完整品質檢查**

Run:

```bash
npm run test:unit -- --reporter=dot
npm run build
git diff --check
git status --short
```

Expected: 816 項以上單元測試全部通過、型別與正式建置通過、沒有空白錯誤，且只包含規格內檔案。

- [ ] **Step 3: 檢查 migration 對正式資料庫的可套用性**

Run:

```bash
supabase migration list --local
```

Expected: 新 migration 位於既有 migration 之後，且檔名由 CLI 產生。

- [ ] **Step 4: Commit 驗證修正（僅在有修正時）**

```bash
git add src/member-api.ts src/member-api.test.ts supabase/migrations/*_member_referral_rpc.sql apps/admin/backend/member-referral-migration.test.ts src/FeaturePages.tsx src/feature-pages.css src/mobile-layout-polish.css src/__tests__/ActivationCodePage.test.tsx src/__tests__/MemberProfilePage.test.tsx src/__tests__/profile-detail-pages.test.tsx src/__tests__/pro-plans-layout-refinement.test.ts
git commit -m "test: verify profile referral changes"
```

- [ ] **Step 5: 交付前重新抓取 main 並檢查衝突**

Run:

```bash
git fetch origin main --prune
git diff --name-only origin/main...HEAD
git log --oneline HEAD..origin/main
```

Expected: 明確列出工作分支與最新 main 的差異；未收到合併指示前不更新 `main`、不推送正式分支、不部署資料庫。
