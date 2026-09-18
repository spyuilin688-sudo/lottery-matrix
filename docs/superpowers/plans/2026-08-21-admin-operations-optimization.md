# Admin Operations Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成用戶管理、訂閱管理、角色權限與系統連線狀態的後臺優化。

**Architecture:** 後臺 AppDeploy API 負責權限與 Supabase 寫入；Matrix API 記錄四個排程狀態；React 後臺以桌面表格及手機卡片呈現。每個異動都寫入既有 `audit_logs`，每個連線項目獨立回報。

**Tech Stack:** TypeScript、React 19、Vitest、AppDeploy SDK、Supabase Postgres/PostgREST

**Spec:** `docs/superpowers/specs/2026-08-21-admin-operations-optimization-design.md`

## Global Constraints

- 停用會員不得使用登入後及會員專屬功能；公開功能維持可用。
- 取消訂閱僅停止自動續訂，會員權限保留至到期日。
- 權限依超級管理員、營運管理員、查看人員三種角色統一套用。
- 不得刪除自己，且至少保留一位啟用中的超級管理員。
- 760px 以下用戶、訂閱與連線狀態使用卡片呈現。
- 每項連線狀態均顯示已確認的項目說明。

---

### Task 1: Supabase schema and member access enforcement

**Files:**
- Create: `supabase/migrations/20260821190000_admin_operations_status.sql`
- Modify: `backend/matrix-member-auth.ts`
- Test: `backend/matrix-member-auth.test.ts`

**Interfaces:**
- Produces: `members.auto_renew boolean`; `system_job_status(job_name, lottery, status, started_at, finished_at, error, updated_at)`.
- Produces: `requireMember()` throws `FORBIDDEN` when `members.status = '停用'`.

- [ ] **Step 1: Write failing tests** asserting the member query selects `status`, an inactive member is rejected, and active members continue to resolve.
- [ ] **Step 2: Run** `npx vitest run backend/matrix-member-auth.test.ts` and confirm the new inactive-member case fails.
- [ ] **Step 3: Add migration** with `alter table public.members add column if not exists auto_renew boolean not null default true`, create `public.system_job_status`, enable RLS, and revoke client writes.
- [ ] **Step 4: Implement member status enforcement** by adding `status` to `MemberRow` and the PostgREST select, then rejecting `status = '停用'` before entitlement resolution.
- [ ] **Step 5: Run** `npx vitest run backend/matrix-member-auth.test.ts` and confirm it passes.

### Task 2: Role permissions and protected administrator mutations

**Files:**
- Modify: `apps/admin/backend/admin-auth.ts`
- Modify: `apps/admin/backend/admin-data.ts`
- Modify: `apps/admin/backend/index.ts`
- Test: `apps/admin/backend/admin-auth.test.ts`
- Test: `apps/admin/backend/admin-writes.test.ts`

**Interfaces:**
- Produces: `ModuleKey = 'users' | 'subscriptions' | 'activationCodes' | 'systemSettings' | 'admins'`.
- Produces: `requireModulePermission(admin, module, action)` using fixed role matrices.
- Produces: deletion/update guards that reject the current administrator and prevent zero enabled super administrators.

- [ ] **Step 1: Write failing role-matrix tests** for all three roles and all five module keys.
- [ ] **Step 2: Write failing administrator safety tests** for self-delete, last-super deletion and last-super demotion or disablement.
- [ ] **Step 3: Run** `npm --prefix apps/admin test -- admin-auth.test.ts admin-writes.test.ts` and confirm the new cases fail.
- [ ] **Step 4: Implement the fixed role matrix** and replace generic CRUD checks on the affected routes with module/action checks.
- [ ] **Step 5: Implement administrator safety checks** before `updateRows` or `deleteRows`, preserving the existing audit flow after successful writes.
- [ ] **Step 6: Run** `npm --prefix apps/admin test -- admin-auth.test.ts admin-writes.test.ts` and confirm it passes.

### Task 3: User, subscription, transfer, and payment operations

**Files:**
- Modify: `apps/admin/backend/admin-data.ts`
- Modify: `apps/admin/backend/index.ts`
- Create: `apps/admin/src/admin-operations.ts`
- Create: `apps/admin/src/admin-operations.test.ts`
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/src/admin.css`
- Test: `apps/admin/backend/admin-writes.test.ts`

**Interfaces:**
- Produces routes: `PUT /api/members/:id/status`, `PUT /api/subscriptions/:id`, `GET /api/plans`, `GET /api/transfer-requests`, `PUT /api/transfer-requests/:id`.
- Subscription request shape: `{ action: 'activate'|'renew'|'cancel'|'adjustExpiry'|'lifetime', planId?: string, expiresAt?: string }`.
- Transfer request shape: `{ decision: 'confirmed'|'rejected' }`.

- [ ] **Step 1: Write failing backend tests** for enabled/disabled status, activate, renew, cancel, expiry adjustment, lifetime, transfer confirmation/rejection, payment creation and audit writes.
- [ ] **Step 2: Write failing frontend helper tests** for search/filter behavior and exact API payloads.
- [ ] **Step 3: Run** `npm --prefix apps/admin test` and confirm the new operation tests fail.
- [ ] **Step 4: Implement backend operations** with validated action values, plan lookup, date calculation, transfer-to-payment linkage and post-success audits.
- [ ] **Step 5: Implement desktop tables and 760px mobile cards** for users and subscriptions, including search, filter, details and the confirmed operation controls.
- [ ] **Step 6: Run** `npm --prefix apps/admin test` and `npm --prefix apps/admin run build` and confirm both pass.

### Task 4: Independent connection and cron statuses

**Files:**
- Create: `backend/system-job-status.ts`
- Create: `backend/system-job-status.test.ts`
- Modify: `backend/index.ts`
- Create: `apps/admin/backend/connection-status.ts`
- Create: `apps/admin/backend/connection-status.test.ts`
- Modify: `apps/admin/backend/index.ts`
- Create: `apps/admin/src/system-status.ts`
- Create: `apps/admin/src/system-status.test.ts`
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/src/admin.css`

**Interfaces:**
- Produces: `runTrackedJob(jobName, lottery, job)` which writes `running`, then `success` or `failed` to `system_job_status`.
- Produces route: `GET /api/system-status` returning `{ checkedAt, items: ConnectionStatusItem[] }`.
- `ConnectionStatusItem`: `{ id, name, description, ok, checkedAt, responseMs, error?, detail? }`.

- [ ] **Step 1: Write failing job-status tests** for running/success/failure writes and error rethrow.
- [ ] **Step 2: Write failing connection tests** proving one failed endpoint does not hide successful endpoint results and all confirmed descriptions are returned.
- [ ] **Step 3: Run** the new Vitest files and confirm they fail.
- [ ] **Step 4: Wrap the four production lottery schedules** with `runTrackedJob` without changing their fetch or analysis work.
- [ ] **Step 5: Implement independent checks** for admin backend, Matrix API, Supabase Database/Auth, four Matrix endpoints and four stored schedule rows.
- [ ] **Step 6: Implement system status cards** with automatic load, manual reload, status, last check, response time, error and description.
- [ ] **Step 7: Run** `npm --prefix apps/admin test`, `npm --prefix apps/admin run build`, and relevant root Vitest files.

### Task 5: Production verification, Supabase migration, GitHub and AppDeploy

**Files:**
- Modify only files required by a failed verification.

**Interfaces:**
- Consumes all prior tasks.
- Produces verified Supabase schema, GitHub main commit and ready AppDeploy versions.

- [ ] **Step 1: Run** `npm --prefix apps/admin test` and require zero failures.
- [ ] **Step 2: Run** `npm --prefix apps/admin run build` and require exit code 0.
- [ ] **Step 3: Run** relevant root backend tests and the root production build and require exit code 0.
- [ ] **Step 4: Apply** `20260821190000_admin_operations_status.sql` to Supabase and query the two new schema objects.
- [ ] **Step 5: Commit and push** the completed files to GitHub main as previously authorized by the user.
- [ ] **Step 6: Deploy** both Matrix API and admin AppDeploy apps, poll each until terminal `ready`, and inspect frontend/backend/network errors.
- [ ] **Step 7: Recheck** Supabase counts, live system status response and AppDeploy cron state before reporting completion.
