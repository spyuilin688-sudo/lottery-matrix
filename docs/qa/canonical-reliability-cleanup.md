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

## Production release and scoped CI follow-up

Source release `27060458bbdbc146cbcff41bd3a003dd6f5a66e7` was pushed without force on top of `4d5bc44`. The entire resulting Git tree was checked against intended blobs, including unchanged binary assets. Cloudflare Pages deployment `6beab894-4a2e-4d1d-a383-fe1bfd706217` succeeded. The production domain, after fresh navigation, served the same `index-YSgZN6rF.js` / `index-D80OEcgO.css` as the verified build. `/admin/` served `index-MrWfA_6O.js` / `index-DK5XfN-7.css` and rendered the login form with the formal `loginPrimary` variant, 348px wide and 12px 16px padding at the inspected viewport.

Supabase `admin-api` version **20** is active; all 27 deployed source files exactly matched the intended payload. Its existing custom authentication setting (`verify_jwt: false`) was retained. No account or data mutation was used for verification.

All three Railway production services reached **SUCCESS** on source release `2706045`:

| Service | Deployment | Runtime evidence |
|---|---|---|
| API / heartfelt-generosity | `753d8310-6d91-4791-9707-09d33748c2b6` | Latest, history and history-years requests returned 200; public Matrix Explore loaded four result rows. |
| lottery-matrix worker | `fd5b02c5-a51e-41c7-951e-2fa53cc73c3c` | 今彩539,六合彩,大樂透 completed. |
| fantasy5-analysis | `971c5e0a-6884-4457-b500-58c6d84ff25c` | 天天樂 11999 reported already-analyzed. |

Read-only browser measurements on the deployed app used a 1363px viewport and 430px application canvas. Notification list width was 398px with 8px gap, bulk buttons were 193×29px, and title weight was 600. The membership stack remained 418px wide and 243.59375px high with unchanged SVG slices; the visible card rails remain aligned to 398px cards. The Matrix result panel was 404px wide at x=479.5 within a canvas starting at x=466.5: exactly 13px on each side, with no horizontal overflow. These observations cover the inspected browser size, not every native-device configuration or authenticated administrative operation.

The first scoped CI run `34859070226` passed scope selection, runtime integrity/build and admin checks. Its root Vitest selection reported **1076 passed / 57 failed**; its Python selection reported **568 passed / 14 failed**. These were explicit related file lists emitted by the selector, not blanket test commands. The release is not represented as a fully green regression run.

Four Python failures came from a stale write-fencing transport fixture repeating chunk zero after `chunk_index=gt.0`. The fixture now respects the cursor and asserts the final empty page before restore. No production guard was weakened. Explicit `test_analysis_write_fencing.py` plus `test_capped_reads.py` then passed **67 tests**. All ten other Python failures were independently reproduced on a hash-verified reconstruction of parent `4d5bc44`, using only their exact named cases; their seven test files are byte-identical to the current files. Three directly relevant async test files likewise produced the same **11 passed / 10 failed** on both parent and release; details are recorded in `async-cleanup.md`.

The remaining thirteen failing root test files were independently run on the same parent reconstruction: **196 passed / 46 failed**. Their distinct failed file/case names exactly match CI; three identically named parameterized Tianheng cases explain the deduplicated name count. `QuickHistorySettings.test.tsx` was migrated from an already obsolete inline-offset assertion to the canonical shared sticky header, retained settings DOM and token geometry; its explicit one-case run passes. The broader stale UI/algorithm test expectations remain visible.

The seven explicitly selected runtime browser files finished with **6 passed / 47 failed**; the subsequent membership-preview step was skipped by GitHub after that failure. Logs identify missing retired fixture CSS imports, obsolete controls/fixture selectors, and geometry expectations such as 28px hit buttons where the accepted CSS renders 20px. These browser failures were not all independently reproduced on the parent, and this report does not claim complete responsive or authenticated end-to-end coverage. Direct consumers of this cleanup's retired CSS files are corrected in the follow-up test fixtures; no production override file is restored to satisfy them.

A still-open baseline browser tab retained `index-BQddmwOO.js` / `index-BJ4YZlaZ.css`. It measured the same 9px homepage logo top gap and 20px Explore hit-button height as the release, against runtime tests expecting 8px and 28px. At the inspected 430px canvas, both baseline and release buttons had padding 2px 4px and widths 133.59375/133.609375px. This establishes the preserved geometry at that size without changing production CSS to satisfy stale assertions.
