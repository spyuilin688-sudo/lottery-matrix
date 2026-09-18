# 管理者後台權限切換遷移設計

## 目標

把既有獨立網站中的「顯示訂閱購買」與「註冊會員免費使用」移到樂彩 Matrix 管理者後台的獨立選單「權限切換」。設定資料、前台讀取方式與兩個開關的產品語意維持不變。

## 已確認決策

- 左側導覽新增所有管理員皆可見的獨立選單「權限切換」。
- 所有已登入且啟用的管理員可查看目前狀態。
- 只有角色為「超級管理員」的帳號可以修改。
- 新後台驗證正常後，停用舊獨立網站的更新能力並退役舊網站。
- 不使用 iframe、外部連結或把舊管理權杖交給瀏覽器。

## 架構

### 讀取

後台頁面呼叫 `GET /api/permission-settings`。Supabase `admin-api` 先驗證既有管理員工作階段，再由伺服器以 service role 呼叫既有 `public.matrix_permission_settings()`。回傳內容固定為：

```ts
type MatrixPermissionSettings = {
  subscriptionPurchaseVisible: boolean;
  registeredMemberFreeAccess: boolean;
  revision: number;
  updatedAt: string;
};
```

### 修改

後台頁面呼叫 `PUT /api/permission-settings/:key`，body 只接受：

```ts
{ value: boolean; expectedRevision: number }
```

API 不接受客戶端提供的管理員 ID。路由先以現有工作階段確認超級管理員，再把伺服器取得的管理員 ID 傳入新的 `public.admin_matrix_permission_settings_update(uuid, jsonb)`。資料庫函式再次確認：

1. 呼叫角色為 `service_role`。
2. 管理員存在、狀態為「啟用」、角色為「超級管理員」。
3. key、value 與 expectedRevision 型別及欄位數完全符合合約。
4. revision 仍相同後才鎖列並更新。

函式使用 `SECURITY DEFINER` 的唯一原因是設定表位於未暴露的 `private` schema；它會從 `PUBLIC`、`anon`、`authenticated` 撤銷執行權，只授權 `service_role`。service role 不會出現在瀏覽器。

### 競爭與錯誤

- 更新使用現有 revision 做樂觀鎖定。
- 版本衝突回傳 HTTP 409／`SETTINGS_CONFLICT`。
- 前端收到任何更新失敗都重新讀取伺服器狀態；若為衝突，明確提示使用者重新確認。
- 載入失敗不顯示推測值，保留「重新載入」操作。
- 儲存期間停用兩個開關，避免同一頁重複送出不同 revision。

## 介面與響應式行為

- 頁面沿用 `apps/admin/DESIGN.md` 的深色金色管理介面，不新增全域 token。
- 兩個設定各為一列／一卡：左側標題與影響說明，右側為原生 checkbox 加 `role="switch"`。
- 超級管理員切換前使用既有 app-owned `ConfirmationDialog`；取消不送 API。
- 一般管理員看到相同狀態，但控制為 disabled，並顯示「僅超級管理員可修改」。
- 載入、成功、錯誤使用持續可見且有 `role="status"`／`role="alert"` 的頁內訊息。
- 760px 以下改為文字在上、開關在下／右側的自然流動版面；控制至少 44px 可觸控區，文字不截斷。

## 上線與退役

採兩階段切換以避免控制空窗：

1. 第一個 PR 上線新的資料庫管理 RPC、Supabase admin-api 路由與後台頁面；保留舊 token RPC。
2. 確認正式後台可讀、可改、一般管理員只讀，而且前台反映兩個狀態。
3. 第二個 PR 撤銷並刪除 `public.matrix_permission_settings_update(jsonb)` 與 `private.matrix_permission_credentials`，使舊網站無法再修改。
4. 將舊網站改為退役狀態；若平台不提供刪除功能，保留 owner-only 並顯示已移至管理者後台，同時確保資料庫更新入口已失效。

## 驗收標準

- 左側有「權限切換」，三種管理員角色都能進入並看到真實狀態。
- 非超級管理員無法從 UI 或直接呼叫 API 修改，回應為 403。
- 超級管理員確認後可獨立修改任一開關，另一個值不變，revision 加一。
- 過期 revision 不覆寫新值，頁面重新載入目前狀態。
- 不把 service role 或舊管理權杖傳給瀏覽器、記錄或錯誤訊息。
- 390px 手機寬度、鍵盤操作、載入、錯誤、取消與 busy 狀態可用。
- 既有前台購買顯示與免費權限行為的合約測試保持通過。
