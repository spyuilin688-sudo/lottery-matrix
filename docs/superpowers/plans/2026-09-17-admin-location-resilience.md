# Admin Location Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep admin login records usable and continue live IP-region enrichment when the Supabase location-cache read is temporarily unavailable.

**Architecture:** Preserve the existing `lookupLocations()` contract and negative-cache behavior. Make only the cache-read phase best-effort: a cache read failure must fall through to the existing bounded `ipwho.is` lookup instead of causing all regions on the page to become blank. No schema, UI, authentication, Push, Matrix, or crawler behavior changes.

**Tech Stack:** TypeScript, Vitest, Supabase REST, admin Edge backend.

**Spec:** `UX-CONTRACT.md`

## Global Constraints

- `spyuilin688-sudo/lottery-matrix` `main` is the only formal source.
- Base commit for this work: `3f3eda9277707c4fcbb21a28042ff42c2442c47a`.
- Preserve member records when third-party geolocation is unavailable.
- Do not add a second enrichment system, schema change, inline UI override, or new dependency.
- Do not change Push subscription lifecycle, Matrix algorithms, crawler scheduling, or authentication.

---

### Task 1: Make admin geolocation cache reads fail open to the existing provider

**Files:**
- Modify: `apps/admin/backend/admin-location-normalization.test.ts`
- Modify: `apps/admin/backend/member-login-history.ts`

**Interfaces:**
- Consumes: `lookupLocations(ips, api, fetcher)` and `listAdminLoginRecordPage(query, api)`.
- Produces: unchanged `Promise<Map<string, string | null>>` contract; cache-read failures fall through to the existing bounded provider lookup.

- [ ] **Step 1: Write the failing regression test**

Add a test where `/rest/v1/member_ip_locations` cache reading throws, the live provider returns `TW / Taipei`, and `listAdminLoginRecordPage()` still returns `estimatedRegion === '台灣・台北市'`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run apps/admin/backend/admin-location-normalization.test.ts`

Expected before implementation: FAIL because `lookupLocations()` rejects on the cache read and `enrichLoginRecords()` falls back to an empty map.

- [ ] **Step 3: Implement the minimal fallback**

Wrap only the cache read inside `lookupLocations()` in `try/catch`. On cache-read failure, treat that group as uncached and continue to the existing `missing`/provider path. Preserve current provider timeout, 10-IP bound, negative cache, cache write behavior, and return type.

- [ ] **Step 4: Run focused and related tests**

Run:
- `npx vitest run apps/admin/backend/admin-location-normalization.test.ts`
- `npx vitest run apps/admin/backend/member-login-history.test.ts`

Expected: PASS.

- [ ] **Step 5: Run admin build/type verification**

Run the repository's existing admin/backend verification commands selected by CI/package scripts; do not invent a new build path.

- [ ] **Step 6: Review the diff**

Confirm only the two implementation/test files plus this plan changed, no auth/Push/Matrix/crawler code changed, and no generated artifacts were added.
