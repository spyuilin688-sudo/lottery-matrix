# Responsive Feature Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 統一功能頁 12px 響應式外距與標題卡操作，壓縮通知、我的及號碼對照單密度，並正規化所有同類型同星期數。

**Architecture:** 以 `FeatureShell` 與共用 CSS token 作為頁面外距及 sticky 頁首唯一來源，三個標題卡操作使用同一個 action-button 類別。期數正規化集中在 `lottery-api.ts` 的純函式，所有 API 紀錄在進入頁面前完成標準化；頁面只渲染正規化結果。

**Tech Stack:** React 19、TypeScript、CSS、Vitest、Node test runner、Vite、Sites、GitHub

**Spec:** `docs/superpowers/specs/2026-08-22-responsive-feature-pages-design.md`

## Global Constraints

- 不新增、刪除或改變既有功能流程、通知項目、文案順序與資料來源。
- `--layout-page-inline: 12px` 是功能頁唯一左右外距來源。
- sticky 元素只在頁面捲動容器內生效，不以 fixed 遮住內容。
- 不使用 transform 縮放整頁、負 margin、固定畫布寬度或新增 `!important` 補償。
- 保留底部導覽安全區、彩球比例與輸入框既有行為。
- 320px 至 430px 不得出現水平溢出。

---

### Task 1: 通用期數正規化

**Files:**
- Modify: `src/lottery-api.ts`
- Modify: `src/__tests__/lottery-api.test.ts`

**Interfaces:**
- Produces: `normalizePeriod(lottery: NumberBallLottery, value: unknown): string | undefined`
- Rule: `^(\d{2,3})000(\d{3})$` 轉成 `${prefix.padStart(3, "0")}${suffix}`，正常值原樣保留。

- [ ] **Step 1: 寫入多筆失敗測試**

```ts
expect(normalizePeriod('今彩539', '96000024')).toBe('096024');
expect(normalizePeriod('今彩539', '105000123')).toBe('105123');
expect(normalizePeriod('大樂透', '97000456')).toBe('097456');
expect(normalizePeriod('今彩539', '096024')).toBe('096024');
expect(normalizePeriod('六合彩', '96000024')).toBe('96000024');
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit -- --run src/__tests__/lottery-api.test.ts`
Expected: 8 位舊格式案例失敗。

- [ ] **Step 3: 匯出並實作彩種感知正規化**

```ts
export function normalizePeriod(lottery: NumberBallLottery, value: unknown) {
  if (value === null || value === undefined) return undefined;
  const period = String(value).trim();
  if (lottery !== '今彩539' && lottery !== '大樂透') return period;
  const legacy = period.match(/^(\d{2,3})000(\d{3})$/);
  return legacy ? `${legacy[1].padStart(3, '0')}${legacy[2]}` : period;
}
```

- [ ] **Step 4: 重跑測試確認通過**

Run: `npm run test:unit -- --run src/__tests__/lottery-api.test.ts`
Expected: PASS。

### Task 2: 共用標題卡操作與歷史頁 sticky

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-pages.css`
- Create: `tests/responsive-feature-pages-request.test.mjs`

**Interfaces:**
- Produces: `.title-card-compact-actions`、`.title-card-compact-action`、`.sticky-feature-header`。
- Consumes: `FeatureShell.headerAction`。

- [ ] **Step 1: 建立文案、尺寸、位置與 sticky 失敗測試**

```js
assert.match(source, />篩選設定<\/button>/);
assert.match(css, /\.title-card-compact-action\s*\{[^}]*height:\s*23\.4px/s);
assert.match(css, /\.draw-history-screen \.feature-brand-header\s*\{[^}]*position:\s*sticky/s);
assert.match(css, /\.draw-history-history-scope\s*\{[^}]*margin-inline:\s*var\(--layout-page-inline\)/s);
```

- [ ] **Step 2: 執行 Node 測試確認失敗**

Run: `node --test tests/responsive-feature-pages-request.test.mjs`
Expected: FAIL。

- [ ] **Step 3: 更新歷史頁文案與共用類別**

將按鈕及 Dialog 標題改為「篩選設定」，按鈕加上 `title-card-compact-action`；歷史 `FeatureShell` 加上 sticky header 狀態類別。

- [ ] **Step 4: 建立單一 CSS 規則**

按鈕使用目前 26px 的 90%（23.4px）、9px 的 90%（8.1px），標題操作容器向下 4px；歷史列表只使用 12px token 外距。

- [ ] **Step 5: 重跑測試確認通過**

Run: `node --test tests/responsive-feature-pages-request.test.mjs`
Expected: PASS。

### Task 3: 號碼對照單標題操作與緊湊列表

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-pages.css`
- Modify: `tests/responsive-feature-pages-request.test.mjs`

**Interfaces:**
- Consumes: `.title-card-compact-actions`、`.title-card-compact-action`。
- Keeps: `resetReference()`、`toggleQueryPanel()`、列與單格標記行為。

- [ ] **Step 1: 增加按鈕順序、6px 間距、12px 外距及列高失敗測試**

```js
assert.match(source, /刷新<\/button>[\s\S]*探索設定/);
assert.match(css, /\.reference-title-actions\s*\{[^}]*gap:\s*6px/s);
assert.match(css, /\.number-reference-screen \.feature-body\s*\{[^}]*padding-inline:\s*var\(--layout-page-inline\)/s);
assert.match(css, /\.number-reference-screen \.reference-row:not\(\.head\)\s*\{[^}]*min-height:\s*32px/s);
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests/responsive-feature-pages-request.test.mjs`
Expected: 新增斷言 FAIL。

- [ ] **Step 3: 套用共用按鈕並壓縮表格**

設定按鈕置右、刷新置左、間距 6px；表頭 26px、資料列 32px，縮減期數欄及單元格 padding，保留文字可讀性與標記 hit target。

- [ ] **Step 4: 重跑測試**

Run: `node --test tests/responsive-feature-pages-request.test.mjs tests/number-reference-layout.test.mjs`
Expected: PASS。

### Task 4: Matrix 同星收合設定、移除近10期與 sticky

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-pages.css`
- Modify: `src/__tests__/MatrixTongXingPage.test.tsx`
- Modify: `tests/responsive-feature-pages-request.test.mjs`

**Interfaces:**
- Produces: `settingsExpanded: boolean` state。
- Removes only: TongXingPage 內的 `<HistoryList />` rendering。
- Consumes: `.title-card-compact-action`、正規化後 `getDrawIssue()` 值。

- [ ] **Step 1: 寫入互動失敗測試**

```tsx
expect(screen.getByRole('button', { name: '收合探索設定' })).toBeTruthy();
fireEvent.click(screen.getByRole('button', { name: '收合探索設定' }));
expect(screen.queryByRole('region', { name: '同星探索設定' })).toBeNull();
expect(screen.queryByText('近10期開獎號碼')).toBeNull();
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit -- --run src/__tests__/MatrixTongXingPage.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 實作設定 state 與 header action**

`settingsExpanded` 預設 `true`；標題卡按鈕切換 query panel，panel hidden 時保留 state；移除 `historyExpanded` 與 TongXingPage 的 `HistoryList`。

- [ ] **Step 4: 套用 sticky 與 12px 外距**

同星頁首使用既有 sticky class，內容使用共用頁面 token，不增加第二套 calc 或 margin 補償。

- [ ] **Step 5: 重跑同星與期數測試**

Run: `npm run test:unit -- --run src/__tests__/MatrixTongXingPage.test.tsx src/__tests__/lottery-api.test.ts`
Expected: PASS。

### Task 5: 快捷、通知、我的 Logo 與 Product Design 密度

**Files:**
- Modify: `src/BrandLogo.tsx`
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-pages.css`
- Modify: `tests/responsive-feature-pages-request.test.mjs`
- Modify: `tests/notification-layout.test.mjs`

**Interfaces:**
- Consumes: `PRIMARY_BRAND_LOGO = '/assets/lottery/functions/matrixya.png'`。
- Produces: 共用 `.bottom-nav-brand-screen .shared-brand-logo` 幾何規則。

- [ ] **Step 1: 寫入 Logo 與密度失敗測試**

```js
assert.match(brandSource, /matrixya\.png/);
assert.match(css, /\.bottom-nav-brand-screen \.shared-brand-logo\s*\{[^}]*width:\s*75%/s);
assert.match(css, /\.notification-row\s*\{[^}]*height:\s*64px/s);
assert.match(css, /\.profile-card\s*\{[^}]*padding:\s*8px 12px/s);
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests/responsive-feature-pages-request.test.mjs tests/notification-layout.test.mjs`
Expected: 密度斷言 FAIL。

- [ ] **Step 3: 統一 Logo 幾何**

底部導覽三頁沿用首頁 75% 寬度與置中規則；移除頁面專屬位移及尺寸覆寫。

- [ ] **Step 4: 壓縮通知頁**

資料列 64px、圖示 44px、標題 14px、設定按鈕 72×32px；視覺開關縮小但保留外層點擊區。Dialog 控制列維持至少 40px 可操作高度。

- [ ] **Step 5: 壓縮我的頁**

會員卡 padding 8×12px、頭像 54px、登出按鈕 30px；訂閱卡與選單列降低垂直留白，保留清楚層級與底部安全區。

- [ ] **Step 6: 重跑相關測試**

Run: `node --test tests/responsive-feature-pages-request.test.mjs tests/notification-layout.test.mjs tests/profile-layout.test.mjs`
Expected: PASS。

### Task 6: 全專案 12px 與衝突清理

**Files:**
- Modify: `src/styles.css`
- Modify: `src/feature-pages.css`
- Modify: `src/matrix-explore-spacing.css`
- Modify: `tests/responsive-feature-pages-request.test.mjs`

**Interfaces:**
- Produces: `--layout-page-inline: 12px` 唯一 token。
- Preserves: bottom navigation clearance、safe area、彩球與專用表格內距。

- [ ] **Step 1: 增加 token、禁止模式與窄寬度測試**

檢查功能頁不再宣告 4px／8px／16px 頁面外距，不新增負 margin、整頁 transform 或跨頁 `!important`。

- [ ] **Step 2: 執行測試確認目前衝突**

Run: `node --test tests/responsive-feature-pages-request.test.mjs tests/responsive-structure.test.mjs`
Expected: 至少一個重複外距來源 FAIL。

- [ ] **Step 3: 收斂外距與後置覆寫**

保留單一 token，刪除重複 `width: calc(100% - 24px)` + margin 組合；將必要內距限制在元件內部選擇器。

- [ ] **Step 4: 重跑響應式測試**

Run: `node --test tests/responsive-feature-pages-request.test.mjs tests/responsive-structure.test.mjs`
Expected: PASS。

### Task 7: 完整驗證、main 同步與 Sites 發布

**Files:**
- Verify all modified production and test files。

**Interfaces:**
- Produces: GitHub main commit、Sites production URL。

- [ ] **Step 1: 執行需求與相關回歸測試**

Run: `node --test tests/responsive-feature-pages-request.test.mjs tests/draw-history-table-layout.test.mjs tests/recent-history-layout.test.mjs tests/notification-layout.test.mjs tests/profile-layout.test.mjs`
Expected: 0 failures。

- [ ] **Step 2: 執行 runtime、單元測試與 production build**

Run: `npm run check:runtime && npm run test:unit && npm run build`
Expected: build 退出碼 0；若存在與本次無關的基準失敗，需以 main 基準重跑同一測試並如實記錄。

- [ ] **Step 3: 檢查 diff**

Run: `git diff --check && git status --short`
Expected: 無空白錯誤，只有本次核准檔案。

- [ ] **Step 4: 建立單一 implementation commit**

```bash
git add src tests docs
git commit -m "fix: refine responsive feature pages"
```

- [ ] **Step 5: 原子同步 GitHub main**

以最新 GitHub main 為 parent 建立 tree 與 commit，fast-forward 更新 main，然後重新讀取該 commit 驗證。

- [ ] **Step 6: 建立並驗證 Sites checkpoint**

執行 Sites checkpoint；若部署非終態，啟動唯一監控代理。終態後由主代理直接查詢相同部署並取得正式 URL。
