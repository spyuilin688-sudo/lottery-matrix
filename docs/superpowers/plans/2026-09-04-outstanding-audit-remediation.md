# Outstanding Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正已確認的 #4、#5、#6、#8、#9、#11，不改動未定義的 #7 多裝置衝突策略，也不猜測 #10 AppDeploy 套件來源。

**Architecture:** 前端錯誤狀態以正式路由層與既有設計契約為準，將 loading / success / empty / error 分離；通知設定載入失敗時不可編輯未知遠端狀態。Matrix analysis 以資料庫原子 lease 取得執行權，repository 與 pipeline 只允許 lease owner 更新/完成/失敗。所有修改在隔離分支完成，不直接修改 main。

**Tech Stack:** React 19, TypeScript 7, Vitest, Python/FastAPI worker, PostgreSQL/Supabase, GitHub Actions.

**Spec:** `UX-CONTRACT.md`, `DESIGN.md`, current verified source behavior on `main@c45c038cdd932c273365cfc749cc93b480992d54`.

## Global Constraints

- 保留既有深藍／金色 UI、手機 PWA 響應式與 Bottom Navigation 行為。
- 不以 API rejection 偽裝正常空資料。
- 不以本地預設值覆寫未知的遠端通知設定。
- 不 force push、reset、revert；不直接合併 main。
- PR #255 同時修改 `analysis_repository.py` 與 `FeaturePages.tsx`；本分支不得帶入或覆寫其 Matrix 牌單變更。
- #7 與 #10 保持未修改，直到產品規格／套件來源有正式依據。

---

### Task 1: Notification settings load failure contract

**Files:**
- Test: `src/__tests__/NotificationsPagePatched.test.tsx`
- Modify: `src/NotificationsPagePatched.tsx`

- [ ] Step 1: 新增 RED 測試：GET 失敗後顯示明確失敗訊息、一般通知 toggle/settings/bulk controls disabled、`重新載入` 可用。
- [ ] Step 2: 驗證測試因現有 failed state 不進 React state 且 controls 仍可操作而失敗。
- [ ] Step 3: 將 load state 改為 React state；failed 時不接受 edit、不排程 save；加入 reload action，成功後恢復控制。
- [ ] Step 4: 驗證 error → retry success → edit → save 流程。

### Task 2: Data pages must distinguish empty from request failure

**Files:**
- Test: existing page tests plus focused new tests under `src/__tests__/`
- Modify/create: smallest production route/component files required for history, Matrix 同星, 號碼對照單, 付款紀錄.

- [ ] Step 1: 新增 RED 測試：四個頁面 API reject 時顯示 error + retry，不顯示正常 empty copy。
- [ ] Step 2: 驗證現況 rejection 被轉成 `[]`。
- [ ] Step 3: 使用 explicit `{status,data,error}` 狀態；成功空陣列才顯示 empty。
- [ ] Step 4: retry 重新送出同一請求並在成功後清除 error。

### Task 3: Invite friends referral source consistency

**Files:**
- Test: focused referral/invite route tests.
- Modify/create: invite-friends routed component and router layer.

- [ ] Step 1: RED：invite-friends 顯示 `member_referral_summary` 的推薦碼與成功人數，並支援複製。
- [ ] Step 2: 驗證現況仍顯示「推薦碼/邀請碼尚未提供」。
- [ ] Step 3: 共用同一 RPC response shape；處理 loading/error/retry。
- [ ] Step 4: 驗證 activation-code 與 invite-friends 顯示一致。

### Task 4: Refresh UX contract

**Files:**
- Modify: `UX-CONTRACT.md`

- [ ] Step 1: 將 Submit referral code ledger 更新為現行 `member_referral_submit`：pending、stay-in-place success、`推薦碼已儲存`、可重試失敗。
- [ ] Step 2: 不回退現有 working RPC 行為。

### Task 5: Matrix analysis execution ownership / lease

**Files:**
- Test: `services/matrix-api/tests/test_analysis_repository.py`, pipeline tests, migration contract test.
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`, `services/matrix-api/app/services/analysis_pipeline.py`
- Create: new Supabase migration under `supabase/migrations/`.

**Interfaces:**
- `begin_run(..., owner_id, lease_seconds)` returns an acquired/running record only when caller owns a valid lease; an active lease owned by another worker returns a non-acquired result.
- progress/complete/fail mutations include owner predicate and reject stale owners.

- [ ] Step 1: RED repository/pipeline concurrency tests.
- [ ] Step 2: 新增 `owner_id`, `lease_expires_at` and atomic lease acquisition RPC/mutation with same `(lottery, draw_period, analysis_version)` identity.
- [ ] Step 3: pipeline generates one owner id per invocation and skips when another live owner holds the lease.
- [ ] Step 4: complete/fail clear lease; expired lease can be reacquired; stale owner cannot overwrite.
- [ ] Step 5: run Supabase advisors and live schema verification after migration.

### Task 6: Remove unreachable MatrixCorePage residue without routing regression

**Files:**
- Test: route/dead-code contract test.
- Modify: `src/FeaturePages.tsx` only after comparing PR #255 patch and latest main.

- [ ] Step 1: RED static/route contract proving `matrix-core` remains mapped to `MatrixExplorePage` and homepage still uses `explore`, while legacy `MatrixCorePage` definition is absent.
- [ ] Step 2: remove only the unreachable component and code exclusively referenced by it.
- [ ] Step 3: verify no Matrix 牌單 region from PR #255 is altered.

### Task 7: Verification and integration safety

- [ ] Run focused RED/GREEN tests per task.
- [ ] Run full `npm run test:unit`, Node contract tests, `npm run build`, Matrix API pytest suite, and configured runtime checks through GitHub Actions.
- [ ] Re-read latest main before completion and compare branch against it.
- [ ] Confirm no overlap/regression with open PR #276/#260/#255/#244 beyond explicitly reviewed files.
- [ ] Leave branch/PR unmerged until explicit user confirmation.
