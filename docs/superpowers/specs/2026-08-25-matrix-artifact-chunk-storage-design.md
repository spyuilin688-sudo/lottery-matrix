# Matrix 演算法結果分片儲存設計

日期：2026-08-25  
狀態：已選定方案 A，待規格確認後進入實作計畫

## 目標

解決 Matrix Python 分析在 Supabase 反覆讀寫單一累積 JSONB 時發生的讀取逾時與 statement timeout，讓今彩539、天天樂、六合彩、大樂透都能斷點續算並完成 explore、tianyan、tiangong、status 四階段。

成功條件：

- 每個排程執行最多計算並儲存 10 個 explore 工作單元。
- 未完成 explore 時，不讀取或覆寫先前累積的大型 JSONB。
- 同一工作單元批次可安全重試，不產生重複分片。
- explore 完成後，後續三階段仍取得與目前相同的完整 artifact 結構。
- 現有 progress 與 result API 路徑、欄位及 HTTP 行為維持相容。
- 已完成且已發布的分析結果不受 migration 影響。

## 現況與根因

目前 pipeline 將每一批 explore 結果追加到既有 artifact，接著把完整 payload upsert 回 `matrix_analysis_artifacts`。當 item 與 validation 資料持續增長，每次 checkpoint 都必須讀取並重寫整包 JSONB。現場失敗已出現在約 900 筆以上的部分結果，錯誤包含 `The read operation timed out` 與 Postgres `57014 statement timeout`。

問題不在單批計算量，而在 checkpoint 的讀寫成本會隨累積結果線性增長。

## 架構決策

### 1. 分片表

新增 `public.matrix_analysis_artifact_chunks`，欄位如下：

| 欄位 | 型別 | 用途 |
|---|---|---|
| `id` | bigint identity primary key | 內部列識別 |
| `lottery` | text | 彩種 |
| `draw_period` | text | 開獎期別 |
| `analysis_version` | text | 分析版本 |
| `kind` | text | artifact 種類；初期使用 explore，結構支援四種 |
| `chunk_index` | integer | 從 0 開始的分片序號 |
| `cursor_start` | integer | 本片第一個工作單元游標 |
| `cursor_end` | integer | 本片完成後游標，採右開區間 |
| `payload` | jsonb | 本片新增的 items 與 validationById |
| `expires_at` | timestamptz | 與 artifact 相同的三天保留期限 |
| `created_at` | timestamptz | 建立時間 |

唯一鍵為 `(lottery, draw_period, analysis_version, kind, chunk_index)`，外鍵連到 `matrix_analysis_runs(lottery, draw_period, analysis_version)` 並採 `on delete cascade`。

查詢使用同一組等值欄位並依 `chunk_index` 排序，因此唯一複合索引同時提供讀取順序的主要索引路徑；另建 `expires_at` 索引供清理。

### 2. Artifact manifest

`matrix_analysis_artifacts` 保留為發布清單及小型 artifact 儲存。explore 完成時，其 `payload` 改存精簡 manifest：

```json
{
  "storage": "chunks",
  "schemaVersion": 1,
  "chunkCount": 39,
  "cursor": 390,
  "total": 390,
  "itemCount": 943
}
```

tianyan、tiangong、status 目前 payload 較小，維持原表直接儲存。Repository 介面保持通用，未來若任一種類超過安全大小，可改用相同分片機制而不改 API。

### 3. Pipeline 資料流

1. worker 讀取 run 的 phase 與 cursor。
2. explore builder 只計算 `cursor ... cursor + 10`，回傳本批 delta，不接收累積 artifact。
3. repository 以 `chunk_index = cursor_start / 10` 原子 upsert 本批分片。
4. 分片成功後才更新 run cursor；若程序在兩步之間中斷，重跑會覆寫同一唯一鍵，結果保持冪等。
5. 尚未完成時立即回傳 progress，不讀取舊分片。
6. 最後一批完成後，repository 依 `chunk_index` 讀取所有分片，在應用程式記憶體合併成原本的 explore 結構。
7. pipeline 寫入 explore manifest，再執行 tianyan、tiangong、status。
8. 四種 artifact 都存在後，才把 run 標記為 complete。

合併規則：

- `items` 按 chunk_index 與片內順序串接。
- `validationById` 以 key 合併；重複 key 必須內容相同，否則拋出 `ANALYSIS_CHUNK_CONFLICT`。
- 回傳的 `lottery` 與 `drawPeriod` 來自 run 識別，不信任分片內可變欄位。

## Repository 介面

新增下列能力：

- `save_artifact_chunk(..., chunk_index, cursor_start, cursor_end, payload)`
- `read_artifact_chunks(..., kind)`
- `materialize_artifact(..., kind)`

`read_artifact` 與 `read_completed_artifact` 對呼叫端維持原語意：若 artifact 是 chunk manifest，內部 materialize 後回傳完整舊格式；若是一般 payload，直接回傳。

`complete_run` 仍以四個已發布 artifact 種類為門檻，不以分片存在本身視為完成。

## API 相容性

以下端點不改路徑：

- `GET /v1/analysis/{lottery}/{draw_period}/progress`
- `GET /v1/analysis/{lottery}/{draw_period}/{kind}`

progress 仍回傳 phase、cursor、total、status、error。結果端點只讀 complete run；未完成或失敗的分片永遠不公開。explore 結果在 repository 內組裝，因此 PWA 不需理解 chunk 格式。

## 錯誤與重試

- 分片寫入失敗：不推進 cursor，run 標記 failed，下一次從相同 cursor 重試。
- cursor 更新失敗：分片已存在，下一次以相同唯一鍵 upsert，不產生重複結果。
- 分片缺號或 cursor 不連續：停止發布並回報 `ANALYSIS_CHUNKS_INCOMPLETE`。
- 分片內容衝突：停止發布並回報 `ANALYSIS_CHUNK_CONFLICT`。
- materialize 逾時：run 不發布，保留分片供後續診斷與重試。
- cleanup 同時刪除到期 manifest 與 chunks；對外已過期結果維持既有 404 行為。

## Migration 與安全性

migration 將：

1. 建立分片表、唯一約束、外鍵與 expiry 索引。
2. 啟用 RLS。
3. 撤銷 anon、authenticated 的全部權限。
4. 僅授予 service_role 所需的 select、insert、update、delete 及 sequence 權限。
5. 只清除非 complete run 的舊 explore 半成品，並把這些 run 重設為 `phase='explore', cursor=0, total=0`；complete run 與其 artifact 不變。

後端繼續只使用 server-side secret/service role；瀏覽器與 PWA 不取得此金鑰。

## 測試策略

採 TDD，先加入失敗測試再實作：

- explore batch 只回傳本批 delta，不複製既有累積 payload。
- 第一批完成後，第二次 run 不呼叫大型 `read_artifact`。
- 相同 chunk 重試只保留一列。
- 游標只在分片寫入成功後推進。
- chunk materialize 還原既有 explore schema 與穩定順序。
- 缺片與衝突分別產生指定錯誤。
- result API 對 chunk manifest 與舊 artifact 回傳相同結構。
- complete run 才能讀取，partial chunks 不可公開。
- cleanup 同時處理 manifest 與 chunks。
- migration 後 RLS、權限、唯一鍵、索引及舊未完成 run 重設符合設計。
- 執行完整 Python 測試套件與既有 schedule/history/API 測試。

## 部署順序

1. 在 GitHub 加入 migration、測試與 repository/pipeline 變更。
2. 執行完整測試與靜態編譯檢查。
3. 套用 Supabase migration，執行 security 與 performance advisors。
4. 部署 worker/API。
5. 依序觸發四彩種，確認 cursor 每批前進且 chunk 大小穩定。
6. 驗證四種 complete artifact、首頁/PWA 讀取與 progress API。
7. 再進入歷史資料補齊、通知推送與 Cloudflare PWA 驗證階段。

## 非目標

- 不改演算法公式與輸出內容。
- 不改天天樂季節時間規則；既定官方開獎時間加 20 分鐘的設計時間保持不變。
- 不在本次變更重做前端彈窗；附圖只作為後續成功、失敗、確認、登入及通知狀態的視覺規範。
- 不以提高資料庫 timeout 作為主要解法。
