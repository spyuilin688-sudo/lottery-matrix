# Storage cleanup — 2026-09-21

Scope: the five user-requested storage/index/old Railway service items. Baseline main 28aebc12 (PR710 notification UI and PR711 activation instructions preserved). Changes add SQL migrations/tests only; no algorithms, frontend or schedules change.

## Result item normalization

Explore and Tianheng store 14/16 item properties twice, as typed query columns and item JSON. The new internal mask removes only keys present and JSON-equal to the typed value. Item-only/custom fields, absent keys, nulls and different JSON types survive. Readers rebuild the same public JSON. Owned writes and completed-result restoration atomically replace the residual and mask. A bounded private backfill supports mixed old/new rows and does not invalidate completed work when only representation changes. Real result changes still invalidate it.

Bounded samples across all four lotteries: Explore 2,000 rows averages ~525–529 bytes/item before vs ~75 bytes after including a 4-byte mask; Tianheng 1,064 rows ~593–597 vs ~75. These are sampled payload reductions (~85–87%), not whole-table disk savings. Every packed write asserts exact reconstruction equality.

The first composite-row read implementation caused ~4x synthetic read CPU latency and was rejected. The final canonical path constructs JSON inline with request overrides. PGlite 1,000-row warm list measurements were typically ~22–27ms legacy and ~31–34ms normalized. Full payload equality holds. This is explicitly a small CPU-for-storage tradeoff, not a claim of faster reads; filesystem/TOAST production effects are not represented by this in-memory benchmark. Reproduce with `node tests/result-item-dedup.bench.mjs`.

Allocated table sizes before rollout: Explore 602,996,736 bytes; Tianheng 270,188,544. UPDATE/backfill can initially grow allocation even while live payload shrinks; freed pages are reusable after vacuum. No VACUUM FULL or table rewrite is scheduled, and immediate billed-disk reduction is not promised.

## Validation retained

Validation is the user's expandable calculation proof, including source/reference numbers and historical rule validation. Samples: Explore 1,462 rows /1,461 distinct validation bodies after removing itemId; Tianheng 1,500/1,500. Thus whole-body deduplication gives little benefit. No validation detail is removed or truncated. Finer shared-source normalization needs its own lossless read contract and measured benefit.

## Artifacts and chunks retained

Fresh artifact aggregation: Explore 25 manifests/3,900 payload bytes; Tianheng 25/3,900; Tianshu 10/1,560. These are pointers to chunks, not another full result copy. Actual artifact payload is mainly Tiangong 17,506,283 bytes, status 6,977,842 and Tianyan 1,778,749.

Chunks are compressed calculation checkpoints used for resume, downstream hydration and completed-result restoration. Deleting them breaks existing recovery. Existing retention remains responsible for expiry; no extra cleanup schedule is introduced.

## Index disposition

Fresh inventory remains 48 zero-scan public indexes: 22 primary/unique plus 26 nonunique, rather than the original 33. The complete per-index classifications in [the previous audit](2026-09-20-storage-index-audit.md) were rechecked; all names still match. Preserve integrity/idempotency indexes, FK support, expiry cleanup and low-frequency administrative query support.

Only two changes from that classification:

- `matrix_explore_results_prediction_numbers_idx`: retire, 2,686,976 bytes.
- `matrix_tianheng_results_prediction_numbers_idx`: retire, 942,080 bytes.

Both are nonunique GINs. Fresh EXPLAIN of the current materialized-base number-filter query structure uses each table's list index and filters prediction numbers in the CTE scan. Current direct PostgREST workloads select item_id by lottery/period/version (982 calls each, plus 104 ordered variants), not GIN predicates. Both GIN scan counts remain zero. This combines query structure, plans, consumers and counters; zero alone is not the reason.

The migration rechecks exact index definitions and zero scans, then drops only these two with a 2-second lock timeout and transaction rollback on drift/contention. Recreate CONCURRENTLY DDL is included. Saved allocation is 3,629,056 bytes (3.46 MiB), not hundreds of MB. Tianshu GIN remains a low-priority candidate. Explore/Tianheng expiry indexes each show a scan and support the hourly minute-17 retention job, so remain.

## Railway old services

All three have no attached volumes/domains and no production dependencies:

- impartial-wholeness / lottery-matrix: asleep, disabled watch pattern, no cron; deletion staged.
- divine-simplicity / fantasy5-crawler-verify: old verification branch, pytest-only start, restart NEVER, no cron; deletion staged.
- lucky-reflection / affectionate-analysis: no source/deployment/resources; deletion staged.

**Not deleted yet.** Railway refuses API apply: staged deletions require two-factor verification in its dashboard. No alternate API is used to bypass that control. Existing production services remain present.

## Validation and rollout evidence

Named related tests: `node --test tests/result-item-dedup.test.mjs tests/worker-completion-cache.test.mjs` — 18/18 passed. Tests execute captured live reader/writer/restore/invalidation definitions against realistic typed PGlite tables, check roundtrip, mixed rows, ownership, restore-generation fencing, completion invalidation, privilege boundaries, concurrent predecessor drift and index definition drift. No full suite.

## Applied outcome

Applied migrations `20260921003028_result_item_dedup` and `20260921003045_retire_unused_result_prediction_indexes`; repository filenames match recorded production history.

All 190,726 existing rows converted: Explore 135,294 and Tianheng 55,432. Zero legacy-mask rows remain. Exact measured item payload, including all 4-byte row masks:

- Explore: 71,320,452 -> 9,786,242 bytes; reduced 61,534,210 bytes (58.68 MiB, 86.28%).
- Tianheng: 32,987,460 -> 4,008,672 bytes; reduced 28,978,788 bytes (27.64 MiB, 87.85%).
- Combined reduction: 90,512,998 bytes (86.32 MiB).

The trigger asserted reconstruction equality for every converted row. Independent before/after hashes for 96 sampled rows across all four lotteries in both tables matched item JSON and every other field (including full validation, expiry and creation time). Existing counts stayed identical. After the first two canary batches, each bounded batch used a repeatable-read transaction and asserted that its completion-marker snapshot stayed identical; all passed. The canaries left their affected lottery's generation unchanged. An unrelated pre-existing Fantasy5 generation changed between wall-clock snapshots; no assertion about global background inactivity is made.

Final readback confirms the two prediction GINs are absent and both expiry indexes remain. Allocated relation snapshots after backfill were Explore 432,357,376 and Tianheng 267,337,728 bytes, versus 602,996,736 and 270,188,544 before. Physical allocation is also influenced by ordinary cleanup/vacuum and is not attributed one-for-one to item normalization. No VACUUM FULL was used.

Independent final reviewer found no material or minor findings and freshly passed all 18 named tests. After aligning migration filenames, the same 18 tests passed again. Initial PR CI passed; final commit CI and merge recorded in GitHub PR712.

Operational decisions: accept measured JSON reconstruction overhead for lossless duplicate-storage reduction; keep complete validation and recovery chunks; use only the established owned-write/restoration RPCs for future result mutations (a privileged raw typed-column edit must deliberately rebuild the public item/mask); respect Railway's required dashboard two-factor verification. All three old Railway services remain staged, not deleted.
