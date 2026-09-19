# Matrix 天樞 Implementation Plan

> For agentic workers: use Superpowers task execution and focused verification. User's explicit requested change is the controlling specification.

**Goal:** 完整新增三碼鎖定天樞，沿用天衡規則及介面。
**Architecture:** 共用天衡計算核心，按鎖定數量選擇組合；獨立成品、正規化儲存與 RPC；前端共用現有元件。
**Tech Stack:** Python、Postgres／Supabase、React／TypeScript。
**Spec:** `docs/superpowers/specs/2026-09-19-matrix-tianshu-design.md`

## Global Constraints
- 保留天衡雙碼結果、ID、連準規則及存取行為。
- 三碼同一期、位置遞增、全部匹配；除鎖定數量以外，所有選項及規則比照天衡。
- 不新增 !important、inline style、重複覆寫或視覺資產。
- 只跑明確指定的相關測試；不執行全量測試。
- 不修改正式 Supabase、Railway、main；先提供可審查變更。

## Review Focus
1. 只匹配兩碼的歷史組必須排除；第三碼參與索引、快取及結果 ID。
2. 雙碼與三碼工作不能互用 session／結果；既有結果 ID 不變。
3. 分析完成、復原、active版本與清理必須涵蓋天樞，舊版本仍可讀。
4. 列表、驗證、權限及選定分析版本一致，不混入天衡結果。
5. 手機摘要與三行鎖定欄位不遮擋，既有尺寸、間距維持。

### Task 1: Python 計算及分析整合
**Files:** `services/matrix-api/app/domain/tianheng_context.py`, `tianheng_runtime.py`, 新增薄天樞入口（若需要）；`app/services/artifact_builders.py`, `analysis_pipeline.py`, `app/repositories/analysis_repository.py`, `app/worker.py`, `app/analysis_worker.py` 及直接相關測試。
**Produces:** `tianshu` phase/artifact；天衡原欄位加 `thirdNumber`/`thirdLockedPosition`，驗證三項；`save_tianshu_results`, `has_tianshu_results` 及 restore 對應 `matrix_tianshu_results`。
- [x] 先以明確的5球/7球組合、第三碼不匹配、同期排除、相異第三碼ID建立失敗測試。
- [x] 將鎖定數量參數化，保留雙碼預設及結果格式，沿用天衡候選規則。
- [x] 加入分批階段、資料正規化、儲存、完整性與復原流程。
- [x] 執行新增測試及直接相關天衡／pipeline測試，記錄命令、結果與風險。

### Task 2: Supabase 結果及 RPC
**Files:** 新 migration 與 `supabase/tests/matrix-tianshu-migration.test.mjs`，沿用本機 PGlite harness。
**Consumes:** Task 1 定義之天樞資料欄位、kind與table名稱。
- [x] 先以天衡契約為對照，測三碼列表、驗證、同碼、期數／範圍／權限與版本。
- [x] 用 Supabase CLI 產生 migration；重用目前已更新的天衡 RPC，加入第三欄、獨立成品及表。
- [x] 延伸 owned writes、restore、完成檢查、版本讀取與清理，不破壞舊版本。
- [x] 執行相關 SQL 回歸，不套用正式資料庫。

### Task 3: 前端共用頁面與整合驗收
**Files:** `src/matrix-algorithm-api.ts`, `src/features/MatrixExplorePage.tsx`, `MatrixValidation.tsx`, `router.tsx`, `navigation.tsx`, `shared.tsx`, `BrandHeader.tsx`，直接相關導覽、文件及測試。
**Consumes:** `matrix_tianshu_list`/`matrix_tianshu_validation`，kind `tianshu`，第三鎖定欄位及三項驗證陣列。
- [x] 新增失敗元件/API測試，確認獨立RPC、相同選項及三碼顯示。
- [x] 延伸現有天衡分支與共用樣式，不複製整頁、不改既有流程。
- [x] 新增天樞路由及共用頁面切換入口；標題沿用天衡背景與共用logo。
- [x] 執行直接相關元件/API測試、TypeScript與build。
- [ ] 瀏覽器對照天衡與天樞，320／390px及桌面檢查設定、結果與展開驗證。
- [ ] 審查整體diff與最新main差異，建立可審查分支／PR。

## Verification environment

本機 Chromium 下載受網路限制，雲端瀏覽器無法連線本機。沿用專案 GitHub Actions 的 Chromium 流程，新增僅執行天樞版面測試的 workflow，保留 320／390px 與桌面截圖；PR 維持草稿，正式服務不部署。
