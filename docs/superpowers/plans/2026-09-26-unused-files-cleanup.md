# Unused Files Cleanup Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this cleanup in this session.

**Goal:** Remove confirmed unused repository files without changing current frontend, backend, admin, or deployment behavior.

**Architecture:** Trace current application and Edge Function entry points, scripts, workflow invocations, static assets, and dynamic asset path construction. Delete only independently verified unused files. Compare production output hashes before and after deletion; the PWA build identifier is expected to change when public files disappear.

**Tech Stack:** React, TypeScript, Vite, Supabase Edge Functions, Python Railway services, GitHub Actions.

**Spec:** User request: broadly inspect frontend/backend/GitHub for unused old files and clean up while preserving existing functionality.

## Global Constraints

- Baseline: `ffbc829b422857062698ab1db261b485cc2da34e`.
- Work on `cleanup/broad-unused-audit-20260926`; preserve concurrent changes on main.
- Follow `AGENTS.md`: only explicitly named, related tests; no full suite.
- Preserve live data, migration history, test fixtures/oracles, documented manual recovery commands, and explicitly retained design originals.
- Do not change UI, CSS, authorization, algorithms, API routes, dependencies, or workflow triggers.

## Review Focus

- Dynamic `SettingLabelIcon` paths and template-string asset bases must survive.
- Notification artwork now uses `/resources/notify-*.png`; confirm no old-path construction elsewhere.
- Negative assertions mentioning obsolete filenames are not runtime consumers.
- Old backend names may still serve test/oracle or manual recovery purposes.
- Removing public files changes the PWA cache fingerprint, not service-worker behavior.

### Task 1: Remove unused source and one-time rewrite scripts

**Files:**
- Delete `src/BrandLogo.tsx` and `src/subscription-copy.tsx` after confirming no runtime imports.
- Remove unused `brandSource` reads from `tests/requested-history-quick-logo.test.mjs` and `tests/responsive-feature-pages-request.test.mjs`; preserve every assertion.
- Delete `scripts/tmp-explore-reference-final.py`, `scripts/tmp_matrix_explore_finalize.py`, and `scripts/normalize_matrix_explore_canonical.py`; no workflow/package/source/document invocation exists and their old CSS markers no longer exist.

- [x] Inspect current import consumers and establish a successful baseline build and 30 related Node assertions.
- [x] Apply the deletions and remove the two unused test reads.
- [x] Repeat the same explicit Node test files; expected: 30 passed, no assertion removed.

### Task 2: Remove confirmed unused public artwork

**Files:**
- All eight files under `public/assets/notifications/`.
- `public/assets/lottery/functions/{HomeLogo.svg,matrixWW1.png,matrixcore.png,命中條件.png}`.
- `public/assets/lottery/{header-06-flow.svg,header-07-geometric.svg,header-explore-luxury-flow.svg,header-explore-planet.svg}`.
- `public/assets/lottery/status/{Matrixbba.png,matrixAA.png}`.
- `public/assets/quick/{notebook-mode-note.png,notebook-mode-record.png}`.

- [x] Inspect complete source references and dynamic paths; preserve current assets and documented originals.
- [x] Delete the 20 retired images.
- [x] Run `npm run build:pages`; expected: successful runtime integrity, TypeScript, PWA and admin builds.
- [x] Compare against baseline: exactly those public files removed; all retained files identical except generated PWA fingerprint, whose normalized template must be identical.

### Task 3: Review, document and integrate

**Files:** `docs/audits/2026-09-26-unused-files-cleanup.md`.

- [x] Record removed files, byte reduction, retained candidates and coverage limitations.
- [ ] Review the diff independently, verify `git diff --check`, and confirm no changes to backend/SQL/workflows.
- [ ] Create one cleanup PR, verify GitHub checks and conflicts, and merge under the user's standing authorization.

## Execution Notes

- This is reversible file removal; existing behavior checks and byte-for-byte output comparison provide the verification. No new behavior or mirror-of-deletion tests are needed.
- The fresh checkout is dedicated to this task; use its cleanup branch without creating a redundant checkout.
- Production database rows, external deployment filesystem leftovers and other repositories are outside the verified deletion set.
