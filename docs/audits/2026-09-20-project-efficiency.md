# 全專案處理紀錄（2026-09-20）

基準：`spyuilin688-sudo/lottery-matrix` main `3d1d296d458c3bacd356ff6a1161e25064540841`。已重新 fetch 並經 GitHub 查核。工作分支：`fix/project-efficiency-20260920`。

## 本次範圍

依使用者清單處理 P0 查詢與 Worker 空轉成本、權限請求重複、P1 儲存盤點與舊排程、P2 索引／服務盤點及監控。保留既有演算法、驗證內容與功能流程。程式／資料庫優化尚未部署；四個退役函式已刪除。列出的歷史用量不是本次改善後實測值。

| 項目 | 處理內容與界線 |
| --- | --- |
| worker_all／fantasy5-analysis | 建立持久完成狀態；變更資料使狀態失效，未確認完成時仍走原完整檢查。10 分鐘啟動頻率不變，故改善每次空轉成本，不宣稱消除所有啟動。 |
| matrix_draw_query | 將期號別名整理移至寫入，維持獨立查詢資料與 revision。latest 只讀最新一筆，history 分頁；tongxing 保留所需歷史運算。保留衝突拒絕與游標失效行為。 |
| 權限輪詢 | 維持 30 秒，合併 focus／visibility／自動更新視窗，避免慢請求重疊；明確權限檢查仍讀取最新資料。未自行改為 5 分鐘或 1 小時。 |
| Explore／天衡／Artifact／validation | 完成現況與使用端盤點。未刪除驗證過程、恢復用 chunks 或 item 欄位。詳見儲存報告。 |
| 舊排程 | 交接改為正式 `3/10`；舊單彩種 Railway 設定移除 cron，刪除舊 timer，保留手動 service。 |
| unused indexes | 最新 48 個零掃描索引逐一分類；22 個為主鍵／唯一索引。兩個 Matrix expiry 索引已有使用紀錄，保留。 |
| notification dispatch | 空佇列先退出，原有到期／重試／過期租約條件不變，再按需要讀 Vault。 |
| optimizer | 依實際樣本數與時間跨度辨識重複空轉；不新增任意長期時數門檻，不自動停用服務。 |
| recovery | 補充分辨驗證未完成與成功紀錄未寫入的日誌；未將歷史 failed 改成 success。 |

draw 快速讀取會增加一份正規化開獎快取與寫入維護成本，並非總儲存量減少；目的是避免每次查詢重做歷史整理與 MD5。結果表的儲存去重仍只完成盤點，未改寫正式資料。

## Edge Functions 已清理

已重新讀取下列四個已部署函式的完整內容，均只有 `410`、`DECOMMISSIONED`，且 repository 搜尋無引用：

- `admin-api-provider-id-test`，version 5。
- `edge-loader-capability-test`，version 12。
- `edge-loader-capability-test-2`，version 5。
- `edge-loader-capability-test-3`，version 5。

已透過已登入的 Supabase 管理介面刪除上述四個函式。刪除後重新呼叫 Supabase 函式清單確認：總數由 16 減為 12，四個名稱均已不存在；其餘正式函式保留。此項清理已在正式環境完成，與本 PR 尚待部署的程式／資料庫優化分開記錄。

## Railway 舊服務盤點

| 服務 | 本次查到的狀態 | 處置 |
| --- | --- | --- |
| impartial-wholeness／lottery-matrix | sleepApplication=true；watchPatterns=`/__railway_disabled__/**`；無 cron。近 8 小時 CPU 平均 0.00004276、RAM 平均 0.02398 GB、網路 0；481 樣本。 | 確認低用量，但資料未能證明未來是否仍需要；未刪除。 |
| divine-simplicity／fantasy5-crawler-verify | 仍綁定 `fix/fantasy5-railway-crawler-20260918`；啟動命令為指定 pytest 驗證；無 cron、restart NEVER；最後部署 2026-09-18 SUCCESS。 | 確認為驗證用途；未刪除。 |
| lucky-reflection／affectionate-analysis | 沒有 deployment、source 或 variables；近 8 小時 CPU／RAM／網路均 0；481 樣本。控制面已有 `isDeleted:true` 待套用變更。 | 未套用他人既有 staged 變更；服務仍存在。 |

目前正式 worker_all 與 fantasy5-analysis 均 `3/10 * * * *`；fantasy5-crawler 為 `33 1,2 * * *`。本次未改正式排程。

## 部署與驗收界線

1. 合併前確認 main 沒有與本分支衝突。先套用新增 migration，再部署使用完成狀態的 Python 版本。RPC 尚未存在時沿用既有檢查。
2. draw cache 初始建置在交易中暫時阻擋 lottery_draws 寫入；舊 revision 游標一次失效，由既有讀取流程重新開始。
3. migration 的快取、失效與權限由本機 PostgreSQL 相容測試驗證；正式延遲、真實多連線競爭與改善後 CPU／額度仍須部署後觀察。
4. 發現問題可先回退 Python／前台版本並保留新增資料結構；不要在使用端仍依賴它時刪除資料表或 trigger。draw RPC 的完整回退需要恢復先前定義，不能只移除維護 trigger。
5. 未刪除正式索引、結果資料、Railway 服務；未自動執行 recovery 或套用其他 staged 變更。

新增 migration 順序：

1. `20260920192323_matrix_draw_indexed_read_cache.sql`
2. `20260920192331_notification_due_before_vault.sql`
3. `20260920193052_worker_completion_cache.sql`

Worker 完成狀態依計算版本、一般／analysis-only 執行方式、部署 SHA 及通知需求隔離；沒有部署 SHA 時沿用原檢查。寫入變動以每次 SQL statement、每彩種失效一次，避免結果批次每列更新完成狀態。首次未命中需通過原完整檢查，才以 generation 比對記錄完成；到期或相關資料變動後重新檢查。兩個開獎 trigger 同時存在的測試已覆蓋別名新增、修正及刪除。

## 詳細查核

- [儲存與 48 個索引分類](2026-09-20-storage-index-audit.md)
- [排程、Optimizer 與 Recovery 證據](2026-09-20-schedule-monitoring-audit.md)

## 最終本機驗證

共 **119 項相關測試通過**；未執行全專案測試。

| 命令／範圍 | 結果 |
| --- | --- |
| `vitest run src/permission-settings-refresh.test.ts src/permission-settings.test.tsx apps/admin/backend/matrix-optimizer.test.ts apps/admin/backend/matrix-optimizer-runner.test.ts` | 25 passed |
| `node --test supabase/tests/matrix-draw-query.test.mjs supabase/tests/notification-dispatch-idle.test.mjs` | 23 passed |
| `node --test tests/worker-completion-cache.test.mjs` | 7 passed |
| `uv run pytest tests/test_worker_completion_cache.py tests/test_worker_all.py tests/test_worker_idle_guards.py tests/test_analysis_worker_completed_idle_guard.py tests/test_fantasy5_worker_split.py tests/test_formal_source_retry.py tests/test_verified_recovery.py tests/test_recovery_coordinator.py tests/test_railway_cron_contract.py tests/test_worker_all_outcome_semantics.py -q` | 58 passed |
| `uv run pytest tests/test_scheduled_worker_resume.py -q` | 6 passed |
| `tsc --noEmit` | exit 0 |
| `npm run build` | exit 0；PWA 與 admin build 完成 |
| `git diff --check` | 通過 |

Python 命令於 `services/matrix-api` 執行。Build 輸出有 bundle 超過 500 kB、admin Tailwind content 設定與 npm http-proxy 設定警告；未將其當作錯誤或擴大本次修改範圍。

獨立審查已修正完成狀態共用範圍與 latest 查詢索引 NULL 排序問題，未留下已識別的重大問題。以上不等於正式環境部署後驗收。
