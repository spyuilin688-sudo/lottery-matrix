# 管理者後臺審計、API 狀態與啟動碼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 隱藏超級管理員審計紀錄、在系統設定逐項顯示 API 狀態與位置，並使六種啟動碼確實授予對應且不降級的 Matrix Pro 權限。

**Architecture:** 管理者後臺由一份純資料 API inventory 定義顯示項目，`connection-status.ts` 對安全端點執行讀取檢查，對寫入端點只驗證服務與路由存在性。啟動碼方案映射在單一 Supabase 交易函式內完成；前端只負責格式化輸入與顯示結果。審計則維持應用層與資料庫層不寫入，再於讀取層排除歷史超級管理員紀錄。

**Tech Stack:** React、TypeScript、Vitest、Node.js、Supabase PostgreSQL／PostgREST／Edge Functions、Railway Worker API

**Spec:** `docs/superpowers/specs/2026-09-02-admin-api-status-activation-audit-design.md`

## Global Constraints

- 不刪除既有審計資料。
- 不在 API 回應或前端顯示任何密鑰或原始服務錯誤。
- 狀態檢查不得建立、更新、刪除或兌換任何正式資料。
- 不改變四個彩種排程、爬蟲來源、演算法或其他會員流程。
- 系統設定在 390px 手機寬度不得水平溢出。
- 修改前同步最新 `main`；不得 force push、reset 或覆蓋其他提交。

---

### Task 1: 審計日誌排除超級管理員

**Files:**
- Modify: `apps/admin/backend/admin-data.ts`
- Modify: `apps/admin/backend/admin-data.test.ts`
- Verify: `apps/admin/backend/admin-writes.test.ts`
- Verify: `apps/admin/backend/super-admin-activity-migration.test.ts`

**Interfaces:**
- Consumes: `listAdminTable('auditLogs', api)`、既有 `writeAudit()`、`skip_super_admin_audit_logs` trigger。
- Produces: 審計日誌 PostgREST 查詢固定排除 `admin_accounts.role = 超級管理員`。

- [ ] **Step 1: 將現有查詢測試改為失敗案例**

```ts
it('excludes super administrators from login and audit records', async () => {
  const request = vi.fn(async () => []);
  await listAdminTable('loginRecords', { request });
  await listAdminTable('auditLogs', { request });
  expect(request.mock.calls[0][0]).toContain('admin_account.role=neq.');
  expect(request.mock.calls[1][0]).toContain('admin_account.role=neq.');
});
```

- [ ] **Step 2: 執行測試並確認 auditLogs 斷言失敗**

Run: `npx vitest run apps/admin/backend/admin-data.test.ts`

Expected: FAIL，因 `auditLogs.path` 尚未連接 `admin_accounts` 並過濾角色。

- [ ] **Step 3: 修改審計日誌查詢**

將 `auditLogs.path` 改為包含：

```ts
admin_account:admin_accounts!inner(role)
admin_account.role=neq.${encodeURIComponent('超級管理員')}
```

保留既有欄位映射，不回傳 `admin_account`。

- [ ] **Step 4: 執行審計相關測試**

Run: `npx vitest run apps/admin/backend/admin-data.test.ts apps/admin/backend/admin-writes.test.ts apps/admin/backend/super-admin-activity-migration.test.ts`

Expected: PASS；超級管理員不寫入且不讀出，其他角色流程不變。

- [ ] **Step 5: 提交審計修改**

```bash
git add apps/admin/backend/admin-data.ts apps/admin/backend/admin-data.test.ts
git commit -m "fix(admin): hide super administrator audit records"
```

---

### Task 2: 建立完整 API 狀態清單與安全檢查

**Files:**
- Create: `apps/admin/backend/api-status-inventory.ts`
- Create: `apps/admin/backend/api-status-inventory.test.ts`
- Modify: `apps/admin/backend/connection-status.ts`
- Modify: `apps/admin/backend/connection-status.test.ts`
- Modify: `apps/admin/backend/index-wiring.test.ts`

**Interfaces:**
- Produces: `ApiStatusDefinition`、`apiStatusInventory`。
- Produces: `ConnectionStatusItem.location`、`endpoint`、`group`、`checkMode`。
- Consumes: Supabase OpenAPI paths、既有 `getWorkerStatus()`、AppDeploy `/api/_healthcheck`。

- [ ] **Step 1: 建立 inventory 失敗測試**

```ts
expect(apiStatusInventory).toEqual(expect.arrayContaining([
  expect.objectContaining({ id: 'admin-api', location: 'AppDeploy', endpoint: '/api/_healthcheck' }),
  expect.objectContaining({ id: 'supabase-auth', location: 'Supabase' }),
  expect.objectContaining({ id: 'matrix-status-function', endpoint: '/functions/v1/matrix-status' }),
  expect.objectContaining({ id: 'supabase-rpc-matrix_explore_list', endpoint: '/rest/v1/rpc/matrix_explore_list' }),
  expect.objectContaining({ id: 'supabase-rpc-redeem_activation_code', endpoint: '/rest/v1/rpc/redeem_activation_code' }),
  expect.objectContaining({ id: 'railway-health', location: 'Railway', endpoint: '/health' }),
  expect.objectContaining({ id: 'railway-number-reference', endpoint: '/api/matrix/number-reference' }),
]));
expect(new Set(apiStatusInventory.map((item) => item.id)).size).toBe(apiStatusInventory.length);
```

清單需逐項涵蓋目前 `src/matrix-algorithm-api.ts`、`src/matrix-status-api.ts`、`src/member-api.ts`、`src/member-online-api.ts`、`src/activation/redeemActivationCode.ts` 及 `services/matrix-api/app/api_server.py` 直接使用或提供的 API／RPC。

- [ ] **Step 2: 執行 inventory 測試並確認模組不存在**

Run: `npx vitest run apps/admin/backend/api-status-inventory.test.ts`

Expected: FAIL，因 `api-status-inventory.ts` 尚未建立。

- [ ] **Step 3: 建立純資料 inventory**

```ts
export type ApiLocation = 'AppDeploy' | 'Supabase' | 'Railway';
export type ApiCheckMode = 'live' | 'openapi' | 'service';
export type ApiStatusDefinition = {
  id: string;
  name: string;
  group: string;
  location: ApiLocation;
  endpoint: string;
  checkMode: ApiCheckMode;
};
const supabaseRpcNames = [
  'matrix_explore_list', 'matrix_explore_validation',
  'matrix_tianyan_list', 'matrix_tianyan_validation',
  'matrix_tiangong_list', 'matrix_tiangong_validation',
  'matrix_custom_status_list', 'matrix_custom_status_save', 'matrix_custom_status_reset',
  'member_bootstrap', 'member_profile',
  'member_notification_settings_get', 'member_notification_settings_save',
  'member_transfer_request_submit', 'member_pending_transfer_request',
  'member_payment_history_get', 'member_push_subscription_status',
  'member_push_subscription_save', 'member_push_subscription_disable',
  'member_online_start', 'member_online_end', 'redeem_activation_code',
] as const;
const railwayRoutes = [
  ['/health', 'live'], ['/jobs/status', 'live'], ['/jobs/refresh', 'service'],
  ['/api/matrix/cards/*', 'service'], ['/api/matrix/latest/*', 'service'],
  ['/api/matrix/history/*', 'service'], ['/api/matrix/tongxing', 'service'],
  ['/api/matrix/number-reference', 'service'],
] as const;
```

不得加入程式碼中不存在的 API 名稱。

- [ ] **Step 4: 為安全探測新增失敗測試**

測試必須證明：

```ts
expect(result.items.every((item) => item.location && item.endpoint)).toBe(true);
expect(fetcher).toHaveBeenCalledWith(
  'https://matrix-sanqwn.v2.appdeploy.ai/api/_healthcheck',
  expect.objectContaining({ cache: 'no-store' }),
);
expect(fetcher).not.toHaveBeenCalledWith(
  expect.stringContaining('/redeem_activation_code'),
  expect.objectContaining({ method: 'POST' }),
);
expect(JSON.stringify(result)).not.toMatch(/serviceRoleKey|workerToken|raw-worker-secret/);
```

- [ ] **Step 5: 實作分離式檢查**

`connection-status.ts` 執行一次 Supabase OpenAPI GET，將 `paths` 轉為 `Set<string>`；`checkMode: 'openapi'` 只查端點是否存在。AppDeploy 健康端點、Supabase Auth、Supabase Database、Matrix Status OPTIONS、Railway health/jobs 使用非寫入請求；`checkMode: 'service'` 繼承對應服務檢查結果。每一項各自產生 `ConnectionStatusItem`，單項失敗不得拋出到整體回應。

- [ ] **Step 6: 保留四個排程並接受 waiting_source**

將合法工作狀態同步為：

```ts
const jobStatuses = ['running', 'waiting_source', 'success', 'failed'] as const;
```

四個 `cron-*` 項目繼續附加於 API 清單後方，保留既有手動更新映射。

- [ ] **Step 7: 執行後端狀態測試**

Run: `npx vitest run apps/admin/backend/api-status-inventory.test.ts apps/admin/backend/connection-status.test.ts apps/admin/backend/index-wiring.test.ts`

Expected: PASS；項目完整、個別隔離、無寫入探測、無秘密外洩。

- [ ] **Step 8: 提交後端 API 狀態修改**

```bash
git add apps/admin/backend/api-status-inventory.ts apps/admin/backend/api-status-inventory.test.ts apps/admin/backend/connection-status.ts apps/admin/backend/connection-status.test.ts apps/admin/backend/index-wiring.test.ts
git commit -m "feat(admin): list API status and locations"
```

---

### Task 3: 將系統設定改為手機友善的分組精簡列

**Files:**
- Modify: `apps/admin/src/system-status.ts`
- Modify: `apps/admin/src/system-status.test.ts`
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/src/admin-operations.css`
- Modify: `apps/admin/src/admin-density.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `ConnectionStatusItem.location`、`endpoint`、`group`。
- Produces: 依位置分組的 `.statusGroup` 與 `.statusRow`。

- [ ] **Step 1: 擴充前端型別並寫失敗測試**

```ts
export type SystemStatusItem = {
  id: string;
  name: string;
  group: string;
  location: 'AppDeploy' | 'Supabase' | 'Railway';
  endpoint: string;
  checkMode: 'live' | 'openapi' | 'service';
  // 保留既有欄位
};
```

在 `admin-density.test.ts` 斷言存在分組、精簡列、可換行 endpoint，且不存在固定卡片欄寬。

- [ ] **Step 2: 執行前端測試並確認失敗**

Run: `npx vitest run apps/admin/src/system-status.test.ts apps/admin/src/admin-density.test.ts`

Expected: FAIL，因型別與精簡列表尚未實作。

- [ ] **Step 3: 實作位置分組與精簡列**

`SystemSettings` 依 `location` 分組；每列顯示名稱、endpoint、位置、狀態、檢查時間與回應時間。排程細節與既有按鈕放在同一列的次要區域，不改變事件處理函式。

```tsx
<section className="statusGroup" aria-labelledby={`status-${location}`}>
  <h3 id={`status-${location}`}>{location}</h3>
  <div className="statusRows">{groupItems.map(renderStatusRow)}</div>
</section>
```

- [ ] **Step 4: 加入不鎖寬的響應式樣式**

```css
.statusRow { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
.statusEndpoint { min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 520px) {
  .statusRow { grid-template-columns: minmax(0, 1fr); }
}
```

沿用既有顏色、字級、圓角與按鈕；移除只服務舊大型 `.statusCard` 網格且會造成衝突的規則。

- [ ] **Step 5: 執行前端與建置測試**

Run: `npx vitest run apps/admin/src/system-status.test.ts apps/admin/src/admin-density.test.ts apps/admin/src/admin-button-styles.test.ts`

Run: `npm run build:admin`

Expected: PASS，且 390px 規則沒有固定寬度或水平溢出來源。

- [ ] **Step 6: 提交系統設定 UI 修改**

```bash
git add apps/admin/src/system-status.ts apps/admin/src/system-status.test.ts apps/admin/src/AdminApp.tsx apps/admin/src/admin-operations.css apps/admin/src/admin-density.test.ts
git commit -m "feat(admin): group API status into compact rows"
```

---

### Task 4: 修正啟動碼方案授權與不降級交易

**Files:**
- Create: `supabase/migrations/20260902164500_fix_activation_code_plan_entitlements.sql`
- Create: `apps/admin/backend/activation-code-entitlement-migration.test.ts`
- Modify: `apps/admin/tests/tests.txt`

**Interfaces:**
- Consumes: `public.redeem_activation_code(p_code text)`、`plans.name`、`members.current_plan_id`、`members.plan_expires_at`、`members.is_lifetime`。
- Produces: 同簽名的原子 RPC，回傳既有 JSON 欄位並正確更新方案與到期日。

- [ ] **Step 1: 寫入 migration contract 失敗測試**

測試讀取新 migration 並驗證：

```ts
expect(sql).toContain("when '7_days' then '月費方案'");
expect(sql).toContain("when '90_days' then '季費方案'");
expect(sql).toContain("when '365_days' then '年費方案'");
expect(sql).toContain('for update');
expect(sql).toContain('greatest(');
expect(sql).toContain('grant execute on function public.redeem_activation_code(text) to authenticated');
expect(sql).toContain('grant execute on function public.generate_activation_code_batch(text) to service_role');
```

- [ ] **Step 2: 執行 migration 測試並確認檔案不存在**

Run: `npx vitest run apps/admin/backend/activation-code-entitlement-migration.test.ts`

Expected: FAIL，因新 migration 尚未建立。

- [ ] **Step 3: 以單一交易取代兌換函式**

SQL 內建立方案等級：月費 1、季費 2、年費 3。7／15／30 對應月費，90 對應季費，365 對應年費；永久沿用 `is_lifetime = true`。有效中的較高現有方案保留 `current_plan_id`，否則使用啟動碼對應方案；天數一律加到 `greatest(plan_expires_at, now())`。永久會員兌換天數型啟動碼仍回傳 `MEMBER_ALREADY_LIFETIME`，且不消耗啟動碼。

- [ ] **Step 4: 明確重設 RPC 權限**

```sql
revoke execute on function public.redeem_activation_code(text) from public, anon, service_role;
grant execute on function public.redeem_activation_code(text) to authenticated;
revoke execute on function public.generate_activation_code_batch(text) from public, anon, authenticated;
grant execute on function public.generate_activation_code_batch(text) to service_role;
```

- [ ] **Step 5: 執行啟動碼與既有資料庫合約測試**

Run: `npx vitest run apps/admin/backend/activation-code-entitlement-migration.test.ts apps/admin/backend/admin-writes.test.ts`

Run: `python -m pytest services/matrix-api/tests/test_matrix_explore_migration_contract.py services/matrix-api/tests/test_tiangong_rpc_contract.py`

Expected: PASS；新函式不改變 Matrix RPC 合約。

- [ ] **Step 6: 提交資料庫修正**

```bash
git add supabase/migrations/20260902164500_fix_activation_code_plan_entitlements.sql apps/admin/backend/activation-code-entitlement-migration.test.ts apps/admin/tests/tests.txt
git commit -m "fix(activation): grant mapped plans without downgrades"
```

---

### Task 5: 顯示啟動碼兌換結果

**Files:**
- Modify: `src/activation/redeemActivationCode.ts`
- Modify: `src/activation/__tests__/redeemActivationCode.test.ts`
- Modify: `src/FeaturePages.tsx`
- Modify: `src/__tests__/FeatureActions.test.tsx`
- Modify: `src/feature-pages.css`

**Interfaces:**
- Consumes: Task 4 RPC 錯誤訊息與既有 `ActivationRedemptionResult`。
- Produces: 穩定錯誤碼與可見的成功／失敗訊息。

- [ ] **Step 1: 新增錯誤映射與可見結果的失敗測試**

```ts
expect(mapActivationError({ message: 'ACTIVATION_CODE_ALREADY_USED' })).toBe('ACTIVATION_CODE_ALREADY_USED');
expect(await screen.findByRole('status')).toHaveTextContent('啟動成功');
expect(await screen.findByRole('alert')).toHaveTextContent('啟動碼已使用');
```

另驗證連點時只保留最後一次請求結果，沿用既有 revision 保護。

- [ ] **Step 2: 執行前端啟動碼測試並確認失敗**

Run: `npx vitest run src/activation/__tests__/redeemActivationCode.test.ts src/__tests__/FeatureActions.test.tsx`

Expected: FAIL，因目前所有 Supabase 錯誤都被轉為同一錯誤碼，且畫面沒有結果文字。

- [ ] **Step 3: 實作穩定錯誤映射**

支援 `ACTIVATION_CODE_NOT_FOUND`、`ACTIVATION_CODE_ALREADY_USED`、`ACTIVATION_CODE_EXPIRED`、`MEMBER_ALREADY_LIFETIME`，其餘維持 `ACTIVATION_CODE_REDEMPTION_FAILED`；不得顯示原始 Supabase 錯誤內容。

- [ ] **Step 4: 顯示結果但不改變輸入流程**

```tsx
{resultState === 'success' && <p className="activation-result success" role="status">啟動成功</p>}
{resultState !== 'idle' && resultState !== 'success' && (
  <p className="activation-result error" role="alert">{activationErrorText[resultState]}</p>
)}
```

成功時仍清空輸入；失敗時保留輸入供修正。

- [ ] **Step 5: 執行啟動碼與 PWA 測試**

Run: `npx vitest run src/activation/__tests__/redeemActivationCode.test.ts src/__tests__/FeatureActions.test.tsx`

Expected: PASS。

- [ ] **Step 6: 提交前端回饋修改**

```bash
git add src/activation/redeemActivationCode.ts src/activation/__tests__/redeemActivationCode.test.ts src/FeaturePages.tsx src/__tests__/FeatureActions.test.tsx src/feature-pages.css
git commit -m "fix(activation): show safe redemption results"
```

---

### Task 6: 整合最新 main 與完整驗證

**Files:**
- Verify all files from Tasks 1–5.

**Interfaces:**
- Consumes: 完成的審計、API 狀態與啟動碼修改。
- Produces: 無衝突、可審查、已完整測試的功能分支。

- [ ] **Step 1: 取得最新 main 並檢查重疊檔案**

Run: `git fetch origin main`

Run: `git diff --name-only HEAD..origin/main`

對 Tasks 1–5 的檔案逐一檢查；有重疊時先比較差異，再以一般 merge 整合，禁止 force push、reset 或覆蓋。

- [ ] **Step 2: 合併最新 main**

Run: `git merge --no-edit origin/main`

Expected: fast-forward 或無衝突 merge；若衝突，逐檔保留雙方有效修改後再繼續。

- [ ] **Step 3: 執行管理者後臺測試**

Run: `npm run test:admin`

Expected: PASS。

- [ ] **Step 4: 執行 PWA 單元測試**

Run: `npm run test:unit`

Expected: PASS。

- [ ] **Step 5: 執行 Python 測試**

Run: `python -m pytest services/matrix-api/tests`

Expected: PASS。

- [ ] **Step 6: 執行正式建置與差異檢查**

Run: `npm run build`

Run: `npm run build:admin`

Run: `git diff --check origin/main...HEAD`

Expected: 全部成功；只允許既有且不影響建置的警告。

- [ ] **Step 7: 檢查提交範圍**

Run: `git diff --stat origin/main...HEAD`

Expected: 只包含本規格、實作計畫及 Tasks 1–5 的直接相關檔案。
