# Watchdog, Fragment, and shortcut test fixes

**Goal:** Execute the three corrections requested on 2026-09-05.

**Base:** `fb6955e0dd53374f3d8b77351054b97970dbb4ee`.

**Scope:** Restrict the five Watchdog RPCs to service_role; recurse through Fragment children without adding className; retire the identified obsolete shortcut double-click test requirements.

## 1. Watchdog RPC permissions

- [x] Inspect all overloads of the five named public RPCs with `has_function_privilege` for anon, authenticated, and service_role.
- [x] Confirm the existing migration `20260904200211_restrict_matrix_watchdog_rpc_execute.sql` is present on main and applied to the connected production database.
- [x] Confirm all 15 role/function combinations match the requested permissions: anon=false, authenticated=false, service_role=true. No duplicate migration or live lease/recovery mutation is needed.

The existing database test is `supabase/tests/database/matrix_watchdog_rpc_permissions.test.sql`.

## 2. Fragment traversal

- [x] Add a rendered regression covering nested shorthand and keyed Fragments, existing formula tokens, same-period class, text/null children, and absence of extra DOM wrappers.
- [x] Run the regression against the unchanged component and observe its failure specifically on the React invalid-className warning.
- [x] In `src/ExploreValidationSummary.tsx`, check `element.type === Fragment`, recurse through children, and clone with undefined props, as accepted by the installed React typings.
- [x] Run the updated summary tests, affected navigation tests, typecheck, and build.

## 3. Obsolete shortcut test requirements

- [x] Remove `BottomNavigationDoubleTap.test.tsx` and `bottom-navigation-double-click-window.test.tsx`.
- [x] Remove the remaining duplicate double-click assertion from `BottomNavigation.test.tsx`; retain entry visibility and keyboard/assistive click coverage without fixing an accessible label to gesture-specific wording.
- [x] Keep the Node layout assertion about four navigation columns and the positioned settings entry; remove its handler-name and forbidden-long-press/pointer assertions.

**Unresolved product requirement:** The current production component still uses an independent settings gear with double-click activation, and the guide describes it. The current request identifies double-click tests as obsolete but does not specify a replacement activation method or target control. Historical records contain different gestures. This change does not invent a replacement or claim that the production gesture has been updated. Confirmation is required before changing the component and guide together.

## Verification and delivery

- [x] Run targeted Vitest and Node regressions, runtime integrity, TypeScript, and the production build.
- [x] Inspect the final diff and verify current main before creating a GitHub branch and pull request containing only these files.

Validation results: 134 Vitest files / 1,088 tests passed; 41 relevant Node tests passed; production build including TypeScript passed; runtime integrity passed for 27 protected files; Premium strict audit returned zero findings. The existing Vite large-chunk warning remains. The original 384px icon was retrieved for local validation and matched the main blob hash; assets are not part of this changeset. Independent review found no code issues and reran the changed component and Node tests successfully. Live mobile/browser QA was not performed.

Delivery must report the GitHub PR state and the unresolved shortcut activation requirement, without claiming that the production gesture has changed.
