# Browser and PWA follow-up — 2026-09-14

Continues the browser/cache limits recorded in [resumed verification](2026-09-14-resumed-verification.md). Authoritative base: `a6d9fe233c35a286f6e41d429cfaa9550e768dbf`. Work and scoped CI: [PR #553](https://github.com/spyuilin688-sudo/lottery-matrix/pull/553).

## User-visible change

Navigation handled by the service worker revalidates HTTP-cached HTML with the server, including responses saved under older freshness headers. A new shell still needs valid CSS and JavaScript before it becomes the offline fallback. Failed updates retain a complete working shell. The request, credentials and sensitive-route exclusions are preserved.

This addresses a reproduced stale-HTML mechanism. It does not establish the cause of every previously observed stale production browser tab. It does not clear cookies or local storage, change layout, or alter draw data.

## Browser verification repairs

- Removed the retired `NotesPage` import that prevented the shared runtime fixture from loading; notebook checks use the current notebook fixture.
- Aligned selectors and geometry with the accepted design: shared heading actions, homepage gold frame, integrated 20px condition controls and `Matrix 對照` navigation.
- Equal-width controls tolerate one Chromium layout unit (1/64px); overflow, padding, height and typography assertions remain.
- Retained permission, editing, save/delete, keyboard, drag, momentum, download and responsive-layout assertions.
- Updated stale auxiliary workflow assertions for retired record UI and shared heading actions.

The first repaired browser run passed 43/50 cases and exposed seven remaining obsolete selector/subpixel expectations. Those were corrected before the next run.

The next scoped Chromium run, [34872201582](https://github.com/spyuilin688-sudo/lottery-matrix/actions/runs/34872201582), passed **52/52** at `57b15974511a37eb260429ccc0d1d238169a9a62`: all 50 cases in the six previously failing files plus the two new HTTP-cache cases. This closes the previously recorded 47 browser failures. The separately unchanged three-case Pro plans file was not rerun. The auxiliary notebook workflow subsequently required the Premium test correction described below; final branch CI rechecks that gate.

## Evidence

- PWA HTTP-cache unit regressions failed twice before the worker change, then passed. Explicit Node files `pwa-asset-recovery`, `pwa-build-version` and `confirmed-ui-refinements`: **32 passed**.
- Seven explicitly named LINE/PWA Vitest files: **94 passed**. `scroll-and-textarea-contract.test.ts`: **5 passed**.
- `tests/premium-contract.test.mjs`: **7 passed** after repairing an escaped CSS pattern and replacing a removed module boundary with direct notebook-module inspection. Confirmation checks retain leave/save/delete and active-account ownership safeguards.
- Added a real-browser HTTP-cache negative control using the prior worker, plus current-worker checks for version updates, invalid CSS fallback, offline startup and retained cookie/localStorage values.
- TypeScript and whitespace checks passed. Independent review found no unresolved blocker in the production change or browser contract repairs.
- Remote tree comparison preserved every original blob; only reviewed paths changed. No full-project test command was used.

The 94-test batch explicitly listed `src/push-service-worker.test.ts`, `src/push-subscription.test.ts`, `src/pwa-lifecycle.test.tsx`, `src/pwa-startup-recovery.test.ts`, `src/auth/__tests__/line-pwa-return.test.ts`, `src/auth/__tests__/line-pwa-callback-bootstrap.test.tsx` and `src/auth/__tests__/line-auth-mobile-pwa-popup.test.ts`.

## Verification boundaries

Cookie/localStorage retention is not an end-to-end server authentication test. Physical Android/iOS LINE app handoff, home-screen installation and real push delivery require device testing and are not claimed complete by these automated checks.
