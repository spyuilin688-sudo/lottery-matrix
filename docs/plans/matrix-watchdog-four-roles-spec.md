# Matrix Watchdog 四職責深化規格

狀態：待確認的實作規格；本輪僅讀取與核對，尚未修改程式、資料庫、CI 或部署設定。

## 1. 核對基準

- GitHub：`spyuilin688-sudo/lottery-matrix`。
- main：`25037dc4ba4a190888a4077fe558aa886eccc490`。
- 本次雲端查詢時間：約 2026-09-19 16:10–16:15 UTC（台灣 2026-09-20 00:10–00:15）。
- Supabase：`wcimzbbapfrdotjsfyxa`，查詢時為 `ACTIVE_HEALTHY`。
- Railway 主要專案：`divine-simplicity`，production。
- `AGENTS.md`：只執行本次改動直接相關、指定檔案路徑的測試；禁止預設全量測試。

## 2. 使用者指定範圍

| 職責 | 要達成的結果 | 邊界 |
| --- | --- | --- |
| Matrix Watchdog | 判斷現在有沒有壞，逐彩種檢查完整資料鏈 | 深化現有 watchdog.ts |
| Matrix Inspector | 依實際證據定位哪一層失敗 | 不把猜測寫成根因 |
| Matrix Recovery | 對指定彩種、指定期執行安全恢復並驗證 | 沿用既有 lease 與資料模型 |
| Matrix Optimizer | 統計效能、資料庫、權限與程式碼改善候選 | 不自動刪 index、不自動改權限 |
| GitHub CI / Smoke / Verify | 驗證變更並阻擋不合格修正 | 沿用現有流程，補上相關驗收 |

不新增 `monitor_status`、`auto_fix_status`、`repair_logs`。

## 3. 與原文不同的實際狀態

### 3.1 已有能力

`apps/admin/backend/watchdog.ts` 已具備：

- 四彩開獎日及檢查時間判斷。
- `job-failed`、`job-stuck`、`crawler-stale`。
- `analysis-missing`、`analysis-failed`、`analysis-stuck`。
- recovery lease 取得及 Railway 恢復派送。
- 使用 `matrix_watchdog_analysis_state` 讀取當期啟用版本，不只是讀取一筆 analysis run。

該 RPC 在完成分支會檢查啟用版本、必要的 sorted／draw 與分析產物缺漏。這部分應延用，不能降級成只檢查 run.status。

現有 `createIndependentWatchdog` 的 `status: ok` 由派送結果判斷；`accepted`、`already-running`、`lease-held` 不會使它降為 degraded。因此這個 ok 並不代表復原後的資料鏈已完成。

`WatchdogSnapshot` 沒有獨立的 Railway Cron／Runtime 證據、Custom Status 完整性欄位。

### 3.2 Recovery 已是獨立服務

| Railway 服務 | 實際入口 | 查詢到的 Cron |
| --- | --- | --- |
| lottery-matrix | app.worker_all | `3/10 * * * *` |
| fantasy5-crawler | app.fantasy5_railway_job | `33 1,2 * * *` |
| fantasy5-analysis | app.analysis_worker --lottery 天天樂 | `3/10 * * * *` |
| heartfelt-generosity | app.api_server | 無 |
| matrix-recovery | app.recovery_server | 無 |

上述五個服務最新 deployment 均回報 SUCCESS；此項只代表部署狀態。

`RecoveryCoordinator` 已有執行中去重、recovery lease 開始、續租、結束與失去 lease 的處置。`recovery_server.py` 已提供 `/jobs/recover` 等入口。應深化這個服務，不另建同用途服務。

另有一個不同 Railway 專案也叫 lottery-matrix；實作必須以 project ID／service ID 辨識，不能只比服務名稱。

### 3.3 資料模型前提需修正

| 原文欄位 | 本次查詢結果 |
| --- | --- |
| failure_count | 存在於 public.system_job_status |
| retry_count | public／private 欄位盤點未找到 |
| recovery_count | public／private 欄位盤點未找到 |
| last_recovery_at | public／private 欄位盤點未找到 |
| lease_until | 存在於其他用途資料表；system_job_status 使用 lease_expires_at |
| worker_id | public／private 欄位盤點未找到 |

實際既有欄位及表：

- `system_job_status`：failure_count、retry_after、recovery_exhausted、lease_token、lease_expires_at、source_period、database_period、written_period。
- `matrix_watchdog_leases`：lease_key、owner_id、runner_id、acquired_at、recovery_started_at、expires_at。
- `matrix_analysis_runs`：lease_owner、lease_expires_at 與執行時間、版本、期數、狀態。
- `private.admin_watchdog_status`：單筆 status JSON 及 updated_at。

不能把 `failure_count` 當成 retry_count 或 recovery_count；不能把單筆最新狀態當成每次執行的完整歷史。

### 3.4 Advisor 重新查詢

- unused-index：**33 個候選**，不是原文的 34 個。
- 匿名可執行 SECURITY DEFINER RPC：**3 個**，為 matrix_explore_list、matrix_explore_validation、matrix_permission_settings。
- 部分 Edge Functions 確為 verify_jwt=false。
- 本輪沒有逐支完成正式部署 handler 的驗證稽核，因此不判定上述設定為漏洞。

參考：[unused-index 說明](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)。

### 3.5 CI 與部署是兩個不同的現況

- `.github/workflows/ci.yml` 已有依變更選測試、build、release-gate。
- 上述五個 Railway 服務皆回報 `source.checkSuites=false`。
- 因此不能宣稱現有 GitHub CI 已經是 Railway 自動部署的阻擋條件。本輪尚未變更設定。

## 4. 本次資料快照

以 `draw_date DESC NULLS LAST, period DESC` 取得每彩最新資料，再呼叫正式 watchdog analysis RPC：

| 彩種 | 資料庫最新期 | 開獎日期 | Analysis RPC |
| --- | --- | --- | --- |
| 今彩539 | 115000228 | 2026-09-19 | complete |
| 天天樂 | 12004 | 2026-09-19 | complete |
| 六合彩 | 026102 | 2026-09-19 | complete |
| 大樂透 | 115000089 | 2026-09-18 | complete |

此表證明資料庫當下的最新期與 Analysis RPC 狀態；不代表已逐項確認來源最新期、排程每次執行、所有 Custom Status 或完整恢復成功。

抽查 Railway runtime log：

- lottery-matrix 已輸出 lottery、period、outcome、durationMs、stageTimingsMs、executionVersion。
- fantasy5-analysis 有 `天天樂 12004 already-analyzed` 紀錄。
- matrix-recovery 有服務啟動與 `/health`、`/jobs/status` 200 紀錄。

`already-analyzed` 不能被統計成「無新期仍完整重算」。日誌 severity=error 也不能單獨視為故障；本次部分此類訊息只是套件安裝或 bytecode 編譯。

## 5. 擬定修改方式

本節是依需求與實際程式提出的修改方案，尚未實作。

### 5.1 Matrix Watchdog

沿用現有排程、四彩日曆、逾時及 lease 判斷，擴充 snapshot 與輸出契約。

每個彩種報告必須對齊同一期，顯示：

1. 排程是否有執行證據。
2. Job 是否開始。
3. Crawler 是否取得對應來源期數。
4. Draw 是否寫入 Supabase。
5. Analysis 是否完成且必要產物齊備。
6. Matrix Status／Custom Status 是否更新至對應期數及版本。

派送 accepted 只表示已接受恢復工作。SUCCESS 必須在讀回資料後成立。未完成顯示 WAITING；讀取失敗或缺乏證據要明確顯示無法確認，不能當作 OK。

沿用 `private.admin_watchdog_status` 保存檢查結果；同步調整 `watchdog-status.ts` 的型別與清理函式，避免新增證據欄位被現有 sanitizer 刪除。

Matrix Status 與會員 Custom Status 在現有系統不是同一份資料；需分別對照各自的產物與設定。未設定的會員不得直接判為 Custom Status 缺少；具體覆蓋範圍須依現有讀取、重算契約核對。

### 5.2 Matrix Inspector

輸入使用 Watchdog 同一份彩種、期數、版本及異常原因。逐層取得：Cron、deployment、runtime log、job、draw、analysis、lease、status。

每個判斷附上來源、時間及對應期數／執行版本；沒有證據時保留「無法確認」，不得因 analysis 缺少便推定寫入失敗。

例如：有明確 runtime 例外可判斷 Analysis execution FAIL；只有 analysis record 不存在，最多能確認該記錄缺少。Matrix Status 是否「未執行」也需執行證據，不能只靠結果不存在推定。

Inspector 只診斷；恢復仍交由既有 Recovery。

### 5.3 Matrix Recovery

延用 `matrix-recovery`、`RecoveryCoordinator`、`matrix_watchdog_leases` 與 analysis run lease。

統一流程：偵測 → 取得 recovery lease → 執行指定恢復 → 讀回驗證 → 成功或失敗 → 記錄。

| 使用者指定情況 | 恢復範圍 |
| --- | --- |
| Job 未成功／Crawler stale | 沿用既有抓取流程，重新確認最新期 |
| Analysis missing／failed | 對指定彩種、指定期執行既有分析流程 |
| Analysis stuck | 先確認執行狀態及 lease，再決定是否恢復 |
| Matrix Status 缺少 | 對指定彩種、指定期補足狀態，不以全量重跑代替 |
| 暫時性 API 錯誤 | 沿用或補齊有界 retry，不能無限重試 |

`lease-held`、`already-running`、`accepted` 均不得增加成功 recovery_count。失去 lease 的工作不得再把自身寫為恢復成功。

指定期恢復前後若最新期已改變，舊期完成不能被用來表示新期整條鏈 SUCCESS。

原文未提供新的 retry 上限與等待時間，本方案不自行更改現有值。

### 5.4 Matrix Optimizer

只建立候選及證據，不自動修改程式、刪索引或變更權限。

| 項目 | 證據來源及處理 |
| --- | --- |
| Worker／每彩執行時間 | 沿用既有執行時間、stageTimingsMs；缺失處補記錄 |
| CPU／RAM | Railway metrics，保留實際採樣時間範圍 |
| 失敗率／retry／recovery | 明確區分失敗、嘗試、驗證成功；不能直接用最新狀態推算 |
| 空轉／無新期完整執行 | 結合期數、版本、outcome、實際執行階段判斷 |
| 慢 SQL／重複 SQL／掃描／RPC | 依可取得的資料庫統計與呼叫證據判斷；未取得就標示未確認 |
| 資料表增長／index 使用 | 持續採樣及比較；一次 Advisor 結果只列候選 |
| Edge Function | 查部署設定、handler 自訂驗證及執行結果 |
| 程式碼 | main 改動後檢查原文指定的重複、死碼、endpoint、SQL、演算法、API、CSS、selector、測試與錯誤處理 |

未使用 index 要先核對觀察期間、使用統計、程式及資料庫依賴，再列改善候選；不得直接 DROP。

程式碼靜態比對只產生候選。不能僅因名稱相近判為重複演算法，或單次搜尋不到就刪 selector／endpoint。

目前使用者指定的「定期」「長時間觀察」未含頻率、期間與歷史保留方式。本規格不自行填入天數；也不聲稱最新狀態表足以提供長期逐次統計。

### 5.5 GitHub CI / Smoke / Verify

沿用現有 scoped tests 與 release-gate。補上這次變動對應的 TypeScript、Python、SQL 及契約驗收，不執行全量測試。

程式 CI 用來檢查修正版本；每次 Recovery 自身仍必須讀回指定期資料。CI 通過不能代替單次恢復驗證。

Railway 是否等待 CI、等待哪些狀態，須在實際整合設定確認後才能稱為最後防線；不能只因 workflow 存在就宣稱已阻擋部署。

## 6. 驗收條件

1. deployment SUCCESS，但當期 draw 缺少：整鏈不得 SUCCESS。
2. 恢復 accepted，但 analysis 或 status 尚未完成：保持 WAITING。
3. 同一期多次偵測：有效 lease 下不得重複啟動相同恢復。
4. Analysis complete，但必要產物或啟用版本不齊：不得誤報完整成功。
5. Custom Status 缺少：定位至狀態層，不直接判斷整個 Analysis 失敗。
6. Inspector 每個 PASS／FAIL 都能追到相符期數與來源；缺證據不製造根因。
7. Recovery 驗證成功後才記成功次數；失敗或 lease loss 不得計成功。
8. API 暫時錯誤能重試；超過既有重試限制會停止並留下結果。
9. Optimizer 分開記錄跳過、已完成與完整重算，不把正常跳過列為完整空轉。
10. Advisor 警示不觸發自動 DROP 或權限修改。
11. CI 驗證只針對改動相關檔案，並確認部署與該版本驗證結果對應。
12. 不建立第二套監控／修復狀態表；不改動本次未指定的功能流程。

## 7. 實作前需要確認的資料模型選擇

原文要求的三個計數／時間欄位目前不存在，不能直接沿用不存在的欄位。

| 選項 | 作法 | 影響 |
| --- | --- | --- |
| A：擴充既有表 | 在 system_job_status 補 retry_count、recovery_count、last_recovery_at；lease 繼續使用原本欄位與表 | 可持久記錄要求的計數；不另建監控表。需同步定義計數、原子更新與相關寫入流程 |
| B：完全不改欄位 | 僅使用現有表、既有日誌與可取得統計 | 無法承諾完整且持久的 retry／recovery 次數及長期歷史 |

建議 A，理由是符合原文需要計數且不要第二套表的目標；此處屬修改方案，不是既有需求已批准新增欄位的宣稱。

Optimizer 的定期頻率與長期紀錄保留方式仍是原文未提及的設定，須在其實作前確認，不能暗自設定。

## 8. 已讀取的主要證據

- [main 基準](https://github.com/spyuilin688-sudo/lottery-matrix/commit/25037dc4ba4a190888a4077fe558aa886eccc490)
- [watchdog.ts](https://github.com/spyuilin688-sudo/lottery-matrix/blob/25037dc4ba4a190888a4077fe558aa886eccc490/apps/admin/backend/watchdog.ts)
- [watchdog-status.ts](https://github.com/spyuilin688-sudo/lottery-matrix/blob/25037dc4ba4a190888a4077fe558aa886eccc490/apps/admin/backend/watchdog-status.ts)
- [RecoveryCoordinator](https://github.com/spyuilin688-sudo/lottery-matrix/blob/25037dc4ba4a190888a4077fe558aa886eccc490/services/matrix-api/app/recovery.py)
- [Recovery server](https://github.com/spyuilin688-sudo/lottery-matrix/blob/25037dc4ba4a190888a4077fe558aa886eccc490/services/matrix-api/app/recovery_server.py)
- [CI](https://github.com/spyuilin688-sudo/lottery-matrix/blob/25037dc4ba4a190888a4077fe558aa886eccc490/.github/workflows/ci.yml)
- Railway get_status／get_service_config／get_logs 即時查詢。
- Supabase information_schema、system_job_status、lottery_draws、matrix_analysis_runs、matrix_watchdog_analysis_state、cron.job 與 Advisor 即時查詢。

本輪未執行程式測試或 Build，因為尚未修改程式。本輪未部署、未刪除索引、未修改權限。
