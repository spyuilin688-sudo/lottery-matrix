# Number Reference Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新號碼對照單頁首、查詢收合流程、輸入限制、列表順序及數字顯示。

**Architecture:** 保留既有 `NumberReferencePage` 資料與標記邏輯，只在該頁加入局部狀態、輸入正規化及捲動定位。頁面專屬樣式集中在 `feature-pages.css`，不新增全域覆寫。

**Tech Stack:** React、TypeScript、CSS、Node test runner、Vite

## Global Constraints

- 只修改號碼對照單頁面。
- 以 390px 直式手機畫面為基準。
- 使用 `/assets/lottery/functions/matrixHH.png`。
- Logo 與標題卡間距 8px；標題卡左右邊距 4px。
- 刷新與收合鍵間距 6px。
- 最新期數位於列表最下方。
- 號碼輸入有效範圍為 01～49。
- 不修改既有探索、刷新與列表標記邏輯。

---

### Task 1: 行為測試

**Files:**
- Create: `tests/number-reference-page.test.mjs`
- Modify: none

**Interfaces:**
- Consumes: `src/FeaturePages.tsx` 與 `src/feature-pages.css`
- Produces: 號碼對照單結構與樣式的回歸測試

- [ ] **Step 1: 寫入失敗測試**

測試必須檢查：
- `matrixHH.png`
- 查詢區收合狀態
- 開始探索後 `scrollIntoView`
- 01～49 正規化
- 等寬數字 CSS
- 4px、8px、6px 版面值
- 列表標題列縮減高度

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests/number-reference-page.test.mjs`
Expected: FAIL，因新結構與樣式尚未存在。

- [ ] **Step 3: Commit**

```bash
git add tests/number-reference-page.test.mjs
git commit -m "test: cover number reference page redesign"
```

### Task 2: 查詢行為與輸入限制

**Files:**
- Modify: `src/FeaturePages.tsx`
- Test: `tests/number-reference-page.test.mjs`

**Interfaces:**
- Consumes: 現有 `NumberReferencePage` state 與資料列表
- Produces: `queryExpanded: boolean`、`normalizeReferenceNumber(value: string): string`、列表結尾 ref

- [ ] **Step 1: 加入輸入正規化**

建立只保留兩位數、限制 01～49，並在輸入完成時將 1～9 補零的頁面局部處理。

- [ ] **Step 2: 加入查詢收合**

將三個選項、三個輸入框及開始探索按鈕包在同一個可收合區域；標題卡收合鍵切換狀態。

- [ ] **Step 3: 加入探索後定位**

開始探索時保留既有探索行為，同時收合查詢區，並在畫面更新後對列表結尾呼叫：
```ts
resultsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
```

- [ ] **Step 4: 保留最新期數於最下方**

不得對既有列表資料加入反轉；確認渲染順序讓最新期數位於最後一列。

- [ ] **Step 5: 執行測試**

Run: `node --test tests/number-reference-page.test.mjs`
Expected: 行為結構測試通過。

- [ ] **Step 6: Commit**

```bash
git add src/FeaturePages.tsx tests/number-reference-page.test.mjs
git commit -m "feat: add collapsible number reference query"
```

### Task 3: 固定頁首與列表樣式

**Files:**
- Modify: `src/feature-pages.css`
- Test: `tests/number-reference-page.test.mjs`

**Interfaces:**
- Consumes: Task 2 新增的頁面 class 與 data attributes
- Produces: 390px 手機頁首、選項完整文字、等寬列表數字

- [ ] **Step 1: 設定固定頁首**

只對 `.number-reference-screen` 設定固定頁首結構，確保 Logo、返回鍵、標題卡不遮擋內容。標題卡左右 4px，與 Logo 間距 8px。

- [ ] **Step 2: 設定標題卡操作鍵**

刷新與收合鍵置於標題卡右側，使用 `gap: 6px`。

- [ ] **Step 3: 修正下拉選項**

調整三欄寬度及 select 右側空間，使「今彩539」與「1000期」連同下拉符號完整顯示。

- [ ] **Step 4: 調整列表**

縮減 `.reference-row.head` 上下高度；放大資料列號碼；對期號與號碼加入：
```css
font-variant-numeric: tabular-nums;
font-feature-settings: "tnum" 1;
```

- [ ] **Step 5: 執行測試**

Run: `node --test tests/number-reference-page.test.mjs`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/feature-pages.css tests/number-reference-page.test.mjs
git commit -m "style: refine number reference mobile layout"
```

### Task 4: 完整驗證與發布

**Files:**
- Verify: `src/FeaturePages.tsx`
- Verify: `src/feature-pages.css`
- Verify: `tests/number-reference-page.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3 完成內容
- Produces: GitHub main 與 Sites 線上預覽

- [ ] **Step 1: 執行專項測試**

Run: `node --test tests/number-reference-page.test.mjs`
Expected: PASS。

- [ ] **Step 2: 執行既有測試**

Run: `npm test`
Expected: 無本次修改造成的新失敗。

- [ ] **Step 3: 建置**

Run: `npm run build`
Expected: exit code 0。

- [ ] **Step 4: 同步 GitHub main**

只提交本次規格、測試、TSX 與 CSS 變更，不包含其他未相關修改。

- [ ] **Step 5: 更新 Sites 預覽**

部署目前 GitHub main 對應版本。

- [ ] **Step 6: 驗證 390px 畫面與互動**

確認固定頁首、標題卡、收合、探索後捲動、輸入補零、下拉完整顯示、列表最下方最新期數及等寬數字。
