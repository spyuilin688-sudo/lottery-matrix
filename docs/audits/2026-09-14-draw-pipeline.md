# Draw pipeline audit — user items 11–21

Baseline: GitHub main `28fbac6e1d1340f9e47f4ffcdcb446e8e0bb8c18`. Audit date: 2026-09-14. This report distinguishes local fixes from live observations. No lottery rows, dates, historical results, notification deliveries, or production computations were changed or replayed by this audit worker. Code deployment remains with the coordinating worker. After independent review, the coordinating worker explicitly authorized this audit worker to apply the exact raw-card publication DDL; that application and its read-only checks are recorded below.

Machine-readable read-only evidence: `2026-09-14-draw-pipeline-evidence.json`.

## 11. Four latest APIs

Production route: `GET /api/matrix/latest/{URL-encoded Chinese lottery name}`. The Chinese names are 今彩539、天天樂、大樂透、六合彩; the short game codes are not accepted on this route.

The live `matrix_draw_query(p_lottery, p_kind := 'latest')` RPC, which the production handler directly uses, returned one current row and a nonempty revision for each game. All four latest rows have `result_status=confirmed` and `numbers=sorted_numbers`.

| Game | Period | Stored Taipei date | Sorted main numbers | Actual main order | Bonus |
| --- | --- | --- | --- | --- | --- |
| 今彩539 | 115000223 | 2026-09-14 | 01 15 32 34 39 | 39 15 01 32 34 | — |
| 天天樂 | 11999 | 2026-09-14 | 01 02 12 34 36 | null, intentionally unavailable | — |
| 大樂透 | 115000087 | 2026-09-11 | 12 15 19 27 43 48 | 12 15 27 19 43 48 | 25 |
|六合彩 | 026099 | 2026-09-12 | 09 18 24 33 40 47 | 09 24 33 47 18 40 | 11 |

The API normalizer preserves `period/issue`, `drawDate/date`, `numbers/sortedNumbers`, actual order and status, and adds `nextDrawAt`. The coordinating worker viewed all four matching latest result cards in the production PWA. Its direct API-tab navigation was blocked with `ERR_BLOCKED_BY_CLIENT`; therefore this is live RPC plus live UI and local route-contract evidence, not a claim that all direct HTTP JSON endpoints were independently captured.

## 12. Cards APIs and data integrity

Production PNG route: `GET /api/matrix/cards/{lottery}?format=png`. Legacy manifest: the same route without `format=png`; legacy image route ends in `/sorted.svg` or `/draw.svg`.

Live publication rows matched the latest periods above. 今彩539、大樂透、六合彩 each stored `sorted` and `draw`; 天天樂 stored only `sorted`. All four publication `last_error` fields were null. The coordinating worker confirmed that each of the four visible production PNGs decoded to 2276×3438. SHA-256 of every live stored PNG was not independently downloaded and compared in this environment.

Local checks cover immutable URL paths, per-order input digests, SHA metadata, MIME type, dimensions, current-period/snapshot matching, supported orders, upload retry, lease exclusion and stale snapshot hiding. The real `resvg-py==0.5.0` renderer produced deterministic supported PNGs at the required dimensions.

Fixed: the legacy SVG manifest previously advertised `draw` even for 天天樂 and before raw analysis readiness. Both PNG and legacy SVG readers now use the same publication readiness rule. A direct unready raw SVG request returns the existing controlled unavailable-card error instead of generating an unready image.

## 13. Period, date, sorted order, raw order and bonus verification

The [CTBC lottery result page](https://lotto.ctbcbank.com/result_all.htm), reached from the official Taiwan Lottery ecosystem, matched every latest 今彩539 and 大樂透 field in the table, including actual draw order and bonus. The [California Lottery Fantasy 5 page](https://www.calottery.com/en/draw-games/fantasy-5) matched period 11999 and the five numbers; its California draw date is 2026-09-13, corresponding to the application's explicitly implemented next-day Taipei date 2026-09-14.

The [HKJC results page](https://bet.hkjc.com/ch/marksix/results) was reached but exposed only its JavaScript shell to this audit. HKJC search metadata identified 26/099 and 12/09/2026. Latest Mark Six sorted numbers and bonus were corroborated by contemporaneous reporting, but its actual order remains unverified against an independently captured primary-source response. The current scraper uses SC888/NFD for Mark Six; this audit did not relabel those as the operator's primary API.

This was not a full historical source-by-source verification. The read-only full-table inventory found:

| Game | Rows | Missing dates | Null raw order | Different numbers/sorted_numbers |
| --- | ---: | ---: | ---: | ---: |
| 今彩539 | 7012 | 0 | 0 | 0 |
|六合彩 | 6066 | 1480 | 1383 | 0 |
| 大樂透 | 2899 | 0 | 0 | 0 |
| 天天樂 | 11919 | 0 | 11903 | 0 |

Mark Six's documented raw algorithm boundary is 1991; earlier raw gaps must not be replaced with sorted numbers. Missing dates were not filled. Sixteen legacy Fantasy5 rows contain nonnull raw data, but the current Fantasy5 compute/card paths explicitly exclude raw mode; no legacy rows were edited.

There were 1464 repeated lottery/date groups. Of these, 1045 今彩539 and 418 大樂透 groups were exact payload-equivalent eight/nine-digit ROC period aliases. They remain stored. One Mark Six date conflict remains: periods `093053` and `093054` both have date `1993-07-13` but different numbers. Resolving that requires historical primary-source evidence and an authorized data repair, neither performed here.

Fixed a read-path defect: sorted worker history previously passed both equivalent aliases to algorithms. It now uses the same existing strict canonicalization/conflict check as raw history. Equal aliases occur once; conflicting payloads raise `DRAW_HISTORY_CONFLICT`. Historical replay retains its original stored target-period key, including eight-digit identities. No algorithm-version bump or forced recomputation was made; already persisted completed outputs were not numerically regenerated or revalidated by this change.

## 14. Two-phase acquisition and finalization

The existing fast-result SQL path validates date and sorted numbers, stages the preliminary row, estimates its period from the preceding formal result, then enqueues the result event. `matrix_upsert_draws` later reconciles the formal period while retaining row identity and rebasing subsequent preliminary estimates transactionally. Existing SQL regression cases cover upward/downward correction, older formal arrival, collision rollback and retry safety.

Fixed: Taiwan result parsing previously discarded a complete date/sorted result when actual order was missing, empty, partial or inconsistent. It now keeps the valid sorted result as preliminary with null actual order. Mark Six SC888 parsing now similarly accepts sorted-only rows. HTML parsing preserves empty cells, preventing the still-empty actual-order column from shifting the sorted column out of its header position. Invalid sorted-number payloads remain rejected.

Preliminary rows continue through sorted analysis and sorted-card publication while the scheduled/recovery paths seek complete formal raw data. The raw-stage guard continues rejecting preliminary data and never substitutes sorted numbers for raw numbers. Formal period reconciliation is verified locally; no artificial production reconciliation was submitted.

## 15. Crawler/database duplicate writes

Live `matrix_upsert_draws` acquires an advisory lock per lottery, finds the existing period/date identity, and compares the complete persisted tuple before issuing `UPDATE`. An identical source snapshot returns the existing row without a physical write or repeated realtime invalidation. Changed source metadata persists once as intended. The scheduled formal workers skip a fresh confirmed expected-date draw; Fantasy5 has its separate same-day/recent-gap preflight.

The local PostgreSQL regression now explicitly covers all four games and confirms zero physical update-trigger invocations for repeated identical batches. Existing provisional/formal/correction tests also pass. Live inventory: zero duplicate `(lottery, period)` groups. This does not imply zero polling requests: preflight reads and readiness/lease checks remain intentional.

## 16. Duplicate computations

Current workers use separate `<period>:matrix-python-v14-sorted` and `...-draw` keys, completed-run/artifact checks and owned leases. Sorted completion survives unchanged raw arrival; raw correction invalidates the dependent raw stage. The algorithm worker's separate audit covers completion fencing and builder work reuse in depth.

Local worker/resume tests verify already-completed stages, live-lease exclusion, supersession, archive correction and Fantasy5's sorted-only backlog progression. The alias normalization above fixes duplicated historical inputs for future computations. No production historical or current computations were triggered as a test.

## 17. Card duplicate generation

The publication lease serializes render/upload work. Each order has its own input digest, enabling a raw-only render after raw arrival while retaining the unchanged sorted PNG. Repeated unchanged snapshots do not rasterize or upload again. Corrections invalidate only the affected inputs; lease/snapshot fences prevent stale publication. The changed code preserves these properties under the new raw-analysis completion gate, including the case where raw readiness changes but the draw snapshot digest does not.

## 18. Notification duplicate delivery

Within an invocation, event keys suppress repeated successful emission; failed deliveries remain retryable. Persistent storage enforces unique `event_key` and an independent unique lottery/date identity for result events, so an estimated-to-formal period correction cannot create a second result event for the same game/date. Live read-only inventory found zero duplicate event-key groups and zero duplicate result lottery/date groups.

No actual messages were sent to validate delivery. These checks establish enqueue/idempotency behavior and local retries, not successful arrival on a user's device. Earlier result-attempt placement adds one bounded retry opportunity under persistent transport failure; focused tests explicitly record that behavior.

## 19. Immediate date/sorted result notification

Fixed: the scheduled worker stored a new draw and then waited for history repair and PNG work before attempting its result notification. It now attempts the result event immediately after storage, before archive repair/rasterization/analysis. An archive failure no longer prevents that first result attempt.

Fixed the equivalent Fantasy5 ordering: the analysis-only worker now attempts the latest result event before rendering its sorted card or querying computation progress. Its ordinary card-ready attempt remains after rendering. The fast-result SQL path already stages the row and enqueues/fans out within the same transaction. Live delivery latency was not measured by sending test notifications.

## 20. Raw acquisition → raw computation → raw card → corresponding notification

Confirmed pre-fix production evidence: the latest 539 card publication timestamp was `2026-09-14 14:03:17.363718+00`; its raw analysis completed at `14:05:41.699155+00`. Existing tests explicitly allowed raw-card notification before analysis completion. That ordering conflicted with the current user checklist.

Fixed in Python: raw PNG generation, PNG manifest reads, legacy SVG generation/manifest reads and raw-card notification require the matching current raw analysis run to be complete. The worker publishes again immediately after that raw stage completes, then attempts the card notification. Sorted results and cards remain available independently.

New migration `20260914143243_raw_card_requires_completed_analysis.sql` applies the same database publication fence: current lottery/period, exact `matrix-python-v14-draw` version, complete status and nonnull completion timestamp. It preserves the existing source, immutable metadata, latest-period, digest and lease checks. This version-specific fence must be updated deliberately alongside a future analysis-version change. The migration was compiled and behavior-tested in local PostgreSQL/PGlite, then applied live with explicit coordinating-worker authorization as version `20260914143243`. Catalog checks confirmed both fences and service-role-only execution. Before/after observations were identical: 27,896 draw rows, 124 notification events, four publications, unchanged latest draw/event update timestamps, and publication-manifest digest `e5ffed752eb008ac1ac2546d7aeb5b5f`. Existing three raw manifests each have a matching completed raw analysis; Fantasy5 remains sorted-only. No publication or computation RPC was invoked for validation.

## 21. Fantasy5 does not wait for, compute, or publish raw mode

Fantasy5 source normalization yields sorted values and null raw values; its worker uses only sorted analysis. Domain raw scheduling is rejected; raw PNG generation is unavailable. The new readiness helper returns before any raw-progress lookup for Fantasy5. The legacy API raw-link leak was closed, and direct legacy raw rendering now reports controlled unavailability. Fantasy5 result notification precedes sorted-card rendering and its sorted-card notification remains independent of raw analysis. Focused source, split-worker, card and notification tests pass.

## Verification and remaining limits

All commands specified exact affected files, complying with `AGENTS.md`. No full-project suite ran. A task-local virtualenv reused cached pytest 9.1.1, httpx 0.28.1, PostgREST/storage3 2.31.0 and the cached real resvg-py 0.5.0 renderer. No production package or lockfile changed.

- Final focused Python selection: **252 passed**, exit 0, 17.46 seconds. Files: `test_draw_pipeline_ordering.py`, `test_scraping_sources.py`, `test_scraping_history.py`, `test_card_publication.py`, `test_card_two_stage.py`, `test_card_order_dedup.py`, `test_two_stage_analysis.py`, `test_worker.py`, `test_worker_notifications.py`, `test_analysis_worker_notifications.py`, `test_notification_draw_dates_and_readiness.py`, `test_matrix_card_api.py`, `test_card_repository.py`, `test_fantasy5_official_only_source.py`, `test_fantasy5_card_notifications.py`, `test_fantasy5_worker_split.py`, `test_scheduled_worker_resume.py` (all under `services/matrix-api/tests/`).
- `node --test supabase/tests/raw-card-analysis-gate.test.mjs tests/two-stage-result-ingestion.test.mjs`: **19 passed**, exit 0. Includes real PostgreSQL function execution and all-four-game no-op-write verification.
- New defect regressions were observed failing before their fixes: missing/partial raw source rows, result-before-repair/render timing, premature raw generation/notification, legacy raw route exposure and duplicate alias inputs. Existing tests encoding the superseded raw-notification ordering were updated to the user's current sequence.
- Independent review was performed by the coordinating worker's review agent, including the final alias target-period edge and Fantasy5 early attempt.

Remaining unverified or unresolved: direct production HTTP JSON capture blocked by the client; complete live PNG checksum comparison; Mark Six raw latest primary-source capture; the historical missing dates/raw data and conflicting 1993 date; full historical source verification; actual push-device receipt/latency; and numerical regeneration of persisted completed analyses. These are not represented as passing by the local fixes.
