# Admin Interface Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify every admin interface and require a second confirmation before every data-writing action.

**Architecture:** Preserve the existing React admin structure and dark gold visual language. Add one reusable asynchronous confirmation helper and one shared confirmation dialog, then apply consistent responsive styles across navigation, dashboards, lists, forms, dialogs, status cards, and pagination.

**Tech Stack:** React, TypeScript, CSS, Vitest, AppDeploy, Supabase REST backend.

**Spec:** Approved bounded design in the current conversation; no separate specification file.

## Global Constraints

- Optimize all current admin interfaces without adding new modules or changing data fields.
- Keep user and subscription management as lists with 30 rows per page.
- Keep wide mobile lists horizontally scrollable instead of compressing columns.
- Require confirmation before profile-name updates, member status changes, subscription updates, transfer decisions, activation-code creation, administrator creation/update, and administrator deletion.
- Search, filters, pagination, refresh, opening forms, and read-only dialogs do not require confirmation.
- Do not change the Supabase schema.
- Run only admin-scoped tests and checks.

---

### Task 1: Shared Confirmation Flow

**Files:**
- Create: `apps/admin/src/admin-confirmation.ts`
- Test: `apps/admin/src/admin-confirmation.test.ts`
- Modify: `apps/admin/src/AdminApp.tsx`

**Interfaces:**
- Produces: `runConfirmed(confirm, action): Promise<boolean>`.
- Produces: shared confirmation request state rendered by `ConfirmationDialog`.

- [ ] Write failing tests proving cancelled actions do not write and approved actions write once.
- [ ] Run the focused test and confirm it fails because the helper is absent.
- [ ] Implement the helper and shared dialog.
- [ ] Route every current POST, PUT, and DELETE admin action through the confirmation flow.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Full Admin Visual Unification

**Files:**
- Modify: `apps/admin/src/admin.css`
- Modify: `apps/admin/src/admin-operations.css`
- Modify: `apps/admin/src/profile-name.css`
- Modify: `apps/admin/src/system-status.css`
- Test: `apps/admin/src/admin-button-styles.test.ts`

**Interfaces:**
- Produces: consistent dimensions and hierarchy for navigation, headers, metrics, lists, forms, dialogs, buttons, status cards, and pagination.

- [ ] Add failing CSS contract assertions for shared interactive sizes, table hierarchy, responsive scrolling, and confirmation-dialog styles.
- [ ] Run the focused CSS test and confirm it fails for the missing rules.
- [ ] Implement responsive desktop and mobile styles using the existing palette and component classes.
- [ ] Run the focused CSS test and confirm it passes.

### Task 3: Admin Verification And Delivery

**Files:**
- Modify: `apps/admin/tests/tests.txt`

**Interfaces:**
- Confirms: all user-visible writes have a confirmation step and mobile lists remain usable.

- [ ] Reconcile the AppDeploy test suite with the confirmation workflow and full-interface visual update.
- [ ] Run the complete admin Vitest suite and `git diff --check` only.
- [ ] Verify Supabase write routes are unchanged and no schema migration is present.
- [ ] Commit the changed admin files to GitHub `main` without unrelated files.
- [ ] Deploy only the changed admin files to AppDeploy and poll until Ready.
