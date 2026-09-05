# 三項故障修復驗證（2026-09-05）

- 轉帳開通：正式 `admin_review_transfer_request` 仍含 `pg_catalog.coalesce/greatest`，與 main 已修正定義不一致。使用向前遷移修正 SQL 語法，保留會員到期日累加、單筆付款、交易回滾與管理員審計規則。
- 啟動碼新增：舊的單一 role setting 未讀取現行 PostgREST JSON claims。沿用 `auth.role()` 相容解析；仍僅允許 service_role 執行，期限、數量、格式及有效期不變。
- 六合探索：026095 標示完成但結果與來源 artifact 已不存在；三天清理規則可以造成此狀態。修正為保留既有探索日期偏移 0/1/2 對應的最近三個完成期，以及運算中工作。缺少 explore artifact 的完成工作透過原子 lease 從頭重建；真正空結果保留完成狀態。
- 不修改前端版面、篩選條件、演算法、開獎来源或排程頻率。

## 驗證證據

- 修正前：轉帳測試重現 42883；現行 claims 的啟動碼新增重現 42501；缺 artifact 的完成工作無法重建。
- 正式 migrations：20260905140908、20260905141003。套用時附合成資料測試；測試資料以子交易回滾，失敗會阻止遷移提交。
- 轉帳／啟動碼 7 組實際 SQL 回歸通過，包括 35 種期限與數量組合。無真實申請被審核，也未留下測試啟動碼或會員。
- 兩組 Matrix SQL 回歸通過：來源缺失重建、互斥 lease、合法空 artifact、三張表的過期清理及 RPC 權限。
- Python repository／pipeline／worker 與新增回歸共 80 項通過。
- 正式六合彩 026096 已完成，儲存 15,041 筆版路；二期、順球、標準範圍及預設連準的列表回傳 2 筆，第一筆驗證 RPC 回傳 complete。此期由既有 worker 完成。
- AppDeploy 後臺本來即呼叫這兩個 Supabase RPC；不需要改其前端或重新部署後臺。
- SQL 修正先部署，再部署使用新清理 RPC 的 Python worker。更早已清除的歷史資料不會僅因保留規則而自動出現。
