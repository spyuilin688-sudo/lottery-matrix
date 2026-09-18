# Matrix 探索版路展開排版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 Matrix 探索的版路類型展開內容改為已確認參考圖的三列左右欄排版。

**Architecture:** 只修改既有 `RoadValidationProcess` 與對應 `.road-validation-*` 樣式。每個驗證組改為左側三列期數/號碼、右側單一計算區；沿用既有資料與展開流程，不新增功能。

**Tech Stack:** React、TypeScript、CSS、Vite

## Global Constraints
- `lottery-matrix/main` 是唯一正式來源。
- 只修改版路類型展開後內容。
- 每組固定 3 列。
- 不追加第二套 CSS 覆寫；直接修改既有正式規則。
- 其他探索結果與頁面保持不變。

---

### Task 1: RoadValidationProcess 展開結構

**Files:**
- Modify: `src/FeaturePages.tsx`

**Interfaces:**
- Consumes: `ROAD_VALIDATION_SAMPLE_HISTORY`, `number`, `position`, `predictionPeriod`, `consecutive`, `prediction`
- Produces: `.validation-period-block`, `.validation-period-main`, `.validation-period-rows`, `.validation-group-formula`, `.validation-current-prediction`

- [ ] **Step 1:** 驗證現況仍為每列三欄公式結構，確認修改前狀態。
- [ ] **Step 2:** 將每組結構改為左側三列期數/完整號碼、右側單一計算區。
- [ ] **Step 3:** 保持每組 `group` 固定三筆，不修改探索結果展開流程。
- [ ] **Step 4:** 在全部驗證組下方加入既有 `prediction` 的「本期預測」呈現。

### Task 2: 正式 CSS 排版來源

**Files:**
- Modify: `src/feature-pages.css`

**Interfaces:**
- Consumes: Task 1 class names
- Produces: 手機直式左右欄三列排版

- [ ] **Step 1:** 直接修改現有 `.validation-period-*` 規則，不新增重複 selector 覆寫。
- [ ] **Step 2:** 左側三列使用期數 + 五個完整號碼；右側單一計算區垂直置中。
- [ ] **Step 3:** 每組保留分隔線，最後顯示本期預測。
- [ ] **Step 4:** 確認 390px/手機直式無碰撞、無橫向溢出。

### Task 3: 驗證與同步

**Files:**
- Test existing project tests/build

- [ ] **Step 1:** 執行既有測試。
- [ ] **Step 2:** 執行 TypeScript 檢查與 Vite build，確認沒有新增錯誤。
- [ ] **Step 3:** 確認 diff 只包含指定展開內容、正式 CSS 與本次規格/計畫文件。
- [ ] **Step 4:** Commit 並同步 `main`，等待既有正式部署完成後檢查預覽。
