# Full-project mobile responsive A implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve the current black/gold visual language and product flows while making every member and admin view adapt continuously across 320–430 px phones.

**Architecture:** Keep the existing React/Vite structure. Add one Radix-based application dialog provider, route every confirmation/alert through it, and make the shared app shell, navigation, cards, forms, grids and overlays fluid before applying page-specific exceptions. Treat 390 px as the visual reference and verify six representative viewport widths.

**Tech stack:** React 19, TypeScript, Radix Dialog, CSS custom properties, Vitest/Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-full-project-mobile-responsive-a-design.md`

## Task 1: Lock the responsive and dialog contracts

**Files:**
- Modify: `tests/premium-contract.test.mjs`
- Create: `src/dialog/AppDialog.test.tsx`

1. Add behavior tests that exercise real app-dialog confirmation, cancellation, focus return, Escape dismissal and alert acknowledgement.
2. Add responsive contract coverage for 320, 360, 375, 390, 412 and 430 px.
3. Run the focused tests and confirm they fail for the missing implementation.

## Task 2: Add the shared application dialog

**Files:**
- Create: `src/dialog/AppDialog.tsx`
- Create: `src/dialog/app-dialog.css`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

1. Implement `AppDialogProvider` and `useAppDialog` with Promise-based `confirm` and `alert`.
2. Use Radix Dialog for focus trapping, Escape, focus restoration and modal semantics.
3. Support warning, danger and success tones without changing business behavior.
4. Re-run focused tests until green.

## Task 3: Replace browser-native prompts

**Files:**
- Modify: `src/FeaturePages.tsx`

1. Replace all `window.confirm` and `window.alert` paths with `useAppDialog`.
2. Preserve every original message, cancellation branch and side effect.
3. Verify notebook, settings, import, record deletion and payment flows.

## Task 4: Make the shared shell continuously responsive

**Files:**
- Modify: `src/design-tokens.css`
- Modify: `src/styles.css`
- Modify: `src/feature-pages.css`
- Modify: `src/responsive-feature-pages.css`

1. Change the app shell from a fixed 390 px canvas to a fluid 100% width with a 430 px maximum.
2. Add safe-area-aware inline/bottom spacing and fluid type/spacing tokens.
3. Ensure cards, grids, tables, forms and dialog actions wrap or stack before overflow.
4. Keep touch targets at least 44 px and keep bottom navigation clear of content.

## Task 5: Verify all pages and update durable design context

**Files:**
- Modify: `DESIGN.md`
- Modify: `UX-CONTRACT.md`
- Modify/Create: relevant Playwright responsive tests

1. Run TypeScript, unit and production builds.
2. Run page sweeps at 320, 360, 375, 390, 412 and 430 px, checking horizontal overflow, clipped controls, dialog fit and bottom-nav clearance.
3. Record the shared responsive/dialog rules in design and UX contracts.
4. Review the branch diff and prepare a pull request without merging it.
