# Matrix 狀態通知最高狀態與整期去重 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有通知分支中讓每彩種每開獎期別只產生一筆最高 Matrix 狀態通知，重新分析或狀態升級不重複發送。

**Architecture:** PR 1 合併後將最新 `main` 非破壞性合入 `work/notification-dispatch-20260904-v2`；producer 從完整 status artifact summary 讀最高狀態，以不含 status 的 event key 送入既有 ingest。資料庫唯一鍵與 ingest validation 同步採 `matrix_status:<lotteryCode>:<period>`，維持現有 outbox/retry idempotency。

**Tech Stack:** Python、pytest、TypeScript、Supabase/Postgres、Railway analysis worker。

**Spec:** `docs/superpowers/specs/2026-09-04-admin-todos-matrix-status-design.md`

## Global Constraints

- 只處理 Matrix 狀態通知的最高狀態與去重，不更動其他通知類型。
- 天天樂維持 GitHub Actions crawler-only → Supabase → Railway analysis-only。
- 同彩種、同開獎期別整期只通知一次；status 留在 payload，不放入 event key。
- 首次事件必須在完整 status artifact 成立後建立；DORMANT 不建立通知。

---

### Task 1: 整合 PR 1 後 main 並確認通知基準

- [ ] **Step 1: 比對分支與最新 main**

Run: `git fetch origin && git rev-list --left-right --count origin/main...work/notification-dispatch-20260904-v2`

- [ ] **Step 2: 以 merge commit 非破壞性整合 main**

Run: `git checkout work/notification-dispatch-20260904-v2 && git merge --no-ff origin/main`

- [ ] **Step 3: 僅解決通知分支與 PR 1 直接重疊檔案，保留天天樂 split**

驗證 Railway fantasy5 config 仍為 analysis-only，GitHub Actions 仍為 crawler-only。

### Task 2: 先以失敗測試固定最高狀態與 event key

**Files:**
- Modify: `services/matrix-api/tests/test_notification_events.py`
- Modify: `services/matrix-api/app/services/notification_events.py`

- [ ] **Step 1: 新增失敗測試**

```py
event = matrix_status_event(artifact_with_summary('CRITICAL', also_counts={'RESONANCE': 2}))
assert event['event_key'] == 'matrix_status:lotto539:115000210'
assert event['payload']['status'] == 'CRITICAL'
assert matrix_status_event(artifact_with_summary('DORMANT')) is None
```

另以相同 lottery/period、不同 status 建立兩次，斷言兩者 event key 相同。

- [ ] **Step 2: 執行測試並確認舊 key 含 status 而失敗**

Run: `cd services/matrix-api && pytest tests/test_notification_events.py -q`

- [ ] **Step 3: 最小修改 producer key**

```py
event_key = f'matrix_status:{lottery_code}:{period}'
```

狀態仍從 `artifact['summary']['status']` 取得，不能逐一遍歷 cards 送多筆。

- [ ] **Step 4: 執行 producer 與 worker 回歸**

Run: `cd services/matrix-api && pytest tests/test_notification_events.py tests/test_worker.py tests/test_analysis_pipeline.py -q`

### Task 3: 同步 ingest 與資料庫唯一契約

**Files:**
- Modify: notification ingest validation tests and implementation on the branch
- Create or modify: one Supabase migration for Matrix event-key constraint if current schema encodes status

- [ ] **Step 1: 新增 ingest 失敗測試**

接受 `matrix_status:<lotteryCode>:<period>`，拒絕缺 lottery/period、額外 status segment 與偽造 event key；payload status 必須是 ACTIVE/FOCUS/RESONANCE/CRITICAL。

- [ ] **Step 2: 執行測試並確認舊 validator 失敗**

Run the branch-owned notification ingest test command discovered from its package/config.

- [ ] **Step 3: 更新 validator 與 DB uniqueness**

保留既有 generic event primary/unique key；若已有 `event_key` unique，僅更新格式檢查，不新增平行 dedupe table。重試使用 upsert/do-nothing，不建立新事件。

- [ ] **Step 4: 驗證同一期狀態升級仍只有一筆**

在 transaction 中依序 ingest RESONANCE、CRITICAL 相同 event key，斷言 events/outbox/delivery fan-out 都不增加第二筆。

### Task 4: 完整驗證與 PR 2

- [ ] **Step 1: 執行通知分支完整測試、typecheck 與 build**

使用分支 package scripts 與 Python pytest，包含 producer、ingest、outbox、subscription filtering、Railway worker。

- [ ] **Step 2: 執行 Supabase advisors 與安全檢查**

只修本次 migration 引入 finding。

- [ ] **Step 3: 建立 PR 2**

Base: `main`  
Head: `work/notification-dispatch-20260904-v2`

PR body 明列 key 由 `matrix_status:<lottery>:<period>:<status>` 改為 `matrix_status:<lottery>:<period>`，同時狀態只取 summary highest，並附同一期升級不重複的測試證據。

- [ ] **Step 4: CI 全綠後合併並觀察一次完整排程**

確認四彩種各期至多一個 Matrix status event，其他通知類型與天天樂 crawler/analysis split 無回歸。
