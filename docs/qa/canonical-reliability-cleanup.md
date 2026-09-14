# Canonical reliability cleanup — 2026-09-14

Authoritative source: `spyuilin688-sudo/lottery-matrix/main` at `28fbac6e1d1340f9e47f4ffcdcb446e8e0bb8c18`, fetched before edits. Local source snapshot was verified against GitHub blob hashes. Unchanged remote blobs, including binary assets not present locally, must be preserved when creating the commit. No draw data, analysis formula, migration, account, credential or deployment configuration is changed by this cleanup.

During the final ref check, main advanced to `4d5bc44cb7eaec35dbc54b875fe5faa5d782893d`. All 48 upstream files were fetched and hash-verified. Five overlapping files were merged against the original baseline; upstream draw-card publication gates, first-controller PWA behavior, and retired notebook route/component/test/CSS removal are preserved. This cleanup is committed on top of that newer main, not the original snapshot. Upstream migrations and algorithm changes remain attributable to the preceding commit and are not reapplied here.

## Request coverage

| User item | Implementation / disposition |
|---|---|
| 1. Admin stale responses | Shared `useAdminDataPage` owns page/query/session/revision identity. Root dashboard/options/mutations additionally check view, session, mount and request ownership. Obsolete data, busy, error and confirmation completions are rejected. |
| 2. Dashboard payment short pages | Continue by actual returned rows until exact total or empty page. Smaller server caps do not truncate revenue. |
| 3. Taiwan revenue calendar | Shared `admin-business-time.ts` uses `Asia/Taipei`; today/month/quarter/year, table displays and inclusive date filters share the business timezone. |
| 4. Admin timeout | One 15-second deadline races bearer token, fetch and buffered JSON. Deadline aborts transport and prevents a late token from starting a request. No timeout extension. |
| 5. Actual list pagination | Activation codes, audit/login logs, administrators, payments, transfers, members and subscriptions use backend filter/sort/count/pages. Plans are form options and follow every backend page. No arbitrary first-N dataset replacement. |
| 6. Scoped GitHub CI | Changed-path selector emits explicit runner file paths with a reason for each; empty groups do not run. Invalid comparison fails closed. No blanket unit/edge/admin/Python/Playwright command. Builds and runtime-integrity gates remain. |
| 7. Notification overrides | Final values moved to `feature-page-adjustments.css`; two later patch files removed. Correct 8px gap/29px bulk buttons/600 heading preserved. |
| 8. Result 13px override | Final -26px term and 100% result width in `matrix-explore-spacing.css`; dedicated override deleted. |
| 9. Admin button cascade | General primary, login primary and form-action geometry have explicit owners in `admin.css`; competing later declarations removed. |
| 10. Duplicate responsive import | Retain only the existing import inside Matrix spacing, preserving its final effective cascade position. |
| 11. Membership geometry | Keep the accepted asset composition at its canonical stack owner. Production DOM and screenshot show 418px raster container at 430px canvas with inset artwork rails aligned to 398px cards. No asset bytes changed. |
| 12. Important declarations | PWA 12→2 (only explicit device-emulator cursor policy); admin 0. Transfer/notebook specificity conflicts fixed at their original owners. |
| 13. Fixed inline styles | Removed fixed reference positioning, Tiangong visibility, portal select tokens and textarea resize overrides. Retain measured virtual-scroll, keyboard, gesture and runtime geometry only. |
| 14. Duplicate selectors | Parsed inventory covers every production PWA/admin CSS declaration. Repeated exact rule identities PWA 62→3 complementary owners; admin 22→0. |
| 15. Media conflicts | Removed repeated declarations and stale mobile winners; retained disjoint component/state breakpoints and accessibility media rules. |
| 16. Compensating geometry | Notification list uses natural parent/child gutters. Asset optics, motion, accessible hidden labels and virtualized rows retained with reasons. |
| 17. Size limits | Classified fixed controls, aspect ratios, maximum app canvas and scroll containers; removed superseded size declarations. No blanket removal of necessary geometry. |
| 18. Overflow/cropping | Removed overwritten crop rules; inventory distinguishes rounded borders, sprites, SVG slices, ellipsis, animation and viewport containment. No new clipping used to hide overflow. |
| 19. Specificity | Existing owners exclude semantic variants where needed; no higher-specificity patch layer or new important priority. |
| 20. Duplicate effects | Notification controls, shared buttons, settings, homepage cards and plan layout moved to their existing owners; semantic state/lottery variants retained. |
| 21. Orphan CSS | Four retired override files/imports removed. `homepage-repair.css` remains a live import aggregator. Compatibility route styles are not classified dormant by filename. |
| 22. API caps | Admin and Python complete-history/chunk readers advance by actual count/cursor to empty or reliable total. Caller-selected history windows, explicitly labelled recent feeds and bounded concurrency remain; failures never manufacture a shorter complete dataset. |
| 23. Hidden errors | Invalid history/admin-page payloads reject; recent-history/reference failures expose retry; transfer recovery errors are handled; auth failures preserve explicit failure state. Optional geolocation/cache/telemetry degradation is documented separately from business data. |
| 24. Async ownership | Latest/history refreshes, admin lists/dashboard, notification drafts, member-page reads and auth recovery use generations/member ownership. Detailed deterministic race cases are listed in the async review. |
| 25. Cleanup | Timers/listeners/subscriptions are inventoried. Fixed late update-dialog reload and late admin confirmations; notification account change cancels queues/retries. |
| 26. Legacy runtime | Traced imports, routes, worker/API callers and deployed source. Kept active/compatibility exports; removed only confirmed redundant CSS entrypoints. |

Detailed evidence: [CSS inventory and rationale](css-cleanup.md), [PWA async audit](async-cleanup.md), [CI scope contract](scoped-ci.md), [independent review](independent-review.md).

## Additional complete-read regression evidence

`services/matrix-api/tests/test_capped_reads.py` uses the installed `SyncPostgrestClient` and `httpx.MockTransport`, with server caps below requested limits. It reproduces full and explicit-limit legacy/history reads, date-filtered history and cursor-based artifact chunks. Six cases failed before the production change and passed afterward. Existing repository assertions now include the final empty page; duplicate-history restart and conflict rejection are preserved.

Executed only explicit directly relevant Python paths:

```sh
python -m pytest services/matrix-api/tests/test_analysis_repository.py services/matrix-api/tests/test_capped_reads.py services/matrix-api/tests/test_api_server_http.py -q
```

Result: **59 passed**. No whole-project test command was run. The backend push-status regression separately covers 1,105 members/devices under a 137-row cap and rejects a later-page failure.

## Verification boundaries

Deterministic tests prove the covered request orderings, transport caps, error handling and source-style contracts. They do not prove every native mobile permission, LINE handoff or authenticated live-data scenario. Local browser navigation is unavailable in this environment; production baseline dimensions and post-deployment checks are reported separately. Exact raster alpha pixels were not decoded locally; existing SVG/source geometry and rendered alignment were inspected, and the accepted composition was deliberately preserved.

Final integration evidence includes six explicit admin backend files (**171 passed**), seven explicit admin frontend/API/style files (**57 passed**) and `admin-operations.test.ts` (**6 passed**), the three Python files above (**59 passed**), plus six runtime integrity tests. The independent reviewer executed **94 tests**, including critical cross-account recovery cases. The PWA followup batch passed **134 tests across seven named files**; activation/referral passed **19**, with **4** existing activation cases separately selected. These are overlapping verification batches, not an additive unique-test total.

Known baseline test debt remains visible. Seven unrelated `FeatureActions.test.tsx` cases failed on clean baseline `40c0ee8` as well as current code; they expect a removed version image, former notebook controls or the old download callback arity. Other historical homepage source-contract tests still assert superseded geometry; exact unchanged-source comparisons are listed in `css-cleanup.md`. The new CI selector may select these related files, so this cleanup does **not** claim the entire selected CI run is green. No test is silently skipped or removed to hide those failures.

The concurrent `4d5bc44` commit independently removed the five retired notebook tests and their dormant implementation. That deletion is retained. The original seven-failure evidence describes the initial baseline; it is not the failure count for the merged source.

Merged-source verification: `test_analysis_repository.py`, `test_capped_reads.py`, `test_api_server_http.py` and `test_matrix_card_api.py` passed **79 tests**. The HTTP CORS fixture now creates completed raw analysis, keeps the special ball last and expects only sorted cards for 天天樂, matching the new upstream publication contract. No production publication rule was changed by this fixture repair. The merged PWA lifecycle/referral/redemption files passed **27 tests**, plus **4** activation cases; both the first-controller latch and the unmount guard are retained.
