# Matrix 分片儲存驗證交接

驗證日期：2026-08-25（Asia/Taipei）

## 已驗證

- GitHub `main` 已包含分片儲存、壓縮 payload、天天樂官方歷史來源與批次 upsert 修正。
- GitHub Actions run `32789245381` 的今彩539、天天樂、六合彩、大樂透四個工作均為 `success`。
- Supabase 最新執行均為 `phase=explore`、`status=running`、`error=null`。
- 各彩種 chunk 從 cursor 0 開始、每段 10 個工作單位、游標連續、無重複複合鍵：

| 彩種 | 期別 | cursor / total | chunks | cursor 範圍 |
|---|---:|---:|---:|---:|
| 今彩539 | 115000205 | 50 / 390 | 5 | 0–50 |
| 天天樂 | 11978 | 10 / 390 | 1 | 0–10 |
| 六合彩 | 026092 | 50 / 546 | 5 | 0–50 |
| 大樂透 | 115000081 | 40 / 546 | 4 | 0–40 |

- 四彩種查詢結果皆為 `non_ten_chunks=0`、`duplicate_keys=0`、`bad_start=0`、`cursor_gaps=0`。
- 完整 Python 測試：`144 passed, 1 warning`，0 failed。
- `python -m compileall -q app tests` 與 `git diff --check` 均以 exit code 0 結束。

## 尚未完成

- 四彩種仍在 explore 階段，尚未達到 `phase=complete` / `status=complete`。
- 最新執行的 `matrix_analysis_artifacts` 完整成品筆數均為 0；必須由每 15 分鐘排程繼續斷點運算。
- 因尚無完整成品，explore、tianyan、tiangong、status 四個完成結果 API 尚不能做正式 HTTP 200 完成態驗收。
- Repository 未提供已部署 Matrix API 的公開 base URL；目前排程直接執行 Python worker，因此只驗證到 GitHub Actions 與 Supabase 儲存層。

## 範圍界線

這份驗證只涵蓋 Matrix 分片儲存、天天樂歷史來源與四彩種斷點續跑，不代表首頁資訊卡、會員、通知、PWA 或天天樂季節時區顯示已完成。
