# 管理員後台全面功能檢查 — 2026-09-16

基準 main: 2883398f9969d0ab5d2e6e855d5e53b9037a95de

檢查範圍：
- 營運概覽
- 代辦事項
- 用戶管理
- 訂閱管理
- 收入報表
- 登入紀錄
- 通知管理
- 審計日誌
- 管理員權限
- 權限切換
- 系統設定
- 啟動碼管理
- UserInfoDialog
- 前後端 API 對應
- Supabase 資料來源與必要欄位
- Railway production 狀態
- 手機／桌面響應式相關規則

目前已驗證：
- Supabase project: ACTIVE_HEALTHY
- Railway production lottery-matrix: SUCCESS
- 訂閱管理會員名稱修正已在 main 2883398f

狀態：檢查進行中。只記錄有實際證據的結果；發現缺陷後先定位根因，再建立回歸測試與最小修正。
