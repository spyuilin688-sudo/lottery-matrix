# Test & CI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce redundant test maintenance, add actionable coverage reporting, verify Edge Function suite inclusion, and add a safe deployed-environment smoke-test path without changing production behavior.

**Architecture:** Keep existing test runners and CI jobs intact. Add small focused test/CI utilities around them: canonicalize duplicated static assertions, add informational Vitest V8 coverage, add a config/inventory regression test for Edge Functions, and add a non-mutating deployment smoke script plus opt-in workflow.

**Tech Stack:** Node.js 22, Vitest 4, Playwright, GitHub Actions, Supabase Edge Functions.

**Spec:** `docs/superpowers/specs/2026-09-11-test-ci-hardening-design.md`

## Global Constraints

- Do not change algorithm behavior.
- Do not change membership, billing, notification, UI, or production API behavior.
- Do not add a coverage percentage threshold in this pass.
- Production smoke checks must be read-only and credential-free.
- Existing CI jobs remain the source of truth for regression verification.

---

### Task 1: Deduplicate bottom-navigation static contracts

**Files:**
- Modify: `tests/bottom-navigation.test.mjs`
- Modify: `tests/bottom-navigation-height.test.mjs`
- Modify: `tests/bottom-navigation-safe-area-position.test.mjs`

**Interfaces:**
- Consumes: existing CSS/token source files.
- Produces: one canonical assertion owner per exact static invariant while preserving distinct regression checks.

- [ ] Identify exact duplicate assertions across the three files.
- [ ] Remove only exact duplicate checks; keep unique safety and rendered-behavior contracts.
- [ ] Run the affected Node tests and verify all pass.
- [ ] Run the complete `node --test tests/*.test.mjs` suite.

### Task 2: Add informational Vitest coverage

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing `test:unit` Vitest suite.
- Produces: `npm run test:coverage`, using V8 coverage with no percentage threshold.

- [ ] Add `@vitest/coverage-v8` matching the installed Vitest major/version.
- [ ] Add `test:coverage` script invoking Vitest coverage.
- [ ] Configure text and JSON-summary coverage reporters without thresholds.
- [ ] Add a CI coverage step after the normal Vitest suite so normal test failure semantics remain unchanged.
- [ ] Run coverage locally/CI and verify report generation.

### Task 3: Guard Edge Function test inclusion

**Files:**
- Create: `tests/edge-functions-config.test.mjs`
- Modify only if required: `vitest.edge-functions.config.ts`

**Interfaces:**
- Consumes: Edge Function test files under `supabase/functions/**` and `vitest.edge-functions.config.ts` include globs.
- Produces: a Node regression test that detects tested Edge Function directories omitted from the dedicated Edge suite.

- [ ] Write a failing inventory regression test against an intentionally missing fixture/expectation.
- [ ] Verify RED.
- [ ] Implement the minimal config/inventory logic in the test against the real config.
- [ ] Verify GREEN on the focused test.
- [ ] Run the full Node suite.

### Task 4: Add deployed-environment smoke tests

**Files:**
- Create: `scripts/production-smoke.mjs`
- Create: `tests/production-smoke-contract.test.mjs`
- Create: `.github/workflows/production-smoke.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes environment variables `SMOKE_PWA_URL`, `SMOKE_ADMIN_URL`, and optional `SMOKE_API_URL`.
- Produces `npm run test:production-smoke`, making GET/HEAD requests only and rejecting 5xx/network failures.

- [ ] Write the smoke-script contract test first.
- [ ] Verify RED because the script does not yet exist.
- [ ] Implement the minimal read-only smoke script.
- [ ] Verify GREEN on the focused test.
- [ ] Add package script.
- [ ] Add a manual/dispatch GitHub Actions workflow using repository variables; make absent URLs explicit rather than silently passing.
- [ ] Run focused Node tests.

### Task 5: Full verification and PR

**Files:**
- No production-code files.

**Interfaces:**
- Consumes all prior changes.
- Produces a reviewable PR with CI evidence.

- [ ] Run `npm run test:unit`.
- [ ] Run `npm run test:edge-functions`.
- [ ] Run `node --test tests/*.test.mjs`.
- [ ] Run `npm run test:runtime` and membership preview Playwright suite.
- [ ] Run `npm run build`.
- [ ] Run admin tests/builds and Matrix API pytest via CI.
- [ ] Open PR to `main` only after fresh verification evidence is available.
