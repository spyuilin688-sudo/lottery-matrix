# 樂彩 Matrix API、獨立營運後台與 Supabase 串接設計

日期：2026-08-21
Repository：`spyuilin688-sudo/lottery-matrix`
Branch：`api`

## 1. 目標

串接既有 AppDeploy 演算法 API、既有獨立營運後台與既有 Supabase 專案，採用已確認的 B 方案：演算法與大量計算結果保留在 AppDeploy Database，會員與營運資料使用 Supabase。

## 2. 正式來源

- 演算法／爬蟲 API：AppDeploy `app-snsxet`。
- 獨立營運後台：AppDeploy `matrix-sanqwn`。
- 營運資料庫：Supabase `wcimzbbapfrdotjsfyxa`。
- 串接原始碼：GitHub `lottery-matrix/api`。
- 不使用 PWA 內的 `/admin` 作為本次正式後台。

## 3. 系統邊界

### 3.1 AppDeploy 演算法 API

保留：

- 爬蟲與歷史開獎資料。
- Matrix 演算法程式。
- 已完成探索結果。
- Matrix 覆蓋率與資料稽核結果。
- AppDeploy Database 內既有演算法資料。

本次不得修改演算法邏輯、驗證規則、探索條件、結果內容或三天保存規則。

### 3.2 Supabase

作為以下營運資料的正式來源：

- `members`
- `plans`
- `transfer_requests`
- `payments`
- `activation_code_batches`
- `activation_codes`
- `admin_accounts`
- `admin_login_records`
- `audit_logs`
- `admin_profiles`

不得將 AppDeploy 的演算法結果搬入 Supabase。

### 3.3 獨立營運後台

保留 `matrix-sanqwn` 現有獨立網站、登入入口、模組名稱與畫面結構。後台不再使用 AppDeploy Database 保存會員與營運資料，改由後端安全代理讀寫 Supabase；演算法狀態則由後端代理讀取 `app-snsxet`。

## 4. 資料流

### 4.1 登入與權限

1. 管理員使用 `matrix-sanqwn` 既有 AppDeploy 登入。
2. 後台後端使用 `requireAuth()` 驗證登入狀態。
3. 後台以登入 Email 對應 Supabase `admin_accounts.account`。
4. `status` 必須為 `啟用`。
5. 權限使用 `can_view`、`can_add`、`can_edit`、`can_delete`；`超級管理員`保留完整權限。
6. Supabase service-role key 只存在 AppDeploy backend secrets，不得傳到瀏覽器、回應內容、GitHub 或日誌。

### 4.2 營運資料

後台瀏覽器只呼叫 `matrix-sanqwn` 自身 `/api/*`。後台後端完成權限檢查後，以 Supabase REST／RPC 讀寫正式資料。不得讓瀏覽器直接持有 service-role key。

既有後台模組對應：

| 後台模組 | Supabase 正式來源 |
| --- | --- |
| 營運概覽 | `admin_dashboard_stats()`、`members`、`payments` |
| 用戶管理 | `members`、`plans` |
| 訂閱管理 | `members`、`plans` |
| 數據分析 | `admin_dashboard_stats()` |
| 收入報表 | `payments` |
| 登入紀錄 | `admin_login_records` |
| 訂閱紀錄 | `payments`、`members`、`plans` |
| 審計日誌 | `audit_logs` |
| 管理員權限 | `admin_accounts` |
| 系統設定 | `admin_accounts`、`audit_logs` |
| 啟動碼管理 | `activation_code_batches`、`activation_codes`、`generate_activation_code_batch()` |

欄位以 Supabase 現有正式欄位為準，不建立第二套同義資料表，不把 AppDeploy Database 舊資料繼續當成營運正式來源。

### 4.3 演算法狀態

後台後端代理讀取 `app-snsxet`：

- `GET /api/_healthcheck`
- `GET /api/matrix/coverage`
- `GET /api/matrix/audit`
- `GET /api/matrix/algorithm/cases`

後台只讀取狀態與驗證結果，不從後台執行探索計算、歷史回填或來源抓取。

## 5. 後端介面

保留 `matrix-sanqwn` 現有瀏覽器呼叫方式，將資料實作換成 Supabase：

- `GET /api/bootstrap`：回傳已驗證的管理員與權限。
- `GET /api/dashboard`：回傳 Supabase 營運統計與 AppDeploy 演算法狀態。
- `GET /api/data/:table`：僅接受明確白名單對應的 Supabase 資料來源。
- `POST /api/data/:table`、`PUT /api/data/:table/:id`、`DELETE /api/data/:table/:id`：沿用既有權限檢查，僅對既有後台已提供的操作開放。
- `POST /api/admins`、`PUT /api/admins/:id`、`DELETE /api/admins/:id`：改寫 `admin_accounts`。
- `POST /api/activation-codes/batch`：呼叫 `generate_activation_code_batch()`，每批固定 10 組。

所有寫入成功後都寫入 `audit_logs`。失敗的寫入不得產生成功稽核紀錄。

## 6. Supabase 變更原則

- 沿用既有資料表與 migration，不重建或刪除現有資料表。
- `public` 暴露資料表維持 RLS。
- 新增或調整的政策必須指定角色與實際授權條件。
- AppDeploy 後端以 service role 存取時，仍必須先通過 AppDeploy 管理員與權限檢查。
- 不把 `user_metadata` 用於授權。
- 不新增公開可呼叫的 `SECURITY DEFINER` 管理函式。
- 本次只修正串接實際需要且已確認的安全／索引問題，不刪除未使用索引。
- 套用 DDL 前先建立 migration；套用後重新執行 security 與 performance advisors。

## 7. 錯誤處理

- 未登入：拒絕存取後台資料。
- 找不到 `admin_accounts` 對應帳號：回傳 403，不自動建立管理員。
- 管理員停用或權限不足：回傳 403。
- Supabase 未設定或無法連線：回傳 503，不回傳 secret 或底層憑證內容。
- AppDeploy 演算法 API 無法連線：營運資料仍可讀取，演算法狀態標記為讀取失敗；不得用假資料代替。
- 不合法資料表或操作：回傳 400。
- 找不到資料：回傳 404。

## 8. 原始碼結構

`lottery-matrix/api` 新增獨立後台部署來源目錄，避免與 PWA 建置入口及既有 `backend/` 演算法來源互相覆寫：

- `apps/admin/package.json`
- `apps/admin/src/*`
- `apps/admin/backend/index.ts`
- `apps/admin/backend/supabase.ts`
- `apps/admin/backend/algorithm-api.ts`
- `apps/admin/tests/*`
- `supabase/migrations/*`

AppDeploy `app-snsxet` 缺少於 GitHub `api` 分支的正式演算法檔案需同步回既有 `backend/`，不得以另一套演算法重寫。

## 9. 測試與驗收

### 9.1 單元／契約測試

- 管理員 Email 對應、停用帳號與四項權限。
- Supabase 表格白名單與欄位映射。
- Dashboard 統計回應格式。
- 管理員 CRUD。
- 啟動碼每批固定 10 組。
- 寫入成功與失敗時的 audit 行為。
- 演算法 API 正常、逾時與錯誤回應。
- service-role key 不出現在前端產物或 API 回應。

### 9.2 Supabase 驗證

- Migration 已記錄。
- RLS 維持啟用。
- 非授權客戶端不能讀取管理資料。
- AppDeploy 後端可完成獲准操作。
- Security 與 performance advisors 重新檢查。

### 9.3 AppDeploy 驗證

- `app-snsxet` 健康檢查、coverage、audit、cases 可讀取。
- `matrix-sanqwn` 登入、總覽、各資料頁、管理員權限與啟動碼功能可用。
- 部署狀態為 ready，E2E／QA 無錯誤。

### 9.4 GitHub 驗證

- 所有正式串接來源同步到 `lottery-matrix/api`。
- 不推送到 `main`。
- 不提交任何 Supabase 或 AppDeploy secret。

## 10. 不在本次範圍

- 修改 PWA 畫面。
- 修改 Matrix 演算法或探索結果。
- 將演算法資料搬到 Supabase。
- LINE 登入正式串接。
- 第三方金流。
- 新增後台模組、功能名稱或未確認流程。
