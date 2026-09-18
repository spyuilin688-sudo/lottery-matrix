# Project hardening implementation plan

> For agentic workers: use superpowers:subagent-driven-development. Work in bounded tasks, with task-scoped review and a final integrated review.

**Goal:** Implement the six approved improvements from the current conversation, excluding any automatic test workflow changes.

**Architecture:** Preserve existing React/PWA and admin flows. Scope notebook persistence to the authenticated LINE account, keep legacy unowned local data untouched, and make persistence failures recoverable. Extend the existing payment/admin boundary for payment reversal and derive referral rewards from confirmed payments. Keep the current Tiangong calculation parameters unchanged while correcting its fixed-value presentation.

**Tech Stack:** React, TypeScript, Supabase PostgreSQL, AppDeploy admin, Vitest, existing browser fixtures.

**Spec:** User approved the preceding seven-row audit table except automatic testing. Existing DESIGN.md and UX-CONTRACT.md supply shared UI behavior; existing member referral copy supplies reversal semantics.

## Global Constraints

- Do not modify .github/workflows, test automation rules, package scripts or unrelated UI.
- Only run tests with explicit relevant file paths; do not run any full test suite.
- Preserve all latest main changes, especially homepage, notification and custom-status UI.
- Keep existing phone layout, typography, spacing, illustrations and shared dialogs.
- Do not guess who owns legacy notebook data. Retain original keys without deletion or automatic assignment.
- Do not add cloud sync, payment-provider integration or new algorithm ranges.
- Never change real payment/member records to test; use isolated synthetic fixtures and rollback.
- Do not claim physical-device, LINE external authentication, or production behavior verified without direct evidence.

### Task 1: Notebook identity and persistence recovery

Files: src/features/NotebookPages.tsx; new focused notebook storage/helper tests if needed; src/__tests__/MatrixNotebookPage.test.tsx; existing notebook fixture tests only if integration requires it.

Interfaces: consume the existing Supabase session/LINE identity owner; key data by stable user.id, never token; preserve public component routing. Produce account-scoped persistence and explicit failure/retry state.

- [x] Trace existing auth subscriptions and draft/navigation behavior.
- [x] Reproduce account crossover and storage-write failure using synthetic accounts/storage.
- [x] Isolate notes, records and settings by account; block stale reads, stale writes and cross-account draft carryover.
- [x] Preserve legacy unowned keys unchanged and do not expose them automatically to an arbitrary account.
- [x] Handle read/write failures without replacing unread data or losing the in-memory draft; retry latest content using the shared feedback pattern.
- [x] Test account switch, logout, refresh, storage denial, retry, deletion/cancel and ordinary save.
- [x] Review diff and commit only task files; record commands/results.

### Task 2: Payment reversal and referral recalculation

Files: apps/admin/backend/admin-data.ts, apps/admin/backend/index.ts, corresponding targeted tests, apps/admin/src/AdminApp.tsx and admin actions module if necessary; one Supabase migration and focused transactional SQL test.

Interfaces: reuse existing admin permission/session authorization and confirmation; consume confirmed payment and referral success criteria; derive returned counts using existing canonical referral logic.

- [x] Read current payment schema, constraints, referral functions and admin permission boundaries.
- [x] Reproduce absence of an authorized, idempotent reversal path with isolated data.
- [x] Add the smallest existing-style administrative action recording refund/reversal status; exclude reversed payments from referral success and recompute reward qualification.
- [x] Keep money movement outside this action: record an already-completed reversal, never claim to send a refund.
- [x] Preserve valid remaining payments, reject unauthorized/invalid transitions, avoid duplicate effects and retain audit trace.
- [x] Verify SQL fixtures rollback, admin request validation, error/retry and confirmation behavior.
- [x] Review diff and commit only task files; record commands/results.

### Task 3: Active Pro dashboard counts

Files: apps/admin/backend/admin-data.ts and apps/admin/backend/admin-data.test.ts.

Interfaces: keep getDashboard response shape and pricing/duration semantics; count monthly/quarterly/yearly current valid enabled plans only.

- [x] Add focused test with active, expired, exact-expiry and disabled members.
- [x] Retrieve required status and exclude expired/disabled members in Pro counters.
- [x] Verify valid active and permanent entitlements according to current schema, preserving other statistics.
- [x] Run named admin data tests and review/commit.

### Task 4: Tiangong fixed-value presentation

Files: src/features/MatrixTiangongPage.tsx, the current owning CSS only if required, directly related component/contract test.

Interfaces: current settings fix exploration to fifty periods; no algorithm/input/range change.

- [x] Confirm latest maintained fifty-period specification before editing.
- [x] Replace the actionless selectable-looking button with an accessible fixed-value display, preserving layout/typography.
- [ ] Verify no fake action and unchanged request parameters at phone widths. Static semantics, request50 and compact CSS contracts pass; changed phone-browser rendering remains unavailable under Task5.
- [x] Review/commit task files.

### Task 5: Browser and integration verification

Files: existing relevant fixtures/configs only if required; this execution record and durable UX contract notes.

- [ ] Exercise real browser guest entry, notebook save/error/retry and account-switch isolation using synthetic fixtures.
- [ ] Verify narrow phone viewport layouts and keyboard/dialog behavior in changed flows.
- [x] Inspect available production LINE/PWA/admin paths without altering real member/payment data; record unavailable real-device/auth checks explicitly.
- [x] Run named related tests, typecheck/build and Premium static audit; classify unrelated baseline failures.
- [x] Re-read latest main; integrate only conflicting approved files, preserve all other current contents.
- [ ] Create a reviewable GitHub PR with test evidence and precise production deployment limitations.

## Execution record

- Baseline main: 51f17fb12db0fb63594805e97b820139a82dcd76. Local source snapshot uses hash-matched GitHub content; some original image assets are unavailable locally and must be preserved from GitHub base tree when publishing.
- Existing production admin reports ready and no recent frontend/backend errors. This is a health observation, not full authenticated acceptance testing.


### Reviewed implementation — notebook and payments

- Preserved the complete source baseline through main `0ce0219925b2491b6dc04c1cfd7ab8b79fa7ad8a`, including PR455 custom-status/home UI and PR456 API-health/registry fixes. Imported files are hash-matched; original remote binary assets must remain intact.
- Notebook ownership and persistence recovery passed independent specification and engineering review. Fresh named notebook/LINE/action/member-history checks: 66 passed across four files.
- Completed-payment reversal passed independent specification and engineering review after closing actual transport-error propagation and stale payment-load failure defects. Six named admin files: 119 passed. Actual reversal migration and canonical referral/entitlement SQL: three isolated PGlite checks passed, with no production data changes.
- Pending database migration: `supabase/migrations/20260908174246_record_payment_reversal.sql`. The Supabase CLI-generated timestamp follows the already merged API registry migration. It has not been applied to the live project.

### Deployment and acceptance boundaries

- Apply the reviewed reversal migration before publishing the corresponding AppDeploy admin backend/UI. The frontend's terminal payment labels remain compatible with existing transfer-history states.
- A rollback should restore the previous application behavior while retaining reversal metadata and terminal records; do not remove terminal statuses or erase audit data after reversals exist.
- New fixture/browser and narrow-device validation is incomplete: two supervised local preview attempts failed, and the legacy Sites metadata refers to an unavailable project. No alternate preview daemon or replacement deployment was created. Existing production guest navigation and shared LINE login interception were inspected; these do not verify the new authenticated flows.
- Real LINE external authentication/return, authenticated administrator operation, and physical Android/iOS PWA behavior remain unverified. No real member/payment records were changed for acceptance testing.
- The separate admin TypeScript baseline includes missing injected AppDeploy SDK/Node test types and pre-existing fixture errors. The supported externalized admin Vite build and root TypeScript check pass. Do not represent this as a clean standalone admin typecheck.


### Final focused verification

| Area | Fresh evidence | Result |
| --- | --- | --- |
| Notebook, LINE protection, related actions and member payment history | Four explicitly named component files | 66 passed |
| Reversal backend, permissions, real transport mapping, admin lifecycle and active Pro counts | Six named admin files; only the corrected panel fixture reran after its harness fix | 121 distinct checks passed |
| Tiangong page and layout | Two named component files; result loading assertions scoped to the result panel after native output was introduced | 32 distinct checks passed |
| Tiangong/Explore CSS and setting contracts | Three named Node files, including red/green selected-color cascade regression | 6 passed |
| Transaction, ACL, referral and entitlement behavior | Isolated PGlite using actual migration and canonical SQL functions | 3 passed |
| Frontend production compile | build:pages includes runtime integrity, TypeScript and Vite | Passed |
| Admin production compile | APPDEPLOY_CI_EXTERNALS=true build | Passed |

- The fixed Tiangong output retains its selected colors through the existing compact selected-state owner, so the more-specific static base selector cannot overwrite the selected presentation.
- The new payment-reason field follows the canonical no-manual-resize rule with bounded automatic height and internal scrolling.
- Premium strict audits ran and still return nonzero: the root finding is an existing literal button inside a non-product test fixture; the three admin findings are attribute-only textarea detection that does not resolve the imported ancestor CSS. Manual source/import checks confirm both existing AdminTodos fields and the new reversal field inherit resize:none. No audit configuration or unrelated fixture was changed, and the auditor is not reported as clean.
- The remaining unchecked browser items are acceptance limitations, not completed verification. The GitHub PR is created after this pre-publication execution record and whole-branch review.
