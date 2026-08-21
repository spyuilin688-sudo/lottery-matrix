# Matrix Full Integration Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Matrix Explore, Tianyan, Tiangong, Matrix Status, custom triggers, Supabase entitlements, PWA, and admin integration as six independently reviewable phases.

**Architecture:** AppDeploy computes and retains versioned algorithm artifacts for three days; Supabase owns member, plan, referral, custom-trigger, and admin data. The PWA sends the Supabase access token to AppDeploy and reads only completed artifacts, while the admin reads a read-only analysis monitor.

**Tech Stack:** TypeScript, AppDeploy SDK and Database, React 19, Vite 8, Vitest 4, Playwright 1.61, Supabase PostgreSQL and Auth.

**Spec:** `docs/superpowers/specs/2026-08-21-matrix-full-api-integration-design.md`

## Global Constraints

- Work only on branch `api`; do not modify or push `main`.
- Preserve the approved algorithm formulas and existing mobile visual direction.
- AppDeploy stores algorithm artifacts and validation details for three days.
- Supabase stores operational/member settings only, never full algorithm results.
- PWA never executes, merges, ranks, or fabricates algorithm results.
- Every response that belongs to an analysis contains `analysisVersion` and `drawPeriod`.
- Never expose or commit a Supabase service-role key.
- Verify widths 390px, 375px, and 360px.

---

### Task 1: Execute the Foundation Plan

**Files:**
- Read and execute: `docs/superpowers/plans/2026-08-21-matrix-01-foundation.md`

**Interfaces:**
- Produces authenticated member context, entitlement decisions, shared API envelopes, and versioned artifact storage used by all later phases.

- [ ] **Step 1: Complete every checkbox in the foundation plan**

Run its focused tests and commit gates exactly as written.

- [ ] **Step 2: Gate the phase**

Run: `npm run test:unit -- backend/matrix-member-auth.test.ts backend/matrix-entitlements.test.ts backend/matrix-analysis-store.test.ts src/matrix-api-client.test.ts`

Expected: all foundation tests pass.

### Task 2: Execute Matrix Explore

**Files:**
- Read and execute: `docs/superpowers/plans/2026-08-21-matrix-02-explore.md`

**Interfaces:**
- Consumes: Task 1 authentication, entitlements, API envelopes, and artifact store.
- Produces: completed Explore artifacts, authenticated list/detail endpoints, and real PWA Explore rendering.

- [ ] **Step 1: Complete every checkbox in the Explore plan**

- [ ] **Step 2: Gate the phase**

Run: `npm run test:unit -- backend/matrix-algorithm.test.ts backend/matrix-explore-service.test.ts src/__tests__/MatrixExplorePage.test.tsx`

Expected: existing algorithm cases and new Explore integration tests pass.

### Task 3: Execute Matrix Tianyan

**Files:**
- Read and execute: `docs/superpowers/plans/2026-08-21-matrix-03-tianyan.md`

**Interfaces:**
- Consumes: Task 1 foundation and Task 2 canonical Explore row/validation contract.
- Produces: PDF-compliant composite-road artifacts and Tianyan PWA integration.

- [ ] **Step 1: Complete every checkbox in the Tianyan plan**

- [ ] **Step 2: Gate the phase**

Run: `npm run test:unit -- backend/matrix-tianyan.test.ts backend/matrix-tianyan-cases.test.ts src/__tests__/MatrixTianyanPage.test.tsx`

Expected: all five Appendix A cases and PWA tests pass.

### Task 4: Execute Matrix Tiangong

**Files:**
- Read and execute: `docs/superpowers/plans/2026-08-21-matrix-04-tiangong.md`

**Interfaces:**
- Consumes: Task 1 foundation and shared validation detail contract.
- Produces: one-stage/two-stage Tiangong artifacts and real PWA results.

- [ ] **Step 1: Complete every checkbox in the Tiangong plan**

- [ ] **Step 2: Gate the phase**

Run: `npm run test:unit -- backend/matrix-tiangong.test.ts backend/matrix-tiangong-service.test.ts src/__tests__/MatrixTiangongPage.test.tsx`

Expected: all synthetic rule combinations pass.

### Task 5: Execute Matrix Status and Custom Triggers

**Files:**
- Read and execute: `docs/superpowers/plans/2026-08-21-matrix-05-status-custom.md`

**Interfaces:**
- Consumes: Task 1 entitlements plus completed Explore/Tianyan artifacts from Tasks 2 and 3.
- Produces: Chapter 15 status, custom trigger persistence/evaluation, Dormant, home/status APIs, and the custom settings page.

- [ ] **Step 1: Complete every checkbox in the status plan**

- [ ] **Step 2: Gate the phase**

Run: `npm run test:unit -- backend/matrix-status.test.ts backend/matrix-custom-status.test.ts src/__tests__/MatrixStatusIntegration.test.tsx src/__tests__/MatrixCustomStatusPage.test.tsx`

Expected: Chapter 15, custom conditions, plan downgrade, reset, and Dormant cases pass.

### Task 6: Execute Orchestration, Admin Monitor, and End-to-End Verification

**Files:**
- Read and execute: `docs/superpowers/plans/2026-08-21-matrix-06-orchestration-admin-e2e.md`

**Interfaces:**
- Consumes: all prior services.
- Produces: latest-draw analysis orchestration, atomic publication, three-day cleanup, admin monitoring, and complete verification evidence.

- [ ] **Step 1: Complete every checkbox in the final integration plan**

- [ ] **Step 2: Run the repository release gate**

```bash
npm run test:unit
npm run test:sites
npm run build:verified
npm --prefix apps/admin run build
```

Expected: every command exits 0; no fake Matrix result constants remain in production render paths.

- [ ] **Step 3: Confirm branch state**

```bash
git status --short
git log --oneline -12
```

Expected: clean `api` worktree with one or more reviewed commits per phase; no merge or push to `main`.
