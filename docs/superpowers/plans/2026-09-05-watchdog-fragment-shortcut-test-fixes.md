# Watchdog, Fragment, and shortcut test fixes

**Goal:** Execute the three corrections requested on 2026-09-05.

**Base:** `fb6955e0dd53374f3d8b77351054b97970dbb4ee`.

**Scope:** Restrict the five Watchdog RPCs to service_role; recurse through Fragment children without adding className; consolidate shortcut double-click coverage according to the user's confirmed specification.

**User clarification:** 「跟自訂觸發條件一樣是雙擊開啟」 (2026-09-05). Double-click activation is the current shortcut-settings specification; the earlier classification of that behavior as obsolete is superseded.

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

## 3. Confirmed shortcut double-click requirements

- [x] Consolidate the overlapping `BottomNavigationDoubleTap.test.tsx` and `bottom-navigation-double-click-window.test.tsx` coverage into `BottomNavigation.test.tsx`, then remove the duplicate files.
- [x] Verify single pointer clicks do not open settings, paired clicks open exactly once without activating the primary shortcut, and a third click starts a new pair. Preserve the existing 500/799ms accepted cases and 800ms expiry case; these characterize the existing shared handler rather than introduce a new product condition.
- [x] Retain entry visibility and keyboard/assistive click coverage.
- [x] Keep the Node layout assertion about four navigation columns and the positioned settings entry; remove its handler-name and forbidden-long-press/pointer assertions.

**Resolved product requirement:** The shortcut settings gear and custom trigger settings already share `useDoubleClickAction` and `QUICK_SETTINGS_DOUBLE_TAP_MS`. Their production behavior and guide agree with the user's clarification, so no gesture implementation change is needed. Record the confirmed rule in `UX-CONTRACT.md` and verify both owning components.

## Verification and delivery

- [x] Run targeted Vitest and Node regressions, runtime integrity, TypeScript, and the production build.
- [x] Inspect the final diff and verify current main before creating a GitHub branch and pull request containing only these files.

Validation results: 134 Vitest files / 1,088 tests passed; 41 relevant Node tests passed; production build including TypeScript passed; runtime integrity passed for 27 protected files; Premium strict audit returned zero findings. The existing Vite large-chunk warning remains. The original 384px icon was retrieved for local validation and matched the main blob hash; assets are not part of this changeset. Independent review found no code issues and reran the changed component and Node tests successfully. Live mobile/browser QA was not performed.

Validation after the user's clarification: all 134 Vitest files / 1,091 tests passed; the shortcut, custom-trigger and Fragment component subset passed 28 tests; the relevant Node contract subset passed 15 tests; TypeScript passed. The previous PR revision also completed all five GitHub Project CI jobs successfully. Delivery must report the current GitHub PR state and preserve the confirmed double-click rule.
