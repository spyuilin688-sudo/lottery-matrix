# Member and Notification API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing hard-coded member data and in-memory notification settings with authenticated APIs backed by the existing Supabase project.

**Architecture:** Keep the current AppDeploy TypeScript backend. Reuse `matrixMemberAuth.requireMember()` for Supabase bearer authentication, add narrowly scoped Supabase stores/routes, then connect the existing React pages through the existing `matrixApiFetch` client. Do not modify crawler, algorithm, explore, status, TongXing or number-reference behavior.

**Tech Stack:** React 19, TypeScript, Vitest, AppDeploy router, Supabase REST/Postgres

**Spec:** `docs/superpowers/specs/2026-08-23-member-notification-api-design.md`

## Global Constraints

- Formal source is `lottery-matrix/main`.
- Existing crawler/Matrix APIs remain unchanged.
- Do not add new notification types or change notification UI flow.
- Shortcut remains frontend-only.
- Supabase service-role credentials stay backend-only.
- Public-schema storage added by this change must have RLS enabled.

---

### Task 1: Member profile API

**Files:**
- Create: `backend/member-profile-store.ts`
- Create: `backend/member-profile-routes.ts`
- Create: `backend/member-profile-routes.test.ts`
- Modify: `backend/index.ts`

**Interfaces:**
- Consumes: `matrixMemberAuth.requireMember(authorization)` and existing Supabase server config.
- Produces: authenticated `GET /api/member/profile` returning `{ lineUserId, planName, planExpiresAt, isLifetime }`.

- [ ] **Step 1: Write the failing route test**

```ts
it('returns only the authenticated member profile fields', async () => {
  const api = createMemberProfileRoutes({
    requireMember: async () => ({ authUserId: 'u1', memberId: 'm1', plan: 'monthly', active: true, referralSuccessCount: 0 }),
    readProfile: async () => ({ lineUserId: 'line-1', planName: '月費方案', planExpiresAt: '2026-09-22T00:00:00.000Z', isLifetime: false }),
  });
  await expect(api.get({ authorization: 'Bearer token' })).resolves.toEqual({
    status: 200,
    body: { lineUserId: 'line-1', planName: '月費方案', planExpiresAt: '2026-09-22T00:00:00.000Z', isLifetime: false },
  });
});
```

- [ ] **Step 2: Run `npm run test:unit -- backend/member-profile-routes.test.ts` and verify RED because the route module does not exist.**
- [ ] **Step 3: Implement the minimal store/route and register `GET /api/member/profile` in `backend/index.ts`.**
- [ ] **Step 4: Run the targeted test and verify GREEN.**

### Task 2: Notification settings storage and API

**Files:**
- Create: `backend/member-notification-settings.ts`
- Create: `backend/member-notification-store.ts`
- Create: `backend/member-notification-routes.ts`
- Create: `backend/member-notification-routes.test.ts`
- Modify: `backend/index.ts`
- Apply Supabase migration: `notification_settings`

**Interfaces:**
- Consumes: authenticated `memberId`.
- Produces: `GET /api/member/notification-settings` and `PUT /api/member/notification-settings` with the exact current `NotificationsPage` settings shape.

- [ ] **Step 1: Write failing tests for default read, saved read, authenticated save and member-scoped upsert.**
- [ ] **Step 2: Run `npm run test:unit -- backend/member-notification-routes.test.ts` and verify RED because the modules do not exist.**
- [ ] **Step 3: Implement the exact current notification defaults and route validation without adding fields.**
- [ ] **Step 4: Add `notification_settings(member_id, settings, updated_at)`, foreign key to `members(id)`, enable RLS, and keep access backend-only.**
- [ ] **Step 5: Register the two authenticated routes in `backend/index.ts`.**
- [ ] **Step 6: Run targeted tests and verify GREEN.**

### Task 3: Frontend API clients and page integration

**Files:**
- Create: `src/member-api.ts`
- Create: `src/member-api.test.ts`
- Modify: `src/FeaturePages.tsx`

**Interfaces:**
- Consumes: `matrixApiFetch`.
- Produces: `fetchMemberProfile()`, `fetchNotificationSettings()`, `saveNotificationSettings()`.

- [ ] **Step 1: Write failing client tests for the three endpoint contracts.**
- [ ] **Step 2: Run `npm run test:unit -- src/member-api.test.ts` and verify RED.**
- [ ] **Step 3: Implement the minimal client functions using the existing authenticated Matrix API client.**
- [ ] **Step 4: In `NotificationsPage`, load stored settings into the existing controls and save changes without adding UI or changing labels/options.**
- [ ] **Step 5: In `ProfilePage`, replace only the hard-coded LINE ID / plan / expiry values with API values. Keep the current layout and current generic display name because no member display-name source exists.**
- [ ] **Step 6: Run targeted tests and verify GREEN.**

### Task 4: Verification and release

**Files:**
- No unrelated source changes.

- [ ] **Step 1: Run `npm run test:unit`.**
- [ ] **Step 2: Run the repository Node test suite used by CI: `node --test tests/*.test.mjs`.**
- [ ] **Step 3: Run `npm run build`.**
- [ ] **Step 4: Run Supabase security and performance advisors; resolve only findings caused by this migration.**
- [ ] **Step 5: Confirm `main` contains only the intended API/data integration changes.**
- [ ] **Step 6: Update the existing formal AppDeploy deployment and verify terminal status plus live preview.**
