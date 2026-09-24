# 訂閱沖銷與三分頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只有超級管理員能記錄沖銷；沖銷原子更新該筆付款所造成的會員方案與效期；訂閱管理分成三個手機可用的分頁。

**Architecture:** 維持既有付款 RPC 簽名，在 PostgreSQL 的會員鎖內先重現全部有效付款的原權益，驗證與會員實況相符，然後移除指定付款重算並一次提交。後端新增超管驗證，前端在原訂閱管理元件內切換三區，保留原資料控制器和通知連結。

**Tech Stack:** PostgreSQL/Supabase migration, AppDeploy TypeScript API, React 19, CSS, node:test + PGlite, Vitest。

**Spec:** `docs/superpowers/specs/2026-09-24-admin-payment-reversal-entitlements-tabs-design.md`

## Global Constraints

- 不在正式資料上執行沖銷測試；不觸發綠界退款。
- 不改轉帳審核、購買確認、付款金額、其他訂閱權限。
- 舊資料若無法證實權益全由可重現付款構成，整筆回滾，不能只沖銷付款紀錄。
- `AGENTS.md` 限定只執行命令中明確列出、與本變更直接相關的測試檔案。
- 在 `feat/super-admin-reversal-entitlements-tabs-20260924` 完成改動，避免直接寫入 main。

## Review Focus

- 較早一筆月費被沖銷且年費仍有效：開始與到期重算為該年費付款時間起 365 天；Task 1 覆蓋。
- 其他來源延長效期、終生或人工改方案：全交易衝突，原付款與會員不變；Task 1 覆蓋。
- 兩人同時對同會員付款操作：會員鎖阻止舊狀態覆寫新狀態；Task 1 覆蓋鎖定與重驗狀態。
- 非超管直接呼叫 API／RPC：必須拒絕；Task 1 與 Task 2 覆蓋。
- 從轉帳通知開啟後台、換分頁時的表單和資料頁碼：Task 3 覆蓋。

---

### Task 1: 付款與會員權益的原子沖銷

**Files:**
- Modify: `tests/payment-reversal-pglite.test.mjs`
- Create: `supabase/migrations/20260924020932_superadmin_reversal_entitlements.sql`

**Interfaces:**
- Consumes: `public.payments`, `public.members`, `public.plans`, `public.admin_accounts`。
- Produces: 保持 `public.admin_record_payment_reversal(uuid,text,text,uuid,text)` 簽名；已確認付款成功時更新會員欄位，無法重現時 SQLSTATE `PT409` 和 `PAYMENT_ENTITLEMENT_CONFLICT`，非超管 `42501` 和 `PAYMENT_REVERSAL_FORBIDDEN`。

- [ ] **Step 1: 寫失敗測試。** 將測試載入最新的函式定義並建立兩筆連續付款的會員實況：第一筆月費於 `2026-09-23T14:08:07Z`、第二筆年費於 `2026-09-23T18:19:24Z`。測試沖銷年費得到月費與 30 天效期，沖銷月費得到年費與 365 天效期；最後一筆付費沖銷清空方案與效期；人工延長造成 `PAYMENT_ENTITLEMENT_CONFLICT` 且付款狀態仍為 `confirmed`；`refund_required` 不修改會員；營運管理員直接呼叫 RPC 被拒絕；相同結果重試不再次縮短效期。修正舊測試中「營運管理員可沖銷／會員完全不變」的過期預期。
- [ ] **Step 2: 驗證紅燈。** 執行 `node --test tests/payment-reversal-pglite.test.mjs`；預期新權限／效期斷言失敗，且失敗與缺少新規則對應。
- [ ] **Step 3: 實作最小 migration。** 同簽名替換 RPC；驗證服務角色及啟用的超級管理員；以付款查會員 ID、先鎖會員再鎖付款；在鎖內按 `(paid_at,id)` 順序以 `greatest(paid_at, prior_expiry) + make_interval(days => duration_days)` 重現 confirmed 付款。實況不等於重現狀態就丟 `PT409`，吻合才略過待沖銷付款重算並更新會員；`refund_required` 不更新會員。同交易更新付款欄位、原有稽核及推薦人數。保留相同結果重試與衝突處理。
- [ ] **Step 4: 驗證綠燈。** 執行 `node --test tests/payment-reversal-pglite.test.mjs`；全部通過。
- [ ] **Step 5: 只提交 Task 1 檔案。** `git add tests/payment-reversal-pglite.test.mjs supabase/migrations/20260924020932_superadmin_reversal_entitlements.sql`，`git commit -m "Synchronize payment reversal with member entitlement"`。

### Task 2: 後端角色與衝突錯誤

**Files:**
- Modify: `apps/admin/backend/index-wiring.test.ts`, `apps/admin/backend/supabase.test.ts`
- Modify: `apps/admin/backend/index.ts`, `apps/admin/backend/supabase.ts`

**Interfaces:**
- Consumes: Task 1 的 `PAYMENT_ENTITLEMENT_CONFLICT` 和 `PAYMENT_REVERSAL_FORBIDDEN`；既有 `superGuard`、`moduleGuard`。
- Produces: `PUT /api/payments/:id/reversal` 只允許角色為超管且具訂閱編輯權限；前端可辨識的 409 衝突。

- [ ] **Step 1: 寫失敗測試。** 路由測試讓營運管理員具模組編輯權限仍得到 403，超管繼續成功；既有會話中的 actor 決定 RPC 參數；Supabase 錯誤對 `PT409/PAYMENT_ENTITLEMENT_CONFLICT/409` 與 `42501/PAYMENT_REVERSAL_FORBIDDEN/403` 只在正確 RPC 與狀態碼下透出，未知錯誤隱藏。
- [ ] **Step 2: 驗證紅燈。** `npx vitest run apps/admin/backend/index-wiring.test.ts apps/admin/backend/supabase.test.ts`。
- [ ] **Step 3: 實作。** 在該路由加既有 `superGuard` 並沿用模組檢查，為新錯誤加精確 allowlist，不放寬其他路由。
- [ ] **Step 4: 驗證綠燈。** 同 Step 2 明確檔案命令。
- [ ] **Step 5: 提交 Task 2 檔案。** `git add apps/admin/backend/index.ts apps/admin/backend/supabase.ts apps/admin/backend/index-wiring.test.ts apps/admin/backend/supabase.test.ts`，`git commit -m "Restrict payment reversal API to super administrators"`。

### Task 3: 手機三分頁與沖銷結果同步

**Files:**
- Modify: `apps/admin/src/admin-permissions-app.test.tsx`, `apps/admin/src/payment-reversal-panel.test.tsx`
- Modify: `apps/admin/src/AdminApp.tsx`, `apps/admin/src/PaymentReversalPanel.tsx`, `apps/admin/src/admin-operations.css`

**Interfaces:**
- Consumes: Task 2 的 403、409；原本 `PaymentReversalPanel`、三個資料控制器與 `#transfer-requests` 通知連結。
- Produces: `訂閱會員／付款紀錄／轉帳申請` 選項、超管專用沖銷入口；成功後付款與會員兩份清單重新讀取；衝突時保留理由並顯示可理解提示。

- [ ] **Step 1: 寫失敗測試。** 選「付款紀錄」才顯示原付款清單、非超管無沖銷按鈕、超管沖銷的共用確認說明方案效期、API 成功後重新讀取付款及會員；切分頁保留各列表篩選／頁碼，原通知 hash 在冷啟和現有頁面選中轉帳；面板錯誤以 `PAYMENT_ENTITLEMENT_CONFLICT` 顯示且原因仍在。
- [ ] **Step 2: 驗證紅燈。** `npx vitest run apps/admin/src/admin-permissions-app.test.tsx apps/admin/src/payment-reversal-panel.test.tsx`。
- [ ] **Step 3: 實作。** 在 `SubscriptionManager` 增設三個語意分頁按鈕及各自面板，沿用既有資料控制器、列表工具及原生確認；付款區直接呈現原紀錄；只給 `isSuper && canEdit` 傳可編輯權限，成功後付款及會員兩個 controller 一起 refresh；更新舊說明文案，讓後台 hash 選中轉帳。CSS 只作用於新分頁，手機三等寬且內容自然長高。
- [ ] **Step 4: 驗證綠燈。** 同 Step 2 明確檔案命令。
- [ ] **Step 5: 提交 Task 3 檔案。** `git add apps/admin/src/AdminApp.tsx apps/admin/src/PaymentReversalPanel.tsx apps/admin/src/admin-operations.css apps/admin/src/admin-permissions-app.test.tsx apps/admin/src/payment-reversal-panel.test.tsx`，`git commit -m "Split subscription management into tabs and refresh entitlements"`。

### Task 4: 契約、建置與核對

**Files:**
- Modify: `apps/admin/DESIGN.md`, `UX-CONTRACT.md`

**Interfaces:**
- Consumes: Tasks 1–3 之已驗證行為。
- Produces: 不再宣稱沖銷不改訂閱日期，管理頁文件與實作一致。

- [ ] **Step 1: 更新相互矛盾的文件。** 在 `apps/admin/DESIGN.md` 改為三分頁並列出手機密度；在 `UX-CONTRACT.md` 更新超管權限、原子更新、舊資料衝突與三個功能分頁，不移動其他章節。
- [ ] **Step 2: 執行明確測試及建置。** `node --test tests/payment-reversal-pglite.test.mjs`，`npx vitest run apps/admin/backend/index-wiring.test.ts apps/admin/backend/supabase.test.ts apps/admin/src/admin-permissions-app.test.tsx apps/admin/src/payment-reversal-panel.test.tsx`，`npm run build:admin:pages`；逐一檢視真實輸出。
- [ ] **Step 3: 檢查手機與桌面。** 檢視 360px、一般桌面寬度的分頁、長 ID、鍵盤焦點及通知連結，並 `git diff --check`、檢視文件和程式的衝突描述。
- [ ] **Step 4: 提交文件。** `git add apps/admin/DESIGN.md UX-CONTRACT.md`，`git commit -m "Document payment entitlement reversal and admin tabs"`。
