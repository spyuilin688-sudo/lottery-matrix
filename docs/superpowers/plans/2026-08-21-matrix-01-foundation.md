# Matrix Integration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish typed analysis contracts, Supabase member authentication/entitlements, an authenticated PWA client, and atomic three-day AppDeploy artifact storage.

**Architecture:** Pure factories isolate Supabase HTTP and AppDeploy Database operations for unit testing. API handlers receive a verified member context from a bearer token, and all algorithm services publish/read immutable versioned envelopes through one artifact store.

**Tech Stack:** TypeScript, AppDeploy SDK, Supabase Auth/REST, React/Vite client utilities, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-matrix-full-api-integration-design.md`

## Global Constraints

- Branch `api` only; do not modify `main`.
- Service-role secrets remain backend-only.
- Authorization must use `members.auth_user_id`, current `plans`, expiry, lifetime, and confirmed referral subscriptions; never use user-editable metadata.
- Use Asia/Taipei for weekday referral access.
- Artifacts are readable only after an atomic manifest is marked `complete`.
- Artifact expiry is exactly three days after completion.

---

### Task 1: Define Shared Analysis Contracts

**Files:**
- Create: `shared/matrix-contracts.ts`
- Create: `shared/matrix-contracts.test.ts`

**Interfaces:**
- Produces: `LotteryId`, `MatrixAnalysisKind`, `MatrixAnalysisMeta`, `MatrixCompletedEnvelope<T>`, `MatrixListEnvelope<T>`, `MatrixValidationEnvelope<T>`, `MatrixFailureCode`.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from 'vitest';
import { completedEnvelope } from './matrix-contracts';

it('requires one analysis version and draw period on every completed response', () => {
  expect(completedEnvelope('explore', '今彩539', '114000123', '114000123:v1', [1])).toEqual({
    kind: 'explore', lottery: '今彩539', drawPeriod: '114000123',
    analysisVersion: '114000123:v1', status: 'complete', data: [1],
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm run test:unit -- shared/matrix-contracts.test.ts`

Expected: FAIL because `completedEnvelope` does not exist.

- [ ] **Step 3: Implement the contracts**

```ts
export type LotteryId = '今彩539' | '天天樂' | '六合彩' | '大樂透';
export type MatrixAnalysisKind = 'explore' | 'tianyan' | 'tiangong' | 'status';
export type MatrixAnalysisMeta = { kind: MatrixAnalysisKind; lottery: LotteryId; drawPeriod: string; analysisVersion: string };
export type MatrixCompletedEnvelope<T> = MatrixAnalysisMeta & { status: 'complete'; data: T };
export type MatrixListEnvelope<T> = MatrixCompletedEnvelope<{ items: T[]; total: number }>;
export type MatrixValidationEnvelope<T> = MatrixCompletedEnvelope<{ itemId: string; validation: T }>;
export type MatrixFailureCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'ANALYSIS_NOT_READY' | 'ANALYSIS_VERSION_MISMATCH' | 'INVALID_REQUEST';
export function completedEnvelope<T>(kind: MatrixAnalysisKind, lottery: LotteryId, drawPeriod: string, analysisVersion: string, data: T): MatrixCompletedEnvelope<T> {
  return { kind, lottery, drawPeriod, analysisVersion, status: 'complete', data };
}
```

- [ ] **Step 4: Run the test**

Run: `npm run test:unit -- shared/matrix-contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/matrix-contracts.ts shared/matrix-contracts.test.ts
git commit -m "feat(api): add Matrix analysis contracts"
```

### Task 2: Verify Supabase Users and Resolve Member Entitlements

**Files:**
- Create: `backend/matrix-member-auth.ts`
- Create: `backend/matrix-member-auth.test.ts`
- Create: `backend/matrix-entitlements.ts`
- Create: `backend/matrix-entitlements.test.ts`

**Interfaces:**
- Produces: `MemberContext = { authUserId: string; memberId: string; plan: 'free' | 'trial' | 'monthly' | 'quarterly' | 'yearly' | 'lifetime'; active: boolean; referralSuccessCount: number }`.
- Produces: `createMemberAuth(loadConfig, fetcher).requireMember(authorization): Promise<MemberContext>`.
- Produces: `resolveMatrixEntitlements(member, now): MatrixEntitlements`.

- [ ] **Step 1: Write failing auth tests**

```ts
it('rejects a missing bearer token before any Supabase call', async () => {
  const fetcher = vi.fn();
  const auth = createMemberAuth(async () => ({ url: 'https://db.test', anonKey: 'anon', serviceRoleKey: 'service' }), fetcher);
  await expect(auth.requireMember(undefined)).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});

it('uses the Auth user id to resolve the member and plan', async () => {
  const auth = createMemberAuth(loadConfig, sequenceFetcher([
    jsonResponse({ id: 'auth-1' }),
    jsonResponse([{ id: 'member-1', auth_user_id: 'auth-1', is_lifetime: false, plan_expires_at: '2026-09-01T00:00:00Z', current_plan: { name: '季費方案' }, referral_code: 'ABC' }]),
    jsonResponse([{ id: 'referred-1' }, { id: 'referred-2' }]),
  ]));
  await expect(auth.requireMember('Bearer token')).resolves.toMatchObject({ memberId: 'member-1', plan: 'quarterly', referralSuccessCount: 2 });
});
```

- [ ] **Step 2: Write failing entitlement tests**

```ts
expect(resolveMatrixEntitlements(monthly, taipeiTuesday)).toMatchObject({ canUseThirteen: true, canUseFullRange: true, canCustomizeStatus: true, canUseCompositeCustomRoad: false });
expect(resolveMatrixEntitlements(quarterly, taipeiWednesday)).toMatchObject({ canUseTianyan: true, canUseCompositeCustomRoad: true });
expect(resolveMatrixEntitlements(yearly, taipeiWednesday)).toMatchObject({ canUseTiangong: true });
expect(resolveMatrixEntitlements(trial, taipeiWednesday)).toMatchObject({ canViewFullStatus: true, canCustomizeStatus: false });
expect(resolveMatrixEntitlements(free, taipeiTuesday).canUseSeven).toBe(true);
expect(resolveMatrixEntitlements(free, taipeiWednesday).canUseSeven).toBe(false);
expect(resolveMatrixEntitlements({ ...free, referralSuccessCount: 10 }, taipeiMonday).canUseSeven).toBe(true);
expect(resolveMatrixEntitlements({ ...free, referralSuccessCount: 10 }, taipeiThursday).canUseSeven).toBe(true);
expect(resolveMatrixEntitlements({ ...free, referralSuccessCount: 15 }, taipeiWednesday).canUseSeven).toBe(true);
expect(resolveMatrixEntitlements({ ...free, referralSuccessCount: 30 }, taipeiTuesday).canUseFullRange).toBe(true);
expect(resolveMatrixEntitlements({ ...free, referralSuccessCount: 30 }, taipeiWednesday).canUseFullRange).toBe(false);
expect(resolveMatrixEntitlements({ ...free, referralSuccessCount: 50 }, taipeiWednesday).canUseFullRange).toBe(true);
```

- [ ] **Step 3: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-member-auth.test.ts backend/matrix-entitlements.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement member resolution**

`requireMember()` must call Supabase Auth `GET /auth/v1/user` with the bearer token, then backend REST reads using the service-role key. Resolve plan names exactly as `試用方案`, `月費方案`, `季費方案`, `年費方案`; `is_lifetime` maps to `lifetime`. Count distinct referred members whose `invitation_code` equals the current member's `referral_code` and who have at least one `payments.status = confirmed` record. Do not return either key.

- [ ] **Step 5: Implement entitlements**

```ts
export type MatrixEntitlements = {
  canUseSeven: boolean; canUseThirteen: boolean; canUseFullRange: boolean;
  canUseTianyan: boolean; canUseTiangong: boolean;
  canViewFullStatus: boolean; canCustomizeStatus: boolean; canUseCompositeCustomRoad: boolean;
};
```

Use `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' })`. Apply referral thresholds 10/15/30/50 and Tuesday/Friday rules exactly from the design spec.

- [ ] **Step 6: Run tests**

Run: `npm run test:unit -- backend/matrix-member-auth.test.ts backend/matrix-entitlements.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/matrix-member-auth.ts backend/matrix-member-auth.test.ts backend/matrix-entitlements.ts backend/matrix-entitlements.test.ts
git commit -m "feat(api): enforce Matrix member entitlements"
```

### Task 3: Add the Authenticated PWA API Client

**Files:**
- Create: `src/matrix-api-client.ts`
- Create: `src/matrix-api-client.test.ts`
- Modify: `src/matrix-algorithm-api.ts`

**Interfaces:**
- Produces: `matrixApiFetch<T>(path: string, init?: RequestInit): Promise<T>`.
- Consumes: `getSupabaseClient().auth.getSession()` and `LOTTERY_API_BASE`.

- [ ] **Step 1: Write the failing client test**

```ts
it('adds the current Supabase access token', async () => {
  const fetcher = vi.fn(async () => jsonResponse({ ok: true }));
  const client = createMatrixApiClient(async () => 'access-token', fetcher, 'https://api.test');
  await client.fetchJson('/api/matrix/status/summary/今彩539');
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/api/matrix/status/summary/'), expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
  }));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- src/matrix-api-client.test.ts`

Expected: FAIL because `createMatrixApiClient` is absent.

- [ ] **Step 3: Implement the client and migrate Explore transport**

The client throws stable errors for 401, 403, 404/not-ready, non-JSON, and network failure. Replace the direct `fetch()` inside `runMatrixAlgorithmExplore()` with `matrixApiFetch()` while preserving its cache and in-flight deduplication.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/matrix-api-client.test.ts src/matrix-result-cache.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/matrix-api-client.ts src/matrix-api-client.test.ts src/matrix-algorithm-api.ts
git commit -m "feat(pwa): authenticate Matrix API requests"
```

### Task 4: Store Atomic Versioned Artifacts for Three Days

**Files:**
- Create: `backend/matrix-analysis-store.ts`
- Create: `backend/matrix-analysis-store.test.ts`
- Create: `backend/matrix-result-store.test.ts`
- Modify: `backend/matrix-result-store.ts`

**Interfaces:**
- Produces: `createAnalysisStore(adapter)`.
- Produces: `beginAnalysis(meta)`, `publishAnalysis(meta, data)`, `readAnalysis(kind, lottery, drawPeriod?)`, `cleanupExpired(now)`.
- Consumes: an adapter with `list`, `add`, `delete` matching AppDeploy Database behavior.

- [ ] **Step 1: Write failing atomic-publication tests**

```ts
it('never exposes a writing version', async () => {
  const store = createAnalysisStore(memoryAdapter());
  await store.beginAnalysis(meta);
  await expect(store.readAnalysis('explore', '今彩539')).resolves.toBeNull();
  await store.publishAnalysis(meta, { items: [1] });
  await expect(store.readAnalysis('explore', '今彩539')).resolves.toMatchObject({ status: 'complete', data: { items: [1] } });
});

it('deletes manifests and chunks completed more than three days ago', async () => {
  const store = createAnalysisStore(memoryAdapter());
  await store.publishAnalysis({ ...meta, completedAt: '2026-08-17T00:00:00Z' }, { items: [] });
  await store.cleanupExpired(new Date('2026-08-21T00:00:01Z'));
  await expect(store.readAnalysis('explore', '今彩539')).resolves.toBeNull();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- backend/matrix-analysis-store.test.ts`

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement chunked immutable artifacts and manifest switching**

Reuse the existing 180,000-byte UTF-8 chunking rule. Write chunks first, verify every chunk, then write the `complete` manifest containing `kind`, `lottery`, `drawPeriod`, `analysisVersion`, `itemCount`, `startedAt`, `completedAt`, and `expiresAt`. `readAnalysis()` reads only the latest complete manifest and rejects mixed versions.

- [ ] **Step 4: Keep the legacy Explore reader compatible**

Make `readCompletedMatrixResult()` delegate to the new store for published artifacts and retain the legacy request-key lookup only until Plan 02 migrates the route.

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- backend/matrix-analysis-store.test.ts backend/matrix-result-store.test.ts`

Expected: PASS; incomplete and mixed artifacts are unreadable.

- [ ] **Step 6: Commit**

```bash
git add backend/matrix-analysis-store.ts backend/matrix-analysis-store.test.ts backend/matrix-result-store.ts backend/matrix-result-store.test.ts
git commit -m "feat(api): publish atomic Matrix artifacts"
```
