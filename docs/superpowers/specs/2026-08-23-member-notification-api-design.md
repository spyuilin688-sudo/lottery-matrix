# 樂彩 Matrix 會員與通知 API 設計

## 目的

延續 `lottery-matrix/main` 既有 React/PWA、TypeScript AppDeploy 後端與 Supabase，不建立第二套後端。

現有爬蟲、開獎歷史、Matrix 演算法、Matrix 探索、Matrix 狀態、Matrix 同星、號碼對照單 API 保持不變。本次只補齊目前仍由前端暫存／寫死的「通知設定」與「我的」會員資料。

## 既有正式來源

- 前端：React/Vite `src/`
- 後端：TypeScript `backend/index.ts` 與既有 Matrix services/routes
- 認證：Supabase session Bearer token，沿用 `createMemberAuth()`
- 資料庫：既有 Supabase project
- 正式程式碼：`lottery-matrix/main`

## 本次 API

### GET `/api/member/profile`

需登入。

從目前登入會員讀取：

- `lineUserId`
- `planName`
- `planExpiresAt`
- `isLifetime`

不得回傳 service-role key 或其他會員資料。

### GET `/api/member/notification-settings`

需登入。

讀取目前會員通知設定。若尚無資料，回傳目前通知介面既有預設值，不建立額外通知類型。

設定內容一對一對應目前 `NotificationsPage`：

- 主開關：`bet`, `result`, `win`, `status`, `card`, `collision`, `system`, `expiry`
- `selectedOptions`
- 四彩種 `betTimes`
- 四彩種 `statusOptions`
- 四彩種 `collisionOptions`

### PUT `/api/member/notification-settings`

需登入。

只儲存目前通知介面既有設定欄位。以登入會員 `member_id` 為唯一所有者；不得修改其他會員設定。

## Supabase

新增 `notification_settings`：

- `member_id uuid primary key`，外鍵 `members(id)`，刪除會員時 cascade
- `settings jsonb not null`
- `updated_at timestamptz not null default now()`

開啟 RLS。正式前端不直接讀寫此表；後端完成會員驗證後使用既有 server-side Supabase service credentials 存取。

## 前端串接

### 通知

介面、文字、選項、版面全部維持目前正式版本。

- 開啟通知頁後讀取 `/api/member/notification-settings`
- 後端有設定時套用至目前既有 controls
- 使用者變更設定後寫回 `/api/member/notification-settings`
- 不新增按鈕、不改操作流程

### 我的

介面與版面保持不變，只把目前寫死資料替換為 `/api/member/profile` 實際資料：

- `LINE ID` 使用 `lineUserId`
- `目前方案` 使用 `planName`
- `訂閱到期日` 使用 `planExpiresAt`
- `isLifetime` 為 true 時不得顯示虛假的固定到期日

目前資料來源沒有會員顯示名稱欄位，因此本次不新增姓名欄位或自行推導名稱。

## 不在本次範圍

- 不重寫爬蟲 API
- 不重寫 Matrix 演算法 API
- 不修改探索計算邏輯
- 不修改 Matrix 狀態判定邏輯
- 不新增快捷 API
- 不新增新的通知類型
- 不新增推播發送規則
- 不修改既有 UI 排版

## 驗證

- 後端 route/service 單元測試
- 前端 API client 單元測試
- 現有完整測試
- Vite production build
- Supabase security/performance advisor
- 正式部署後確認通知頁與我的頁可正常載入，且既有探索／首頁流程無回歸
