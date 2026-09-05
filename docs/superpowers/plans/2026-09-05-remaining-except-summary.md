# 9/4 scoped continuation

**Authority:** User requested executing the unfinished items on 2026-09-05 except the second item, Tianyan summary maximum-two-row behavior.

**Goal:** Connect Tianyan statistics and filters, deploy the merged LINE logout handler, and repair explicit push re-enablement. Visitor metrics retain the previously approved names and 90-day retention; no missing counting rule is invented.

**Architecture:** Reuse the existing Matrix Explore interaction owner and the existing Tianyan list RPC. Keep Supabase as LINE revoke owner and the existing notification enable action as the only push renewal trigger. Preserve latest main, including the independent ticket CORS repair.

**Constraints:** Do not change summaryRulePairs or summary row limits. No production member/payment test records. Do not automatically enable all saved push endpoints or send unsolicited test notifications. No algorithm, plan, permission-policy or other UI changes.

- [x] Read main fb6955e, existing contracts, PR311 diffs and production state.
- [x] Reproduce missing Tianyan request fields and clickable statistics with failing component tests.
- [x] Apply only the statistics/filter/grouping portion of PR311; preserve the existing four-row summary regression.
- [x] Exercise actual Tianyan SQL in isolated PostgreSQL: exact-pair groups, single-number filter, stable stats, top-18 order, date offsets, empty results, forbidden access and ACL preservation.
- [x] Apply matrix_tianyan_result_parity and align the filename to production version 20260905101136.
- [x] Reproduce disabled-endpoint reuse; renew only during explicit enable; preserve active endpoints and fail without mutation when status cannot be read.
- [x] Deploy already merged LINE handler as production v10; verify active version and source files through Supabase.
- [x] Run targeted component tests, full Vitest, Edge tests, typecheck, production build, strict Premium audit and independent code/SQL review.
- [ ] Finish remote CI and conflict checks; merge and verify production deployment.

## Remaining user-dependent verification

- Real LINE callback/revoke requires an authorized live LINE account. Unit results and deployed v10 are not live-provider verification.
- Actual push delivery requires a fresh subscription from the user's device. Six previously saved endpoints remain disabled; no blanket reactivation is performed.
- Visitor metrics: the original record specifies 本日瀏覽人數 / 本月瀏覽人數 / 總瀏覽人數 and anonymous identifier hashes retained 90 days. It does not specify whether a returning visitor after identifier deletion is counted again in the total. Do not implement a counting policy until clarified.

## Reproducible SQL check

`tests/sql/check-tianyan-parity.mjs` creates an in-memory PostgreSQL database through an independently installed PGlite module. Supply its module path with `PGLITE_MODULE_PATH`; the application dependencies and production database are not used by this check.
