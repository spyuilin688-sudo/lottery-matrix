# 自訂觸發狀態退役

基準：`spyuilin688-sudo/lottery-matrix` main `2a4c4dcd94e47cc36ceb08df4b8d22ca09bef0e9`。

## 已實作範圍

- 移除自訂頁面、狀態頁設定入口、專用樣式與背景、指南與方案文案。
- 移除會員自訂條件讀寫、結果快取、計算、權限欄位；舊 Edge 自訂操作回應 410，不執行任何工作。
- Worker 不再呼叫自訂重算；Recovery 不再接受自訂階段。
- Watchdog / Inspector / Recovery 成功判定止於一般 Matrix Status。
- 保留既有 22 條一般狀態規則、四彩開獎與分析、通知、共用 Job / Lease / Recovery counters。

## 資料庫清除範圍

`20260920006000_retire_matrix_custom_status.sql` 使用交易與 RESTRICT；不修改歷史遷移。

實際只讀盤點時，`matrix_custom_status_configs` 有 3 筆、`matrix_custom_status_results` 有 3 筆。
遷移移除兩表及其所屬索引、policy、trigger、constraint；另移除 11 個專用函式：6 個 public custom RPC、`matrix_status_identity_get(jsonb)`、4 個 private custom helpers。

共用 chain、完成 recovery、admin operation evidence 與 entitlement 函式更新後保留原有非自訂行為及權限；不清除開獎、分析、一般 Matrix Status、會員、通知、租約或計數器。

## 上線順序

1. 先部署本次前台、admin-api、matrix-status 及 Railway Worker / Recovery 版本。
2. 確認舊 Worker 已停止或完成，且沒有舊版本繼續寫入自訂結果。
3. 套用退役遷移；若出現未預期依賴或鎖逾時，交易失敗而非連帶刪除。
4. 查驗兩表／11 個函式已不存在，一般狀態讀取與四彩鏈正常；重新取得 Watchdog 報告，避免把舊 heartbeat 當作部署後證據。

程式部署先於 DB 清除：新版不依賴自訂表，能與尚未清除的 DB 相容。DB 清除後不能只回滾舊程式，因舊版仍依賴自訂表與 RPC。

## 驗證

- 後端／監控／後台面板：19 個明確測試檔，209 tests passed。
- Worker / Recovery：6 個明確 Python 測試檔，44 passed。
- DB 退役、既有服務 evidence、兩條 Edge import graph：18 passed。
- 前台退役：7 個明確測試檔，52 passed。
- `npx tsc --noEmit`、`npm run build` 通過；獨立審查無重大發現。
- DB 使用 PGlite 執行：一般狀態缺失、wrong owner / runner、過期 lease、舊期數均不能記成功；正常恢復只增加一次；意外依賴造成完整 rollback；非自訂會員權限前後一致。

驗證限制：額外執行的既有 UI source-assertion 測試有 17 個失敗，已在未修改的基準重現相同失敗；HomepageStatusRouting 也有既有 API fixture 不符目前 summary-batch 的失敗。未為本次退役改動無關 UI。獨立嚴格 backend 型別檢查的既有診斷亦在基準存在。手機 Playwright 測試因本機缺少 Chromium headless-shell 無法啟動，不宣稱完成實機驗收。

本次所有測試均明確指定相關檔案，未執行全專案測試。正式資料庫尚未執行退役遷移。

### 基準既有 UI 測試失敗

```text
✖ Matrix 探索、天衍、天工共用設定標題同列的文字切換器
✖ notification consolidation keeps the accepted geometry, typography and selected state
✖ unselected lottery dims its artwork while selected lottery restores brightness
✖ Tiangong second-stage rows keep their matching icons with unified labels
✖ Matrix Guide contains the requested chapters and exact notification set
✖ Matrix Guide documents the current Explore date controls and fixed Tiangong contract
✖ Matrix Guide matches the current history filters and uses spaced halfwidth parentheses
✖ Matrix Guide documents thirteen-period validation totals for every Matrix road
✖ Matrix Guide uses the same restrained gold system for its chapter controls and content
✖ home and Matrix status retain the shared Matrixbba switcher artwork
✖ 彩種按鈕使用共用 1px 圓角框並以亮度表示選取
✖ 號碼對照單期數與開獎號碼分隔線使用清楚一致的色值
✖ 號碼對照單只使用一條 1px 的期數與開獎號碼分隔線
✖ 首頁與 Matrix 狀態的彩種選取框只由共用切換器樣式管理
✖ 首頁 Matrix Core 由單一正式圖稿與亮金圓角框呈現
✖ draw order moves up 2px, shrinks to 25px and keeps a compact near-flat inner seam
✖ bottom navigation keeps four primary columns while quick settings lives in headers
```
