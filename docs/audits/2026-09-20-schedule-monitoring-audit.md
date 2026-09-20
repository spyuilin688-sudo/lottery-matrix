# 排程、空轉與 Recovery 查核（2026-09-20）

## 正式設定（唯讀）

Railway `divine-simplicity` project `771346b5-650d-46c9-94a3-e0e5d70a6f21`、production environment `eeef9d23-eaa7-4c4c-95c3-0da295a62e8c`：

- `lottery-matrix` (`f421c5a3-0fd2-4a0b-813a-9d68ad9418b9`) 控制面回傳 `uv run python -u -m app.worker_all`、cron `3/10 * * * *`、restart `NEVER`。本次未修改正式服務。
- 更新交接文件中的舊 `3/5`。Repository 中的兩個舊單彩種設定移除 `cronSchedule`，保留手動命令。刪除已退役 systemd timer，保留 service。這避免未來從 repository 再建立重複排程，但不會停止已安裝於其他主機的 timer，也不會清除 Railway 既有環境設定。

## Optimizer 判定

原先 runtime／idle／CPU／RAM 候選一律使用 `insufficient-evidence`。新增「重複空轉執行候選」：來源成功觀察、有日誌、至少兩筆不同且分布於不同時間的樣本，所有樣本均為 `already-acquired`、`already-analyzed`、`no-new-draw` 或 `not-due`。列出精確樣本數、起迄、跨度、平均耗時、已取得的資源數據與截斷狀態。49 筆跨 8 小時的全空轉 fixture 可識別；混合成功／失敗／修復、單筆或重複日誌不可推論全空轉。

這是「所取樣本反覆空轉」的審查候選，沒有任意的 24 小時或 CPU 門檻，不宣稱服務永久無用，不自動停用。每小時 runner 仍只儲存前一小時的有界日誌；截斷不隱藏，缺少日誌不等同空轉。未新增長期完整覆蓋承諾。

## Recovery 的失敗紀錄與主流程成功為不同事實

新查詢歷史部署 `902749bc-5344-4a93-a59b-c7e82e64acc2`（已移除，commit `fe7eec82`）的 Railway 日誌：

- 2026-09-19 18:33:04.291989516Z：`今彩539 recovery failed: HTTPStatusError`
- 2026-09-19 19:33:07.539872558Z：同上。
- 2026-09-19 20:33:04.535807168Z：同上。

舊日誌沒有 HTTP 狀態碼、目標 operation 或 recovery stage。當時部署仍含現已退役的自訂狀態 HTTP recovery 路徑，與既有退役查核記錄相符；不能從這三行確定是哪一個 HTTP 呼叫或宣稱特定 403／500 原因。

最新 `SUCCESS` 部署 `7077ce8c-dc29-4b8b-94f8-3070fb5851dc`（commit `e1d3ea7`，2026-09-20 11:25Z）僅回傳 9 筆啟動／health 日誌，沒有 recovery 執行。直接以 service 查 latest 會落到 `SKIPPED` 部署且無日誌，故本次改查具體成功與歷史部署。未觸發新的 recovery，不能宣稱已於正式環境驗證恢復。

SQL `finish_matrix_watchdog_recovery` 在沒有成功驗證記錄的租約釋放時寫入 `RECOVERY_NOT_VERIFIED`；它是本次 recovery 未完成驗證的結果，不是後續主流程狀態。後來主 refresh 成功不應把舊 recovery 的成功次數補算。

現行 coordinator 對 chain verification false 與 completion RPC false 原先均無專門日誌。本次只加 `recovery-not-verified` 的 `CHAIN_INCOMPLETE`／`COMPLETION_NOT_RECORDED` 原因、彩種、期數與階段，讓後續失敗能區分。成功計數、驗證條件、租約釋放與重試完全沿用既有流程；不記錄憑證、URL 或 HTTP body。

## 限定驗證

- `node_modules/.bin/vitest run apps/admin/backend/matrix-optimizer.test.ts apps/admin/backend/matrix-optimizer-runner.test.ts`：17 passed。
- 在 `services/matrix-api`：`uv run pytest tests/test_verified_recovery.py tests/test_recovery_coordinator.py tests/test_worker_all.py tests/test_railway_cron_contract.py -q`：21 passed。
- 未跑全專案測試；未部署、修改正式排程或觸發新 recovery。
