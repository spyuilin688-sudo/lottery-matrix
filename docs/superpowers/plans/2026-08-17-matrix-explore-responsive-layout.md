# Matrix 探索 Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 整理 Matrix 探索主頁手機版 Responsive／Layout，使設定區、進階設定與近10期 5 球／6+1 在窄手機寬度完整顯示且不水平溢出。

**Architecture:** 保留 `MatrixExplorePage` 現有 DOM、功能與資料流，只修改既有正式 CSS 控制來源。將固定 110px + 222px 設定欄改為流動網格，清除近期開獎中互相衝突的固定尺寸規則，並以現有 `data-lottery` 與 `.matrix-explore-main-screen` 範圍限制修改。

**Tech Stack:** React 19、TypeScript、Vite、CSS、Node test。

## Global Constraints

- `lottery-matrix/main` 為唯一正式程式碼來源。
- 頁面主要左右內距維持 12px。
- 只修改 Matrix 探索主頁本次 Responsive／Layout 範圍。
- 不新增功能、文字、條件、狀態或操作流程。
- 不使用新的 `!important`、負值位移或第二套 CSS 覆寫掩蓋問題。
- 舊規則衝突時修改或移除舊規則本身。

---

### Task 1: 建立會失敗的 Responsive 來源測試

**Files:**
- Modify: `tests/matrix-explore-option-layout.test.mjs`
- Modify: `tests/recent-history-layout.test.mjs`

**Interfaces:**
- Consumes: `src/feature-pages.css`、`src/number-ball.css`
- Produces: 固定寬度不得存在、窄寬可縮放、6+1 不再被 26px 鎖定的來源測試。

- [ ] **Step 1:** 將 Matrix 探索設定測試改為要求 `grid-template-columns: minmax(102px, 110px) minmax(0, 1fr)`、控制元件 `width: 100%`、三等分按鈕 `white-space: normal`。
- [ ] **Step 2:** 增加近期開獎測試，要求 Matrix 探索主頁標題可換行、表格欄寬為 `56px 58px minmax(0, 1fr)`，並禁止六合彩近期開獎再次設定 `--number-ball-size: 26px`。
- [ ] **Step 3:** 執行 `node --test tests/matrix-explore-option-layout.test.mjs tests/recent-history-layout.test.mjs`，確認修改來源前測試失敗。

### Task 2: 整理 Matrix 探索設定與近期開獎正式 CSS

**Files:**
- Modify: `src/feature-pages.css`
- Modify: `src/number-ball.css`

**Interfaces:**
- Consumes: 現有 `.matrix-explore-screen`、`.matrix-explore-main-screen`、`.history-panel` DOM class。
- Produces: 單一可縮放版面控制來源。

- [ ] **Step 1:** 移除正式 Matrix Explore 區塊內重複的固定 110px 標籤 selector。
- [ ] **Step 2:** 將設定列改為 `minmax(102px, 110px) minmax(0, 1fr)`，標籤內部改為 `32px minmax(0, 1fr)`。
- [ ] **Step 3:** 將設定 select／segmented 的 222px 固定寬度改為 `width: 100%; max-width: none; min-width: 0;`。
- [ ] **Step 4:** 三等分選項取消強制不換行，維持原按鈕高度、字級、顏色與選取狀態。
- [ ] **Step 5:** 近10期標題只移除造成裁切的 `white-space: nowrap`，保留「查看更多紀錄」不換行。
- [ ] **Step 6:** 近10期表格欄寬改為 `56px 58px minmax(0, 1fr)`，刪除六合彩重複的相同 grid selector。
- [ ] **Step 7:** 在 `src/number-ball.css` 保留六合彩 asset scale／底線規則，但移除近期開獎專用 `--number-ball-size: 26px`，讓共用 6+1 23.5px 規則生效。
- [ ] **Step 8:** 執行兩個目標測試，確認通過。

### Task 3: 完整回歸與部署

**Files:**
- Verify only.

**Interfaces:**
- Consumes: 完成後的正式來源。
- Produces: 可部署的 `main`。

- [ ] **Step 1:** 執行完整 `node --test tests/*.test.mjs`。
- [ ] **Step 2:** 執行 `npm run build`。
- [ ] **Step 3:** 確認 GitHub `main` 只包含本次指定 CSS／測試與相關規格文件變更。
- [ ] **Step 4:** 更新正式 AppDeploy。
- [ ] **Step 5:** 實際檢查正式網址手機畫面，確認設定區、進階設定、539 與 6+1 近期開獎沒有右側溢出，且下半部既有結構未受影響。
