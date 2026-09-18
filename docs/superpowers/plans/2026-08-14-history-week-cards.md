# History Week Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將歷史開獎頁改為依實際曆週分卡，並固定頁首與底部導覽，只讓資料區捲動。

**Architecture:** 先對每頁最多50筆資料做曆週分組，再由歷史頁逐組渲染卡片。歷史頁使用獨立捲動鎖定 class，不改動其他頁面的頁首與捲動行為。

**Tech Stack:** React、TypeScript、CSS、Node test、Vite

## Global Constraints

- 分頁上限維持每頁50筆。
- 停開日不補資料。
- 不修改其他頁面的 Logo、返回鍵、底部導覽與彩球。

---

### Task 1: 曆週分組

**Files:**
- Create: `src/history-week-groups.ts`
- Create: `tests/history-week-groups.test.mjs`

- [ ] 寫入星期一為起點的曆週分組測試。
- [ ] 執行測試並確認先失敗。
- [ ] 實作 `groupHistoryByCalendarWeek`。
- [ ] 執行測試並確認通過。

### Task 2: 歷史頁卡片結構

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-pages.css`
- Modify: `src/number-ball.css`

- [ ] 先新增結構與樣式回歸測試。
- [ ] 將分頁結果依曆週分卡並重複渲染標題列。
- [ ] 縮小標題列、資料列、期數、日期與六加一彩球。
- [ ] 對齊正碼、加號與特別號。

### Task 3: 固定頁首與中間捲動

**Files:**
- Modify: `src/project-overrides.js`
- Modify: `src/project-overrides.css`

- [ ] 為歷史頁加入獨立 `history-scroll-lock`。
- [ ] 將外層捲動鎖定，讓 `.draw-history-screen .feature-body` 成為唯一垂直捲動區。
- [ ] 執行全部相關測試與正式建置。

