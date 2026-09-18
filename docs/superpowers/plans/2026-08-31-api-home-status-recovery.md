# API、首頁與狀態恢復 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢復首頁日期／下次開獎時間，並重新產生四彩最新演算法與狀態資料。

**Architecture:** Railway 公開 API 從既有排程輸出 `nextDrawAt`；Worker 使用新分析版本產生 Supabase 產物；Explore RPC 僅讀取新版本。前端保留既有手機版面，只接收資料。

**Tech Stack:** React 19、TypeScript、Python 3.12、Railway、Supabase Postgres／Edge Functions、Vitest、pytest。

**Spec:** `docs/superpowers/specs/2026-08-31-api-home-status-recovery-design.md`

## Global Constraints

- 不改首頁版面、字級、間距或功能流程。
- 缺期時停止演算法並先補期。
- 不以舊資料冒充最新期。
- Explore、天衍與狀態必須使用同一期正式產物。

---

### Task 1: 首頁開獎時間資料

**Files:**
- Modify: `services/matrix-api/app/schedule.py`
- Modify: `services/matrix-api/app/api_server.py`
- Test: `services/matrix-api/tests/test_schedule.py`
- Test: `services/matrix-api/tests/test_home_draw_metadata.py`

**Interfaces:**
- Produces: `next_lottery_call_time(lottery: str, now: datetime | None = None) -> datetime`
- Produces: `GET /api/matrix/latest/{lottery}` 的 `item.nextDrawAt`

- [ ] **Step 1: Write the failing schedule and public API tests**
- [ ] **Step 2: Run the focused pytest tests and verify the missing symbol/field failures**
- [ ] **Step 3: Implement `next_lottery_call_time` and add `nextDrawAt` to a non-null latest item**
- [ ] **Step 4: Run the focused tests and complete Matrix API suite**
- [ ] **Step 5: Commit the isolated change**

### Task 2: 新演算法版本與 Supabase RPC

**Files:**
- Modify: `services/matrix-api/app/worker.py`
- Modify: worker version tests under `services/matrix-api/tests/`
- Create: `supabase/migrations/20260831*_matrix_python_v7_explore_rpc.sql`
- Test: `services/matrix-api/tests/test_matrix_explore_migration_contract.py`

**Interfaces:**
- Produces: `ANALYSIS_VERSION = "matrix-python-v7"`
- Produces: Explore list/validation RPC accepts only `{drawPeriod}:matrix-python-v7`

- [ ] **Step 1: Change tests to require v7 and add a migration contract test**
- [ ] **Step 2: Run focused tests and verify v6 failures**
- [ ] **Step 3: Set Worker version to v7 and add the v7 RPC migration**
- [ ] **Step 4: Run Worker, migration-contract and complete API tests**
- [ ] **Step 5: Commit the isolated change**

### Task 3: 正式部署與資料恢復

**Files:**
- No additional product files unless verification finds a confirmed defect.

**Interfaces:**
- Consumes: Railway Worker v7 and Supabase v7 Explore RPC.
- Produces: 四彩最新 draw、complete run、Explore／天衍／天工／status 產物。

- [ ] **Step 1: Run formatter/typecheck, Vitest, pytest, build and premium audit**
- [ ] **Step 2: Push the branch, review the diff and check CI**
- [ ] **Step 3: Merge to main, deploy Railway, and confirm deployment health**
- [ ] **Step 4: For each of 今彩539、天天樂、六合彩、大樂透, run an unscheduled `run_worker`／等效強制刷新；逐彩比對正式來源與預期開獎日，確認同一最新期的 v7 complete、Explore／天衍／天工／status 四類產物，以及 status sources 均同一期。scheduled cron 在排程窗外不能證明 freshness；任一彩為 `not-acquired`、not-ready 或 stale 時，禁止 cutover，保留 live v6 RPC。**
- [ ] **Step 5: 僅在 Step 4 四彩全數通過後套用全域 v7 RPC migration，檢查 live function definition，並對四彩逐一呼叫 Explore list／validation RPC。**
