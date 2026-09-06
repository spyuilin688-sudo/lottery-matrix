# 超級管理員轉帳申請推播

超級管理員在後台「訂閱管理 → 轉帳申請」按「啟用此裝置通知」，並允許瀏覽器通知後，新轉帳申請會通知此裝置。關閉後台或登出不會停用裝置；可從同一處停用。iOS 需先將後台加入主畫面。

通知只顯示提醒，不包含會員、金額或帳號資料。點擊通知開啟後台 `#transfer-requests`，既有登入與權限檢查維持有效。

- AppDeploy：`GET/POST/DELETE /api/admin-transfer-push`，使用管理員工作階段及超級管理員檢查；裝置歸屬取自伺服器登入資料。
- Supabase：`admin_push_subscriptions`、`admin_transfer_push_jobs` 僅供 service role。新 pending 申請的 INSERT trigger 只排入當時已啟用的超級管理員裝置，不補發歷史申請。
- 排程每分鐘檢查待處理工作；沒有工作時不呼叫 Edge Function。發送前重查裝置、角色、帳號與申請狀態。
- `admin-transfer-push` Edge Function 使用既有 VAPID 金鑰及 `MATRIX_NOTIFICATION_DISPATCH_TOKEN`。部署需指定 `admin-transfer-push/deno.json` import map，`verify_jwt=false`；函式自行驗證 `x-matrix-dispatch-token`。
- 工作有兩分鐘租約，網路／429／伺服器失敗採延後重試，最多五次；404／410 停用失效裝置。發送與完成記錄不能形成跨服務交易，極端情況可能重複提醒；service worker 使用固定通知 tag 合併顯示。
- 既有 AppDeploy `public/resources/admin-backend-icon.png` 與 manifest 保留，不替換已安裝的後台圖示。

驗證：62 項後台測試、35 項 dispatcher 測試、17 項 UI／導覽測試通過；後台建置通過。`supabase/tests/admin-transfer-push.sql` 以交易回滾驗證權限、排入、租約、角色異動、停用、重試與失效處理，不留下測試資料。線上未授權呼叫返回 401，授權空佇列返回 200、sent=0。實際手機送達仍需使用者啟用裝置後驗證。
