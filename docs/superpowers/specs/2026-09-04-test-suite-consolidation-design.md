# Test Suite Consolidation Design

日期：2026-09-04
基底：`main@c0e13b7719715c621c77e175acdfab12c9a2d44d`

## 1. 目的

整理目前 `tests/` 與 Project CI 的測試架構，降低重複執行、淘汰已被新版規格取代的舊測試、合併同功能零碎測試，同時保留核心功能、有效回歸、防呆、安全、migration 與響應式測試。

本次不以「測試檔案最少」為目標，而以「同一規格只有一份權威測試契約、測試層級清楚、回歸能力不下降」為目標。

## 2. 已確認的現況

`.github/workflows/ci.yml` 的 `test-and-build` job 目前依序執行：

1. `npm run test:unit`
2. `Targeted Explore tests`：單獨執行 3 個 `tests/*.test.mjs`
3. `npm run build`
4. `node --test tests/*.test.mjs`

因此 `matrix-explore-fluid-layout.test.mjs`、`matrix-explore-option-layout.test.mjs`、`recent-history-layout.test.mjs` 會在同一個 CI job 內被執行兩次。

`tests/` 目前亦存在大量依歷次 UI／修復需求逐步增加的零碎測試，例如 Bottom Navigation、Homepage、History、Matrix Explore、Notification、Number Reference、Responsive 等功能各自有多個 `.test.mjs`。其中 Matrix Explore 又同時包含近期 #259／#284 的新版回歸測試與較早 UI 契約，需要特別比對是否互相重複或已過時。

## 3. 範圍

### 3.1 本次會修改

- `.github/workflows/ci.yml`
- `tests/` 下與盤點結果直接相關的 Node 測試、Playwright spec、fixture 與測試說明檔
- 必要時更新測試專用 helper，僅用於移除重複測試程式碼
- 新增一份測試盤點報告，記錄每個 `tests/` 項目的最終處置與理由

### 3.2 本次不主動修改

- production 功能程式碼
- production CSS／元件排版
- Supabase schema／migration 內容
- Matrix API 演算法
- Admin 功能
- AppDeploy／Cloudflare 部署設定

若測試整理過程發現 production 真實缺陷，先記錄為獨立問題；不得為了讓測試變綠而順手修改與本次測試整理無直接關係的 production code。

## 4. 測試盤點與分類方法

對 `tests/` 內每一個檔案逐一建立 inventory，至少記錄：

- 檔名
- 測試層級：Node / Playwright / fixture / helper / 說明文件
- 所屬功能域
- 驗證的 production 檔案或規格
- 是否仍符合最新規格
- 是否與其他 assertion 重複
- 最終處置
- 理由與替代測試位置

最終處置只使用以下類別：

### KEEP

保留原檔。適用於：

- 核心演算法／公式／資料轉換
- security／RLS／RPC 權限
- migration contract
- 曾發生真實 regression 且仍可能再次發生
- Playwright 才能可靠驗證的瀏覽器行為、computed layout、scroll、safe-area、interaction
- 功能雖相同但測試層級不同，且不是重複驗證同一個 invariant

### MERGE

檔案本身刪除，但有效 assertion 搬入同功能 canonical test file。適用於：

- 同功能被拆成多個小型 `.test.mjs`
- assertion 有效，但單獨一檔沒有獨立維護價值
- 合併後可更清楚看出同一功能的完整契約

### DELETE_DUPLICATE

直接刪除完全重複 assertion。判定必須至少符合：

- 驗證同一 production target
- matcher／expected value 等價
- 沒有提供額外輸入案例、邊界案例或不同執行層級的保護

僅文字不同但驗證同一件事，也視為 semantic duplicate，但刪除前必須確認保留版本涵蓋相同失敗模式。

### DELETE_OBSOLETE

舊規格已被新版正式規格取代，且保留會與目前正確行為衝突。判斷依序以：

1. 使用者最新確認規格
2. 已合併且仍有效的新版 regression contract
3. `UX-CONTRACT.md`／目前正式規格文件
4. 最新 `main` 的實際正確行為
5. Git／PR 歷史確認規格演進

不得僅因測試目前失敗就判定為 obsolete。

## 5. Canonical 測試檔原則

採「功能域」整併，不採「全站一個超大測試檔」。

### 5.1 Matrix Explore

優先收斂為少數明確邊界：

- 核心公式／rule resolution／拖牌順序／真正 RHS 計算
- Explore UI／spacing／responsive／special number 等 Node contract
- Explore migration／data ordering contract
- Playwright responsive／interaction spec

#259 恢復的公式核心與 #284 後續有效 UI regression 必須保留，不得因整併而弱化。

### 5.2 Bottom Navigation

將 cleanup、height、safe-area、double-tap 等同層級 Node contract 依實際 assertion 合併；Playwright browser behavior 若提供不同失敗模式則獨立保留。

### 5.3 Homepage

將歷次 homepage layout／spacing／frame／feature gap 等零碎 Node contract 依目前有效規格整合。舊固定尺寸若已被新版 responsive contract 取代，移除舊 assertion，不得讓舊測試重新鎖死版面。

### 5.4 History

將 filter、spacing、week group、layout 等 Node contract 合併到少數 canonical 檔；computed-style 或真實瀏覽器行為只在必要時留 Playwright。

### 5.5 Notification、Number Reference、Subscription、Shared UI

各自依同樣原則整併。不同安全／資料權限測試不得因 UI 功能同名而併入 UI 檔。

### 5.6 Migration／Security／Runtime Integrity

這類測試以可追溯性優先，不強求合檔。不同 migration 或不同 security boundary 即使 assertion 結構相似，也不視為可以刪除的重複測試。

## 6. 重複 assertion 判定

盤點時同時做兩層檢查：

### 6.1 Exact duplicate

比對相同或正規化後相同的：

- `assert.match`
- `assert.doesNotMatch`
- `assert.equal` / `strictEqual`
- `assert.ok`
- 同一 CSS selector + property + expected value
- 同一 source regex contract

### 6.2 Semantic duplicate

人工確認不同寫法是否仍只保護同一 failure mode，例如：

- 一個測試檢查 `.foo { gap: 4px }`
- 另一個測試從同一 CSS source 再檢查相同 selector 的 `gap: 4px`

若其中一個還額外驗證 responsive breakpoint、override precedence、不同 source file 或 browser computed style，則不視為完全重複。

## 7. CI 設計

`test-and-build` 最終改為：

1. `Full Vitest suite` → `npm run test:unit`
2. `Production build for packaging tests` → `npm run build`
3. `Full Node tests` → `node --test tests/*.test.mjs`

刪除獨立的 `Targeted Explore tests` step，因其測試已包含在 Full Node tests。

`runtime-tests` job 繼續獨立執行 Playwright：

- `npm run test:runtime`

`runtime-integrity`、`admin`、`matrix-api` job 不因本次需求被重新設計。即使其中也有 build 或測試，因服務目的不同，不納入這次「Targeted Explore vs Full tests」去重範圍。

## 8. 響應式與 UI 防護

整理測試時不得用舊測試重新引入以下問題：

- 固定 width／height 鎖死響應式
- 為通過舊 assertion 而恢復已淘汰的 `!important`
- 強迫固定畫布寬度
- 將 content-sized 元件重新改成固定 flex-basis
- 以像素值覆蓋已確認的 fluid/clamp/safe-area 行為

如果一個舊測試鎖定上述已淘汰行為，而新版 responsive regression 已覆蓋正確行為，該舊測試應列為 `DELETE_OBSOLETE`。

## 9. 實作安全規則

- 從執行當下最新 `main` 建立工作分支。
- 不 force push、不 reset shared history。
- 每次刪除舊檔前，必須先確認其所有有效 assertion 已存在於 canonical 檔或已被新版測試覆蓋。
- 不以「測試數量下降」作為成功條件。
- 不刪除核心 regression 來讓 Full Node 變綠。
- 若發現目前 main 的舊測試與新版 production 規格衝突，先以 Git/PR/spec 證據確認，再更新或淘汰測試。
- production source 預設 0 修改；任何必要 production 修正必須另外說明原因與範圍。

## 10. 盤點報告

實作分支新增：

`docs/testing/test-suite-audit-20260904.md`

至少包含：

- CI 重複執行項目
- `tests/` 全檔案 inventory
- KEEP / MERGE / DELETE_DUPLICATE / DELETE_OBSOLETE 清單
- canonical test file 對照
- 被刪 assertion 的替代保護位置
- 若有無法安全判定的項目，列為 KEEP，不做猜測式刪除

## 11. 最終驗證

完成整理後必須在同一個最終 commit/tree 上重新執行：

1. **Full Vitest**
   - `npm run test:unit`
2. **Production Build**
   - `npm run build`
3. **Full Node**
   - `node --test tests/*.test.mjs`
4. **Playwright**
   - 安裝 Chromium/system deps 後 `npm run test:runtime`
5. **Git whitespace / diff 檢查**
   - `git diff --check`
6. **CI workflow contract**
   - 確認 `Targeted Explore tests` 已不存在
   - 確認 Full Node 只在 `test-and-build` 內執行一次

如果任一測試失敗，不得直接 skip、刪除或改 expected value；必須先判斷是：

- 真實 regression
- 已過時規格
- 重複 assertion
- 測試環境／fixture 問題

再依分類處理。

## 12. 完成條件

本次工作只有在以下全部成立時才視為完成：

- CI 不再重複執行 Targeted Explore + Full Node
- `tests/` 每個檔案均有盤點結果
- 已被新版規格完整取代的舊測試移除
- 完全重複 assertion 移除
- 同功能零碎 Node tests 合併到合理 canonical 檔
- 核心功能、security、migration、runtime、有效 regression 全部保留
- 不因測試整理造成 production UI／responsive／功能改動
- Full Node 通過
- Vitest 通過
- Playwright 通過
- Build 通過
- 最終差異只包含本次測試架構整理直接相關內容
