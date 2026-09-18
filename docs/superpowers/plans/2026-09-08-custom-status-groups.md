# 自訂觸發條件群組 Implementation Plan

> For agentic workers: use the approved user specification in this conversation; execute independent backend and SQL tasks alongside the frontend, then verify the integrated change.

**Goal:** 自訂狀態頁直接編輯22條預設模板，範圍、版路關係與AND/OR完整儲存及判定。
**Architecture:** Python Worker、TS Edge與前端共用一份JSON預設條件。TS共用v2型別、轉換與驗證；Supabase RPC驗證並保存JSON。前端保留原三列，按一碼／兩碼呈現可編輯群組卡。
**Tech Stack:** React、TypeScript、Python、Supabase Postgres。
**Spec:** 使用者2026-09-08本對話完整指示；本文件的固定要求逐項對應該指示。

## Global Constraints

- 標題、彩種列、四狀態列的結構與樣式不變。只改狀態列下方。
- 不出圖；不變更首頁、通知、演算法探索、會員權限。
- 固定13期、完整範圍；一碼／兩碼分區；每個預設規則一張群組卡。
- 群組rows為AND；不同群組為OR；同卡需屬於同一組預測號碼。
- 連準起點／終點；同碼最少／最多(null=不限)；版路複選及any/all關係。
- FOCUS-2、RESONANCE-3、CRITICAL-2沿用原本兩種版路組合各自計數及擇一成立，仍維持22張。不得轉成三路總和或三路皆存在。
- 舊設定連準轉同起終點、單版路轉單元素陣列、最低數量轉min且max=null；不刪除舊資料。
- 禁止全量測試；命令必須明確指定本次直接相關測試檔案。

## Task 1: 共用資料模型與預設／自訂判定

Files: shared/matrix-status-config.ts、services/matrix-api/app/domain/status-rules.json、backend/matrix-custom-status.ts、backend/matrix-status.ts、backend/matrix-status-service.ts、services/matrix-api/app/domain/status.py及直接相關測試。

- [x] 寫範圍上下界、any/all、同result AND、跨群組OR、特殊三規則與舊資料相容測試並確認失敗。
- [x] 實作v2正規化與驗證；定義22條canonical JSON；預設與自訂走同條件判定。
- [x] 執行指定backend測試與 `python -m pytest services/matrix-api/tests/test_status.py`，確認preset邊界與witness未改。

## Task 2: Supabase儲存

Files: 新supabase migration與supabase/tests SQL。

- [x] 比對live RPC原文，保留member ownership、會員權限及reset/list契約。
- [x] 驗證v2巢狀結構、range、duplicate、types與複合權限，舊payload無損轉換。
- [x] 新migration只更新必要validator/save；不批次改舊會員資料。
- [x] 執行針對性SQL案例；如本機環境受限，記錄未驗證項目，不以靜態閱讀替代執行。

## Task 3: 手機編輯介面

Files: src/matrix-status-api.ts、src/features/MatrixStatusPages.tsx、src/features/CustomConditionSection.tsx、src/feature-pages.css、src/__tests__/MatrixCustomStatusPage.test.tsx。

- [x] 測試22張模板、直接編輯切為已自訂、欄位range、同卡AND／跨卡OR、save/reset、舊payload、延遲回應與invalid range。
- [x] 保留三列原JSX與CSS；下面改探索條件、模式、一碼／兩碼群組、儲存／重置。
- [x] 以原生select、checkbox與number input實作，重用既有深色金框樣式；手機單欄欄位，range二欄。
- [x] 執行 `node_modules/.bin/vitest run src/__tests__/MatrixCustomStatusPage.test.tsx src/matrix-status-api.test.ts`。

## Task 4: 整合交付

- [x] 跑明確相關TS、Python、SQL測試及typecheck/build；只重跑處理具體風險所需範圍。
- [x] 比對上方三列與其他頁面未改，確認沒有舊preset硬編碼副本。
- [x] 檢查最新GitHub main，完成可審查分支／PR所需變更；不把未部署說成正式已更新。


## 驗證與交付紀錄

- 共用契約與backend指定10個測試檔案：135項通過。涵蓋range邊界、any/all、同result AND、OR、舊格式、會員權限及22條模板的140組跨TS/Python比對案例。
- UI與API指定2個測試檔案：15項通過。包含審查發現的降級回歸：可取消原已勾選的複合，取消後不可重新新增。
- `services/matrix-api/tests/test_status.py`：45項通過。獨立審查另以固定種子3,000組案例比對舊Python完整結果與witness，均一致。
- `supabase/tests/matrix_custom_status_v2.sql`：在PGlite執行通過，測試交易rollback；包含深層驗證、舊payload、身份及會員權限、跨會員／跨slot隔離與失敗不寫入。
- `node_modules/.bin/tsc --noEmit`、`npm run build:pages`、`git diff --check`通過。原有27個runtime保護檔案檢查通過。建置仍有既有大chunk警告。
- 比對基準原始碼確認標題、彩種列、四狀態列、其他Matrix狀態頁及自訂內容範圍以外的CSS未變更。
- Premium靜態audit在本次修改檔案沒有發現項目；整庫仍有2個未修改檔案的既有actionless-button項目，未擴張處理範圍。
- 未執行全量測試、瀏覽器視覺驗證、正式Deno打包或live Supabase migration／部署。SQL執行驗證使用本機auth／entitlement fixtures；正式環境仍需部署驗證。

### 上線順序

1. 先套用`supabase/migrations/20260908040432_matrix_custom_status_v2.sql`，接受舊與v2 payload，保留既有會員資料。
2. 更新Matrix status Edge Function及Python服務，包含新的共用契約與`status-rules.json`；確認正式Deno打包及22條模板能載入。
3. 再部署前端群組編輯介面，確認儲存／重置及首頁套用。

相關測試命令：

```sh
node_modules/.bin/vitest run shared/matrix-status-config.test.ts backend/matrix-status-v2.test.ts backend/matrix-status-preset-parity.test.ts backend/matrix-status.test.ts backend/matrix-custom-status.test.ts backend/matrix-status-service.test.ts backend/matrix-custom-status-store.test.ts backend/matrix-custom-status-routes.test.ts backend/matrix-status-routes.test.ts backend/matrix-status-edge-handler.test.ts src/__tests__/MatrixCustomStatusPage.test.tsx src/matrix-status-api.test.ts
cd services/matrix-api
python -m pytest tests/test_status.py
```


## 2026-09-08 正式環境更新

- Supabase migration 已套用，實際版本為20260908040432；檔名同步對齊migration history。
- 正式資料庫接受全部22條預設模板；原有1筆會員設定的內容摘要前後一致。匿名角色無儲存權限，會員角色保留原存取方式。
- Matrix status Edge Function 已部署為version 14，13個部署來源檔案逐一比對一致，包含共用JSON模板。
- Railway對合併提交5f74b42回報3個服務部署成功。
- 這次發佈提交使用GitHub專用的[skip actions]，遵守AGENTS.md只跑相關測試的要求，並觸發Cloudflare Pages更新。
