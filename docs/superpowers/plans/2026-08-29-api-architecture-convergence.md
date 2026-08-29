# 樂彩 API 架構收斂實作計畫

日期：2026-08-29

## 目標

在不修改既有 PWA 畫面、響應式規則、操作流程與彩券算法的前提下，完成既定平台分工：

- Cloudflare Pages：只發布 PWA 靜態檔案。
- Railway：爬蟲、排程分析、最新開獎、歷史紀錄、同星與號碼對照查詢。
- Supabase：LINE Auth、會員／權限／通知、線上狀態、Matrix 結果查詢。
- AppDeploy：只保留管理員後臺的後端代理。
- GitHub：保存可重現的程式、migration、Edge Function 與部署契約。

## Task 1：建立部署與路由回歸測試

**Files**

- Create: `tests/api-platform-routing.test.mjs`
- Create: `tests/cloudflare-pages-build.test.mjs`
- Modify: `package.json`

**Steps**

1. 先加入失敗測試：一般 PWA 不可包含 `app-snsxet`，開獎 API 必須讀 `VITE_RAILWAY_API_BASE`，會員與 Matrix 結果必須走 Supabase。
2. 先加入失敗測試：`npm run build:pages` 只產生乾淨 `dist/index.html`，不得產生 Sites server 檔。
3. 新增 `build:pages` 並執行測試與實際建置。

## Task 2：修復 Railway Worker 續跑

**Files**

- Modify: `services/matrix-api/app/worker.py`
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Modify: `services/matrix-api/app/services/analysis_pipeline.py`
- Create/Modify: `services/matrix-api/tests/test_scheduled_worker_resume.py`
- Create/Modify: `services/matrix-api/tests/test_analysis_version_progress.py`

**Steps**

1. 重現「已抓到當期開獎，但 v3 分析尚未完成」時排程直接跳過的問題。
2. 讓排程在開獎查詢時間外仍可續跑未完成分析。
3. 進度查詢必須綁定 `analysis_version`，避免不同版本互相讀到游標。
4. 保留完整歷史分頁與既有 job-status 安全處理。
5. 執行 Worker、公開 API 與演算法驗收測試。

## Task 3：把會員 API 收斂到 Supabase RPC

**Files**

- Create: `supabase/migrations/20260829_member_pwa_rpc.sql`
- Modify: `src/member-api.ts`
- Modify: `src/member-api.test.ts`
- Modify: `src/main.tsx`

**Steps**

1. 先把會員 bootstrap、profile、通知設定與線上狀態測試改為 Supabase RPC 契約。
2. RPC 一律從 `auth.uid()` 找會員，不接受瀏覽器指定其他 `member_id`。
3. 通知設定保留既有資料格式與預設值；寫入仍受資料庫檢查與 authenticated 權限限制。
4. 前端改為 Supabase client RPC，不再呼叫一般會員 AppDeploy API。

## Task 4：把 LINE 登出 API 移到 Supabase Edge Function

**Files**

- Create: `supabase/functions/line-logout/index.ts`
- Create: `supabase/functions/line-logout/deno.json`
- Create: `supabase/functions/line-logout/index.test.ts`
- Modify: `src/auth/line-auth.ts`
- Modify: `src/auth/__tests__/line-auth.test.ts`

**Steps**

1. 修正既有失敗測試：LINE revoke 失敗不得清除 Supabase session，provider token 必須保留供重試。
2. Edge Function 啟用 JWT 驗證，並在 handler 內再次取得當前 Supabase user。
3. 驗證 LINE token 的 Channel、有效期與 `sub` 對應 Supabase `custom:line` identity 後才 revoke。
4. provider token 與 Channel secret 不寫入 log、資料庫或回應。
5. 前端改用 `supabase.functions.invoke('line-logout')`。

## Task 5：把 Matrix 成品查詢收斂到 Supabase RPC

**Files**

- Create: `supabase/migrations/20260829_matrix_result_rpc.sql`
- Modify: `src/matrix-algorithm-api.ts`
- Modify: `src/matrix-status-api.ts`
- Modify corresponding tests under `src/`

**Steps**

1. 為天衍、天工與狀態建立只讀結果 RPC；只讀取 `complete` 的同一版本 artifact。
2. 驗證請求彩種、期別、版本與 item id；權限沿用會員方案資料。
3. 自訂狀態設定以 authenticated RPC 讀寫，使用 `auth.uid()` 限定自己的會員。
4. 前端呼叫 RPC，移除一般使用者對舊 AppDeploy Matrix API 的依賴。

## Task 6：管理員後臺與正式平台設定

**Files**

- Modify only if required: `apps/admin/backend/algorithm-api.ts`
- Modify only if required: `apps/admin/backend/connection-status.ts`
- Verify: `apps/admin/backend/worker-api.ts`

**Steps**

1. AppDeploy 管理員後臺保留同源 `/api/*`；Railway 狀態由後端帶管理 token 查詢。
2. 移除管理後臺對舊 `app-snsxet` 的演算法狀態依賴，改讀 Railway／Supabase 的安全投影。
3. Cloudflare Pages 設定 `VITE_RAILWAY_API_BASE`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
4. Railway API service 使用 `railway.api.json` 並公開 `/health`；Worker services 無公開網域。
5. 部署後驗證首頁、歷史、同星、號碼對照、LINE 登入／登出與 Matrix 結果。

## 完成條件

- 正式 PWA bundle 不含 `app-snsxet`。
- 首頁、歷史、同星與號碼對照使用 Railway 正式 API 且可成功取得資料。
- LINE 登入由 Supabase Custom OAuth Provider 處理，登出由 Supabase Edge Function 安全 revoke。
- 會員與 Matrix 成品查詢不依賴一般 AppDeploy API。
- AppDeploy 僅負責管理員後臺後端。
- 指定單元測試、Python 測試、typecheck、Pages build 與 Premium 靜態稽核均通過。
