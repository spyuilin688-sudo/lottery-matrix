# Matrix Python／FastAPI Oracle 後端設計

日期：2026-08-24

Repository：`lottery-matrix`

Branch：`main`

狀態：已確認，開始實作

## 1. 目標

將目前受 AppDeploy 30 秒執行上限影響的大量後臺工作移至 Python／FastAPI，正式執行於 Oracle Cloud。現有 React／PWA、已確認 UI、探索／天衍／天工演算法規則、Matrix 狀態規則、會員流程與通知流程保持不變。

## 2. 正式責任分工

| 項目 | 原始碼 | 實際執行／儲存位置 |
|---|---|---|
| React／PWA | GitHub `lottery-matrix` | 現有前端部署／Cloudflare Pages |
| Python／FastAPI | GitHub `lottery-matrix` | Oracle Cloud |
| 爬蟲 | GitHub `lottery-matrix` | Oracle Cloud |
| 探索／天衍／天工演算法 | GitHub `lottery-matrix` | Oracle Cloud |
| Matrix 狀態判斷 | GitHub `lottery-matrix` | Oracle Cloud |
| 開獎資料 | 不適用 | Supabase |
| 演算法結果 | 不適用 | Supabase |
| 狀態結果 | 不適用 | Supabase |
| 通知資料 | 不適用 | Supabase |
| 會員資料 | 不適用 | Supabase |

GitHub 只保存程式碼，不執行演算法。

## 3. 不變範圍

- 四個彩種仍為今彩539、天天樂、六合彩、大樂透。
- 探索、天衍、天工及 Matrix 狀態沿用目前 `backend/` 的正式規則與測試案例。
- PWA 不執行演算法，不產生假結果，不混用不同分析版本。
- 使用者查詢只讀取已完成結果，不在查詢時重新執行大量計算。
- 分析結果保留 3 天。
- 本階段不修改任何 UI、文字、版面、流程或會員權限。

## 4. 資料流程

1. Oracle Cloud 的爬蟲取得某彩種最新開獎資料。
2. 驗證期號、日期、彩球數量、兩位數格式及號碼唯一性。
3. 將開獎資料寫入 Supabase；同彩種、同期號重複執行時更新同一筆資料。
4. 建立該彩種、該期號及該分析版本的工作紀錄。
5. 依序完成探索、天衍、天工與 Matrix 狀態計算。
6. 各結果先寫入尚未公開的分析版本。
7. 四類結果都完整寫入後，才將該分析版本標記為完成。
8. PWA／既有 API 只讀取標記為完成的分析版本。
9. 清除超過 3 天的演算法及狀態結果。

單一彩種失敗不得阻塞其他彩種。相同彩種、期號及分析版本重複執行時，不得建立兩套完成結果。

## 5. Supabase 資料結構

### `lottery_draws`

保存四個彩種的正式開獎資料。唯一鍵為 `lottery + period`。

### `matrix_analysis_runs`

保存每次分析的彩種、期號、分析版本、目前階段、進度、狀態、開始時間、完成時間及錯誤。

### `matrix_analysis_artifacts`

保存 `explore`、`tianyan`、`tiangong`、`status` 四種結果。唯一鍵為 `lottery + draw_period + analysis_version + kind`，結果使用 `jsonb`。

上述三個表位於 `public`，啟用 RLS；不提供 `anon` 或 `authenticated` 直接寫入。Oracle Cloud 只能透過後端秘密金鑰寫入，秘密金鑰不得進入前端或 GitHub。

## 6. FastAPI 邊界

- `GET /health`：確認 FastAPI 程序可回應。
- `GET /v1/analysis/{lottery}/{draw_period}/progress`：讀取計算進度。
- `GET /v1/analysis/{lottery}/{draw_period}/{kind}`：只讀取已完成結果。

大量計算由 Oracle Cloud 的定時工作直接呼叫 Python 管線；本階段不建立對外公開的手動啟動端點。

## 7. 錯誤與一致性

- 開獎資料不完整時停止該彩種計算並記錄失敗。
- 任一演算法階段失敗時，不將該分析版本標記為完成。
- PWA 不得讀取 `running` 或 `failed` 版本。
- Supabase 寫入失敗時保留失敗進度，下一次可由相同唯一鍵安全重試。
- 回應不得包含 Supabase 秘密金鑰、Oracle 環境變數或內部錯誤堆疊。

## 8. 驗收

- Python 核心測試覆蓋現有 TypeScript 正式案例。
- FastAPI 健康狀態、進度及完成結果端點都有測試。
- Supabase 儲存層以測試替身驗證重複寫入、完成版本與失敗版本行為。
- Supabase 遷移後三個新表均啟用 RLS。
- 現有 627 項前端／TypeScript 單元測試保持通過。
- React／PWA 正式建置保持通過，且 UI 無變更。

