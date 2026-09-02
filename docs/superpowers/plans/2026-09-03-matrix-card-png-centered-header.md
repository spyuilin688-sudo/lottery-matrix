# Matrix Card PNG Download and Centered Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓四彩 Matrix 牌單下載為真正的 PNG 圖檔，並讓牌單頂部「彩種＋順球／落球」文字在既有標題框內水平與垂直置中。

**Architecture:** 保留目前 SVG 作為牌單預覽與來源格式，不變更牌單資料來源或 Supabase 結構。前端新增專用 SVG→PNG rasterize/download helper，MatrixCardPage 只把既有下載 handler 接到該 helper；後端 SVG renderer 僅調整標題文字的既有框內定位語意，不更動畫布、欄位、日期、號碼與其他排版。

**Tech Stack:** React 19、TypeScript、Vitest、Node test、Python 3.12、pytest、SVG、Canvas API

**Spec:** Current user request (2026-09-03), `DESIGN.md`, `UX-CONTRACT.md`

## Global Constraints

- 只修改「牌單下載 PNG」與「四彩牌單頂部彩種＋順球／落球置中」。
- 保留現有「下載牌單 → 確認下載牌單？」流程、pending、失敗文案與重試行為。
- 不修改牌單資料來源、演算法、Supabase schema、會員權限、彩種切換或牌單內容。
- 不覆寫 PR #255 的 Matrix 牌單靜態化工作；本修改需同時相容相對與絕對 card URL。
- 不擴大修改與本次需求無直接關聯的 UI、樣式或流程。

---

### Task 1: Frontend PNG export contract

**Files:**
- Create: `tests/matrix-card-png-download.test.mjs`
- Modify: `src/matrix-ticket-download.ts`
- Modify: `src/FeaturePages.tsx` (`MatrixCardPage` import and download handler only)

**Interfaces:**
- Consumes: Matrix card SVG URL returned by `matrixCardUrl(...)`.
- Produces: `downloadMatrixCardPng(cardUrl: string, filename: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Add a Node source contract asserting that MatrixCardPage uses `downloadMatrixCardPng`, outputs a `.png` filename, and no longer downloads the card as `.svg`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/matrix-card-png-download.test.mjs`
Expected: FAIL because current MatrixCardPage still downloads `…牌單.svg` directly.

- [ ] **Step 3: Write minimal implementation**

Add `downloadMatrixCardPng(cardUrl, filename)` to `src/matrix-ticket-download.ts`:
1. fetch the SVG source;
2. require an OK response and SVG text;
3. read positive SVG width/height from the root element/viewBox;
4. load the SVG through the existing safe Blob URL image path;
5. draw at the SVG’s intrinsic dimensions to a canvas;
6. encode with existing `canvasToPng`;
7. validate MIME/signature with existing `validatePng`;
8. download the PNG Blob with the supplied `.png` filename and always revoke the Blob URL.

Update only `MatrixCardPage.handleTicketDownload()` to call:

```ts
await downloadMatrixCardPng(
  cardUrl,
  `${lottery}-${order === "draw" ? "落球" : "順球"}牌單.png`,
);
```

Keep confirmation, pending guard, retry and failure UI unchanged.

- [ ] **Step 4: Run tests and type/build verification**

Run:
- `node --test tests/matrix-card-png-download.test.mjs`
- `npm run test:unit -- src/__tests__/matrix-ticket-download.test.ts src/__tests__/FeatureActions.test.tsx`
- `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit the frontend PNG test and implementation together after green verification.

---

### Task 2: Four-lottery title-box centering

**Files:**
- Create: `services/matrix-api/tests/test_matrix_card_header_alignment.py`
- Modify: `services/matrix-api/app/card_renderer.py`

**Interfaces:**
- Consumes: existing panel geometry (`panel["numbers"]`, `panel["right"]`, `HEADER_TOP`, `HEADER_BOTTOM`).
- Produces: unchanged SVG dimensions and content with title text centered on the exact box center using `text-anchor="middle"` and `dominant-baseline="central"`.

- [ ] **Step 1: Write the failing test**

For all four lotteries and both `sorted`/`draw`, assert every top title text uses:
- `x = (panel["numbers"] + panel["right"]) / 2`
- `y = (HEADER_TOP + HEADER_BOTTOM) / 2`
- `text-anchor="middle"`
- `dominant-baseline="central"`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/matrix-api && uv run pytest -q tests/test_matrix_card_header_alignment.py`
Expected: FAIL because current title baseline is `middle`.

- [ ] **Step 3: Write minimal implementation**

Use the existing exact horizontal/vertical center coordinates and change only the title text baseline from `middle` to `central`; do not alter header frame dimensions, font size, accent colors, grid edges or table geometry.

- [ ] **Step 4: Run API regression tests**

Run:
- `cd services/matrix-api && uv run pytest -q tests/test_matrix_card_header_alignment.py tests/test_matrix_card_api.py`
- `cd services/matrix-api && uv run pytest -q`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit the header centering test and renderer change together after green verification.

---

### Task 3: Conflict and release verification

**Files:**
- No production scope expansion.

**Interfaces:**
- Consumes: completed Task 1 and Task 2 commits.
- Produces: reviewable branch/PR with only scoped changes.

- [ ] **Step 1: Re-read latest `main` and compare**

Confirm `main` has not introduced a conflicting MatrixCardPage/card renderer change since branch creation. Compare against open PR #255 so this branch does not overwrite its `cardPath` null-safe change.

- [ ] **Step 2: Run final verification**

Run the project build/tests represented by `.github/workflows/ci.yml` and verify changed-file scope.

- [ ] **Step 3: Open a PR to `main`**

Create a reviewable PR; do not force push, reset or directly overwrite `main`.
