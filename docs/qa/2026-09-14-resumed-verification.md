# Resumed reliability verification — 2026-09-14

This follow-up repairs stale tests left in the scoped CI evidence of [the canonical reliability cleanup](canonical-reliability-cleanup.md). It changes 23 test files and this report only. It does not modify production behavior, CSS, historical draw data, algorithm rules, migrations, credentials or deployment configuration.

## Source and conflict handling

- Started from authoritative main `e913bbe7c223b9493105260431a8aa0f8722c025`.
- Before integration, fetched main `d7ca33a42c705d4c9676518a487534e4aa4a5118` and synchronized its nine changed files. There were no overlapping test paths.
- Preserved the concurrent homepage gold frames/2px gaps, retired eighty-period Tian工 work change, and Matrix Storage pending-cleanup health fix.
- Remote integration uses the latest complete Git tree as its base and replaces only reviewed files. Unchanged binaries remain intact.

## Repairs

| Area | Test contract restored |
| --- | --- |
| Frontend controls | Current lottery tabs, page-specific settings headings, shared text headers and four-page text switcher. Permission, request parameters, stale-response rejection and submitted-result stability remain asserted. |
| Data fixtures | Current history `items/nextCursor/pageSize` and Tongxing `groups` envelopes. The ten-draw request test uses the real frontend API implementation. |
| Refresh and downloads | Accepted one-hour refresh cadence, including no update at one minute. Ticket ownership callback becomes false after changing the selected card. |
| Membership and homepage | Subscription artwork visibility boundaries, current semantic headings, accepted Core aspect ratio and owned gold frame rules. No production CSS added. |
| Python transport and RPC | POST RPC parameters, authorization/profile headers, bounded timeouts, summary/latest responses and worker v14 expectation. |
| Synthetic history and retention | Consistent dates for overlapping fake periods, confirmed status, canonical alias behavior, and protection of live results against a future cleanup cutoff. |

## Fresh verification

Before editing, the selected frontend files reproduced **56 failures** and the recorded Python cases reproduced **10 failures**. After synchronizing main, all **264 frontend tests across 16 named files** and **93 Python tests across seven named files** passed, with no skips.

The frontend batch explicitly listed:
```text
src/__tests__/FeatureActions.test.tsx
src/__tests__/FeaturePageStartup.test.tsx
src/__tests__/MatrixExploreGuest.test.tsx
src/__tests__/MatrixExplorePage.test.tsx
src/__tests__/MatrixPageSwitcher.test.tsx
src/__tests__/MatrixTiangongLayoutCards.test.tsx
src/__tests__/MatrixTiangongPage.test.tsx
src/__tests__/MatrixTianhengPage.test.tsx
src/__tests__/MatrixTianyanPage.test.tsx
src/__tests__/MemberProfilePage.test.tsx
src/__tests__/app-production-shell.test.tsx
src/__tests__/homepage-home-controls-style.test.ts
src/__tests__/homepage-lottery-switcher-style.test.ts
src/__tests__/lottery-two-stage-ui.test.tsx
src/__tests__/lottery-two-stage.test.tsx
src/__tests__/query-latest-response.test.tsx
```

The Python batch explicitly listed:
```text
services/matrix-api/tests/test_api_supabase_transport.py
services/matrix-api/tests/test_explore_v12_cutover.py
services/matrix-api/tests/test_history_backfill.py
services/matrix-api/tests/test_history_years.py
services/matrix-api/tests/test_public_api.py
services/matrix-api/tests/test_public_history_aliases.py
services/matrix-api/tests/test_tianheng_pipeline.py
```

TypeScript `tsc --noEmit` and `git diff --check` passed. Type checking caught an unsupported Testing Library `exact` option; the startup selector now uses an anchored accessible-name regex. That one explicitly named test passed again after this final correction.

An independent read-only reviewer approved the diff with no unresolved findings and executed `node --test supabase/tests/matrix-draw-query.test.mjs`: **12 passed**, zero skipped. This executes the migration in isolated PGlite and checks aliases, NULL-date ordering, year summaries, Tongxing ordering/offsets, conflict handling and privileges. It does not establish live Supabase state.

The changed-path CI selector selects exactly the 16 frontend and seven Python files above, with no browser, membership, edge or admin test runner selected. Existing production/admin build gates remain. No full-project test command was run.

## Remaining verification limits

This follow-up is not a claim that every historical CI failure or all 26 original requirements have been independently executed. The earlier browser run's 47 failures and skipped membership-preview step are not rerun or closed by these unit/API repairs. Physical Android/iOS LINE login, installation and push behavior remain unverified here.

A prior open browser's root URL retained older asset names while direct server responses and the release-query URL returned newer resources. This observation does not establish the cause or a cache fix. No speculative service-worker change was made.

Some style checks intentionally assert owned declarations and DOM semantics; they do not replace real-browser layout verification. The Matrix switcher's selected-background CSSOM differs between the Vitest harness and standalone jsdom, so that test verifies the owned declaration, matching selector, selected font weight and accessible current-page state.

