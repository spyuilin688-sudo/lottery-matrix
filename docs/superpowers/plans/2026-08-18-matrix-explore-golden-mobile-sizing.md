# Matrix 探索 Golden Mobile Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 Matrix 探索主頁正式版面尺寸收斂為使用者指定的 12px／8px／24px／32px 與 15px／13px／11px，並移除該頁既有衝突的發光、陰影、漸層、粗邊框與補償性覆寫。

**Architecture:** 保留 `MatrixExplorePage` 現有 React DOM、功能與資料流，只修改 `src/feature-pages.css` 中 Matrix Explore formal layout rule block 的正式控制來源，並同步更新來源測試。所有 selector 必須限縮在 `.matrix-explore-main-screen`／`.matrix-explore-screen`，不得影響天衍、天工或其他功能頁。

**Tech Stack:** React 19、TypeScript、Vite、CSS、Node test。

## Global Constraints

- `lottery-matrix/main` 為唯一正式程式碼來源。
- Matrix 探索主頁左右安全邊距固定 12px。
- Section 內部 padding 固定 8px。
- Section 上下 gap、表單上下列 gap、同列控制元件水平 gap 固定 8px。
- 一般按鈕、下拉、輸入框高度固定 24px。
- 核心大按鈕固定 32px。
- 板塊大標題固定 15px Bold。
- 按鈕文字、表格核心資料固定 13px。
- 次要說明、日期、欄位名稱固定 11px。
- 不新增發光、陰影、粗邊框或漸層。
- 不新增 `!important`、負 margin、translate／transform 硬拉、第二套覆寫或重複 media query。
- 不修改功能、文案、資料邏輯、操作流程、其他頁面、正式標題圖或底部導覽。

---

### Task 1: 先更新 Matrix 探索尺寸來源測試

**Files:**
- Modify: `tests/matrix-explore-option-layout.test.mjs`

**Interfaces:**
- Consumes: `src/feature-pages.css` formal rule block。
- Produces: 對 Matrix 探索主頁唯一尺寸來源的可執行約束。

- [ ] **Step 1: 將舊尺寸 assertions 改為新規格**

要求 `.matrix-explore-main-screen` 的 panel padding 為 `8px`；標題為 `15px`／`700`；setting grid 與所有同列控制 gap 為 `8px`；一般 control 高度為 `24px`；primary action 高度為 `32px`；按鈕核心字級為 `13px`；欄位名稱與次要文字為 `11px`。

- [ ] **Step 2: 新增禁止效果 assertions**

在 formal rule block 中禁止 Matrix 探索主頁 selector 使用非 `none` 的 `box-shadow`、`text-shadow`、`filter: drop-shadow(...)`、`linear-gradient(...)`、`radial-gradient(...)`，並禁止新增 `!important`、負 margin 與 `translate(...)`。

- [ ] **Step 3: 執行目標測試並確認先失敗**

Run: `node --test tests/matrix-explore-option-layout.test.mjs`

Expected: FAIL，因目前主頁仍存在 10px panel padding、32/34/38/40/42px 控制高度、12/13.5/15.2/16/17/18px 等舊字級，以及 selected／primary action 的發光或陰影來源。

### Task 2: 收斂 Matrix 探索正式 CSS 控制來源

**Files:**
- Modify: `src/feature-pages.css`

**Interfaces:**
- Consumes: 現有 `.matrix-explore-main-screen` DOM class 與 `/* Matrix Explore formal layout rules */` 區塊。
- Produces: 單一符合新 px 規格的 Matrix 探索主頁樣式來源。

- [ ] **Step 1: 外層與 Section**

保留頁面左右 `var(--layout-page-inline)` 正式來源，確認該 token 為既定 12px；將 Matrix 探索主頁 `.explore-settings`、`.hit-advanced-panel`、`.history-panel`、`.repeat-stats-panel`、`.result-panel` padding 統一為 `8px`，Section 之間維持 `8px`。

- [ ] **Step 2: 表單 Grid/Flex gap**

將 `.matrix-explore-main-screen .explore-settings .setting-grid`、`.advanced-panel`、`.segmented.two`、`.segmented.three`、`.hit-options` 與同列 label/control 的 gap 統一為 `8px`；移除主頁專用 5px gap。

- [ ] **Step 3: 一般控制高度**

將 Matrix 探索主頁 select、segmented button、hit option、advanced row 中屬一般選項控制的可操作高度統一為 `24px`；保留必要 icon 自身尺寸，但不得用 icon 迫使 control 超過 24px。

- [ ] **Step 4: 核心大按鈕**

將 `.matrix-explore-main-screen .primary-action` 高度固定 `32px`，移除現有 40px 與發光 box-shadow；背景改為既有純色底，不使用 gradient。

- [ ] **Step 5: 字級**

將 Matrix 探索主頁 section title 固定 `15px`／`700`；一般 button／table core data 固定 `13px`；setting label、日期、統計次要文字、disclaimer 等次要資料固定 `11px`。不改文案內容。

- [ ] **Step 6: 移除此次禁止的視覺效果**

只在 Matrix 探索主頁正式 selector 中移除 selected control／primary action／title indicator 等現有 `box-shadow`、發光與 gradient；border 維持 1px 或既有細邊框，不建立粗邊框。

- [ ] **Step 7: 清除衝突與重複規則**

移除 formal block 中已被新規格取代的 32/34/36/38/40/42px 主頁控制高度、5px gap、15.2/12.5/13.5/17/18px 等主頁補償尺寸，以及同效果的重複 selector；必要 layout 規則保留。

- [ ] **Step 8: 執行目標測試**

Run: `node --test tests/matrix-explore-option-layout.test.mjs`

Expected: PASS。

### Task 3: 回歸測試與正式 main 驗證

**Files:**
- Verify only.

**Interfaces:**
- Consumes: 修改後 `src/feature-pages.css` 與測試。
- Produces: 可部署的 `main`。

- [ ] **Step 1: 執行 Matrix 探索與近期開獎相關測試**

Run: `node --test tests/matrix-explore-option-layout.test.mjs tests/recent-history-layout.test.mjs`

Expected: PASS。

- [ ] **Step 2: 執行完整測試**

Run: `node --test tests/*.test.mjs`

Expected: PASS。

- [ ] **Step 3: 執行 production build**

Run: `npm run build`

Expected: exit code 0。

- [ ] **Step 4: 比對變更範圍**

確認正式程式修改只有 `src/feature-pages.css`、`tests/matrix-explore-option-layout.test.mjs` 與本次 spec／plan，沒有修改 Matrix 天衍、Matrix 天工、其他頁面、功能或資料邏輯。

- [ ] **Step 5: 正式部署與手機檢查**

部署目前 `main`，在正式網址實際確認 Matrix 探索：左右 12px、Section padding 8px、所有指定 gap 8px、一般控制 24px、核心大按鈕 32px、15/13/11px 字級，以及無發光、陰影、粗邊框、漸層、碰撞、裁切或水平溢出。
