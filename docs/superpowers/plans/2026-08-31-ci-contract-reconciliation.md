# CI 契約收斂 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清除 `test-and-build` 的 63 項失敗，同時保留 Matrix Python v7 與目前正式手機 UI。

**Architecture:** Railway Python Worker／API 與 Supabase v7 RPC 是現行 Matrix 後端；React PWA 的 runtime stylesheet 與 `src/design-tokens.css` 是 UI 真實來源。舊 Node source-contract 測試需改為驗證這些 owner，不得恢復已刪除的 AppDeploy 模組。

**Tech Stack:** React 19、TypeScript、Node test runner、Vitest、Python 3.12、pytest、Supabase Postgres、CSS design tokens。

**Spec:** `docs/superpowers/specs/2026-08-31-ci-contract-reconciliation-design.md`

## Global Constraints

- 不復原 Matrix v5／v6 或已刪除的 AppDeploy runtime。
- 不回退目前首頁、Matrix、通知或共用 safe-area 間距。
- 產品碼只修正有現行契約與測試證據的缺口。
- 每批變更先跑聚焦測試，再跑完整驗證。

### Task 1: 收斂 Matrix API 與版本契約

**Files:**
- Delete: `tests/matrix-analysis-progress-reader.test.mjs`
- Delete: `tests/matrix-analysis-worker-runtime-budget.test.mjs`
- Delete: `tests/matrix-explore-independent-readiness.test.mjs`
- Delete: `tests/matrix-explore-partitions.test.mjs`
- Delete: `tests/tongxing-result-order.test.mjs`
- Modify: `tests/requested-history-and-explore-data.test.mjs`
- Modify: `tests/supabase-rpc-security.test.mjs`

- [x] **Step 1: 保留現有 9 項失敗作為 stale-contract RED 證據**
- [x] **Step 2: 移除無產品 owner 的測試，更新 current-only v7／Supabase migration 斷言**
- [x] **Step 3: 跑聚焦 Node 測試並提交**
- [x] **Step 4: 執行 task-spec review**

### Task 2: 收斂首頁、導覽與 guide 契約

**Files:**
- Modify: `DESIGN.md`
- Modify: homepage/navigation/guide source-contract tests under `tests/`

- [x] **Step 1: 以 runtime token、較新 regression tests 與 Vitest 建立正式數值表**
- [x] **Step 2: 更新或刪除互相矛盾的舊斷言，不改 production UI**
- [x] **Step 3: 跑首頁／導覽／guide 聚焦 Node 測試並提交**
- [x] **Step 4: 執行 task-spec review**

### Task 3: 收斂 Matrix 與其他工具頁 UI 契約

**Files:**
- Modify: Matrix Explore/Status/Tiangong/calculator/history/reference/notification source-contract tests under `tests/`
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-page-adjustments.css`
- Modify: `src/responsive-feature-pages.css`
- Add or modify: number-reference interaction test under `src/__tests__/`

- [x] **Step 1: 先加入單格選取清除同列標記的失敗互動測試**
- [x] **Step 2: 實作對稱互斥選取，並將通知 push status 規則搬回唯一 owner**
- [x] **Step 3: 更新其餘 stale UI source-contract 斷言**
- [x] **Step 4: 跑聚焦 Node／Vitest 測試並提交**
- [x] **Step 5: 執行 task-spec review**

### Task 4: 完整驗證與整體審查

**Files:**
- No product changes unless verification finds a confirmed defect.

- [x] **Step 1: 跑完整 Node、Vitest、pytest、runtime integrity、build 與 DESIGN lint**
- [x] **Step 2: 執行 Frontend Design Premium 嚴格稽核與衝突／owner 檢查**
- [x] **Step 3: 執行 whole-branch code review**
- [x] **Step 4: 修正審查意見並重跑完整驗證**
