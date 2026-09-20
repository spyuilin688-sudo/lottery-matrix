# 讀取效率優化（2026-09-20）

基準：`main` 的 `5a63202646e6e7f08ed630cdf539cc07112e8ea6`。本次維持畫面、演算法、結果與權限規則，調整資料讀取方式。

| 範圍 | 調整 |
| --- | --- |
| 首頁摘要 | DB 直接投影摘要，避免傳輸完整卡片／路單至 Edge Function。 |
| 四彩批次 | 同一 HTTP 請求共用一次會員驗證；不同請求不共用。 |
| 天眼展開驗證 | 僅查詢所需期別；保留期別別名與資料衝突檢查。 |
| 狀態及驗證結果 | 完整結果快取 60 秒；每次先向伺服器確認會員權限、期別及分析版本，並檢查回應快照一致性。 |
| 管理台儀表板 | 單一 DB 快照聚合會員／營收，保留台北日期及營收重置規則。 |
| 管理台會員身分 | 僅查當頁所需會員，每批最多 100 人；保留 LINE 顯示名稱備援。 |

## 唯讀資料量比對

使用現有四彩 compact 資料，比較完整 payload 與只含摘要欄位的 JSON 文字位元組數：

| 彩種 | 完整 payload | 摘要投影 |
| --- | ---: | ---: |
| 今彩539 | 5,316 | 188 |
| 天天樂 | 6,532 | 181 |
| 六合彩 | 189,848 | 183 |
| 大樂透 | 221,272 | 189 |
| 合計 | 422,968 | 741 |

這是 DB 至後端的內容量比較，不是整頁流量、實際延遲或上線效能測量。正式環境 schema 與 service_role 讀取權限已唯讀核對；尚未執行新 SQL 的正式環境查詢計畫與部署後端到端驗證。

## 驗證

- Vitest：以下 17 個直接相關測試檔共 221 項通過。
- Python：`services/matrix-api/tests/test_draw_query_api.py` 共 17 項通過。
- `npm run build:pages` 通過，包含 TypeScript 檢查；仍有既有 Tailwind content／大型 bundle 警告。
- PGlite 實際執行新 SQL，驗證摘要投影、期別別名及衝突、最小身分資料、RPC 執行權限與儀表板聚合。
- 獨立審查發現的會員權限變更快取與 LINE 名稱備援問題，均已加回歸測試並修正。
- Premium audit 僅指出未變更的兩個測試 fixture 按鈕：`src/__tests__/AppPermissionSettings.test.tsx` 與 `src/permission-settings.test.tsx`；本次未變更視覺介面。

```sh
node_modules/.bin/vitest run backend/read-efficiency-sql.test.ts backend/matrix-status-edge-handler.test.ts backend/matrix-status-compact.test.ts backend/matrix-status-routes.test.ts backend/matrix-status-analysis-reader.test.ts backend/matrix-status-source-reader.test.ts src/matrix-status-api.test.ts src/__tests__/MatrixStatusPage.test.tsx src/__tests__/HomepageStatusRefresh.test.tsx src/__tests__/lottery-query-pagination.test.ts src/__tests__/lottery-api.test.ts src/__tests__/lottery-two-stage.test.tsx src/__tests__/TianyanExpandedLayoutPatch.test.tsx apps/admin/backend/admin-data.test.ts apps/admin/backend/admin-member-name-consistency.test.ts apps/admin/backend/admin-list-pagination.test.ts apps/admin/backend/admin-table-page.test.ts
python -m pytest services/matrix-api/tests/test_draw_query_api.py -q
npm run build:pages
```

Python 需先安裝 matrix-api 依賴並將 `services/matrix-api` 加入 `PYTHONPATH`。

## 部署順序

本分支尚未套用正式環境 migration 或部署。合併可能觸發自動部署，需先安排以下順序：

1. 依序套用本次四份 migration：`20260920105700`、`20260920105819`、`20260920105823`、`20260920105827`。新增 RPC 限 service_role 使用；既有 compact RPC 未指定 summaryOnly 時仍回傳完整資料。
2. 部署 Railway matrix-api 與 Supabase `matrix-status`、`admin-api`，確認新期別查詢、identity action 與管理台 RPC 可用。
3. 部署前端。新前端依賴後端 identity action 與 periods 查詢，不能先上線。
4. 檢查首頁四彩摘要、切換狀態頁／驗證、會員停用或降級、天眼所需期別、管理台數值與會員名稱。

回復時先回復前端，再回復後端；相容舊呼叫的 SQL 可暫留。不要在新版服務仍運作時刪除新 RPC。
