# Matrix Explore 演算法修正計畫

> 執行時遵循 systematic debugging、TDD 與 completion verification；每個行為先寫會失敗的測試，再修改 production code。

## 1. 鎖定影像契約

- 新增本規格文件，記錄 15 張圖可直接證明的時間、球位、加減、拖牌、合值與連準規則。
- 明確列出不修改 UI、天衍、天工與未被圖片證明的特別號產品決策。

## 2. 先建立 RED 測試

修改以下測試，先在現有實作上觀察失敗：

- `backend/matrix-algorithm.test.ts`
- `services/matrix-api/tests/test_explore.py`
  - 非同期／不同參照位置的 `+0` 必須保留為加減並使用參照 base。
  - 合值的非法補數不得 modulo 回捲成合法號碼。
- `backend/matrix-explore-service.test.ts`
- `services/matrix-api/tests/test_artifact_builders.py`
- `services/matrix-api/tests/test_explore_batches.py`
  - raw result 只掛到 `predictionDistance = sourceIndex - dateOffset + 1` 的選項。
  - 2／7／13 期仍各自覆蓋精確來源數，但不跨日期邊界複製。
  - work unit 只計算來源 index 對三個日期邊界真正需要的 1..13 距離。
- `services/matrix-api/tests/test_analysis_repository.py`
  - Supabase chunk 寫入後必須可由既有 RPC 的 JSONB 欄位契約直接讀取。
- `services/matrix-api/tests/test_worker.py`
  - 新契約使用 `matrix-python-v3`。

## 3. 最小 production 修正

- 同步修改 TypeScript 與 Python Explore 核心：
  - 移除加減 `+0` 轉拖牌的分支。
  - exact same-source/same-position 的加減整族抑制邏輯仍保留。
  - 合值套用回傳 nullable，過界候選省略；沒有合法本期候選的版路不輸出。
- 同步修改 TypeScript 與 Python artifact builder：selection helper 納入 raw `predictionDistance`。
- work unit 的距離範圍縮成每個 source 對本日／昨日／前日所需的連續小區間。
- Supabase repository 將 chunk payload 直接寫成 `{items, validationById}`，既有 reader 仍保留舊 envelope 解碼能力以相容歷史資料。
- Worker analysis version 升為 `matrix-python-v3`。

## 4. 驗證

- 先跑上述 targeted Python／TypeScript tests。
- 跑完整 Python suite、完整 Vitest、TypeScript build／repository CI 可執行檢查。
- 比較修正前後 work-unit distance evaluation budget 與 artifact row counts；確認縮減來自精確邊界，不是硬截斷結果。
- 用 Supabase 唯讀查詢確認沒有複合鍵重複，並確認新版本寫入 plain JSON chunks 後 RPC list/detail 能讀取。

## 5. GitHub 與上線

- 以最新 `main` SHA 建立獨立修正分支，避免覆寫同時進行的 UI 變更。
- 提交 PR，等待 required CI 通過後再合併。
- Railway 部署後重算 `matrix-python-v3`；確認 run complete、chunk cursor 連續、RPC 回傳筆數與唯一 ID 一致。
- Cloudflare 前端契約不變，無需 UI 改版；只做 production smoke check。

