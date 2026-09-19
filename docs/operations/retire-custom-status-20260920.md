# 自訂觸發狀態退役

## 最新合併檢查：仍由 CI 阻擋

本次使用者已同意合併、部署與依序清除自訂資料，但尚未執行合併、部署或退役遷移。

檢查期間 main 前進至 `c3a52e9b`（PR #685／#686 推薦規則、PR #687 首頁六合彩彩球）。本分支同步保留全部新變更，並解決 PublicCopySwitch 測試衝突；下列 main `2a4c4dcd` 數字僅代表該明確版本的基準對照。

- PR #684 `97cf0c9` 的 Project CI 失敗，不能直接合併。已清除只驗證退役 callback 的 Python 測試；保留正常 Worker、閒置退出及 Recovery 防線。
- 首頁測試改用既有 summary-batch API、每小時刷新及實際 deadline，持續驗證部分失敗、逾時、去重、舊回應與卸載。演算法頁測試重設持久化彩種，避免案例互相污染。
- 舊介面測試依已合併契約更新：`9ad9f417` 移除探索近十期卡片；`67b179c5` 保留會員暱稱與訂閱狀態、獨立控制購買入口。歷史資料元件的十期 API 驗證保留。既有 UX-CONTRACT.md 的訂閱隱藏文字仍與後續已合併行為不同，未改動會員功能。
- 樣式測試沿用 DESIGN.md 的語意框線與品牌按鈕例外；本機 JSDOM 不支援的變數框線改驗證唯一 CSS owner，真實 cascade 仍交由瀏覽器 CI。
- 筆記本工具列內部間距恢復既定 8px，避免誤繼承後續功能頁標題的 14px 間距。標題背景測試改驗證 31 張保留素材及自訂素材不再被引用。

新鮮本機驗證：11 個指定 Vitest 檔案 235/235；4 個指定 Python 檔案 24/24；標題素材、DB chain、Edge import 三個指定 Node 檔案 9/9；型別檢查與 production build 通過。獨立審查沒有重大發現。Chromium 下載逾時，因此不宣稱本機瀏覽器驗收成功。

CI 後續 Node 契約步驟另有大批既有失敗。依本次差異選出的相同 95 個 Node 檔案，在完整 blob 雜湊符合 main `2a4c4dcd` 的獨立副本上，417 項中 108 項失敗；PR 在素材數量修正前為 415 項中 107 項失敗。兩項舊自訂功能斷言隨退役消失，一項素材數量遺漏已修正，其餘為基準已存在的版面／文案／source assertion 問題。未刪除、跳過這些測試，也未放寬 CI gate。下一步須處理這批基準契約問題後，才能完成既定上線順序。

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

### Railway Token 接通後的修正（2026-09-20 03:08 台灣時間）

正式 main 仍為 `2a4c4dcd94e47cc36ceb08df4b8d22ca09bef0e9`，本 PR 尚未合併。

- Token 已儲存於 Supabase `MATRIX_RAILWAY_PROJECT_TOKEN`。03:00 的 Railway Optimizer 自動執行回應 HTTP 200，5 個服務均有 CPU／RAM 各 60 筆；同時段再次呼叫仍只有一筆 observation，沒有遺留 lease，也沒有覆寫 Watchdog heartbeat。
- Railway 將 JSON 日誌拆為 `attributes`，部分 `message` 為空字串。原 collector 只要求 `timestamp message`，導致期別／耗時樣本為空。本次查詢加入 `attributes { key value }`，解析僅取已使用的六個欄位，保留原 JSON message 相容性與資料驗證。
- 02:33 的 Recovery 請求已接受，隨後日誌為 `HTTPStatusError`；Job 記為 `RECOVERY_NOT_VERIFIED`，成功計數為 0。正式 targeted Recovery 的自訂階段仍呼叫 `matrix-status` 的 `recompute`，本 PR 原有退役變更移除此路徑。舊日誌沒有 HTTP 狀態碼，不能斷言是 403、500 或其他回應。
- Recovery 失敗日誌補 HTTP 狀態碼與原請求的彩種、期別、階段；不記錄 URL、認證標頭或回應內容。沒有放寬成功驗證、租約或重試條件。

本次追加驗證：TypeScript 6 個指定檔案 49 passed；Python 5 個指定檔案 28 passed；DB／admin-api 匯入圖 7 passed，合計 84。新增回歸測試先在原實作失敗，再於修正後通過。這些是本機驗證；修正後的正式日誌解析與 Recovery 驗收，須於本 PR 部署後執行。

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
