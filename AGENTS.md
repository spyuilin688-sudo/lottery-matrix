# 專案工作規則

## 正式部署來源

- PWA 與管理後台前端部署於 Cloudflare Pages：`https://matrixlottery.idv.tw/` 與 `/admin/`。
- 管理後台 API 的正式執行入口是 Supabase `admin-api` Edge Function；程式位於 `supabase/functions/admin-api/` 與 `apps/admin/backend/`。
- 判斷現行部署須檢查正式入口、匯入路徑及 `PROJECT_HANDOFF.md`；歷史計畫、舊資料庫遷移名稱及過期測試不能當作現行平台依據。

## 測試執行規則

- 每次修改後，只執行與本次變更直接相關的測試。
- 合併或部署前，也只執行與本次變更直接相關的測試。
- 禁止預設執行全量測試。
- 只有使用者明確要求時，才執行全量測試。

## 測試限制

- 禁止執行全專案測試。
- 禁止執行 `npm run test:unit`、`npm test` 或未指定檔案的 `vitest run`。
- 只能執行本次修改直接相關的測試檔案。
- 執行前必須確認測試命令包含明確檔案路徑。
- 若無法限定測試範圍，停止並詢問使用者。
- 只有使用者當次明確同意，才可執行全專案測試。
