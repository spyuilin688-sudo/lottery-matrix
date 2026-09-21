# Validation shared-storage feasibility gate

Baseline: `c770858f716c120afe272ffe3c23680d778b9bdd` (main, PR716).

Decision: **do not deploy the tested representations**. User authorized lossless storage optimization only if it actually saves storage. These prototypes fail that gate. No production code, migration, schema, data, schedule, or frontend was changed. This branch contains isolated experiments and evidence only; it is not a deployable optimization.

## Contract and compatibility inventory

Keep every rule, historical validation step, source number, order, JSON type, missing/null distinction and unknown field. Intern exact original snapshot content, never substitute current draw-table contents. Existing full validation API JSON must remain identical.

The three direct readers are `private.matrix_explore_validation_impl`, `private.matrix_tianheng_validation_impl`, and the Explore branch of `public.matrix_status_validation_source_get` (latest reader definitions in `20260912164938_matrix_order_analysis_reads.sql`). Python result-table reads select only item IDs/counts. Python writes/restoration still supply full validation data; artifacts/chunks remain intact.

Any future implementation must update both owned-write and restoration conflict-update metadata atomically. Completion invalidation must distinguish proven representation-only conversion from actual content changes. Shared snapshot lifetimes, access controls and concurrency must be implemented before production adoption. None of those production changes is included here.

## Experiment

Read-only production sample: 250 rows per lottery per result kind, 2,000 total. Four lotteries, Explore and Tianheng; six observed lottery/draw/version scopes. Sample SHA256: `2f3bcfbb0a528fc71661c31ab4f1a0f6148c7d0221d47dda4be1f9d67c04a318`. Raw sampled result bodies are temporary test input, not committed.

The first path-bearing reference representation increased allocation from 737,280 to 1,736,704 bytes on 400 rows. A compact alternative uses fixed source/reference reference slots per object, with zero for inline/missing snapshots. It preserves scope isolation and exact dictionary-body equality. Each stored compact payload is independently decoded and compared with its complete source JSON. Reference paths are not used by compact decoding.

Minimum-use thresholds 1, 2, 4, 8 and 16 are experimental storage candidates, not new product or algorithm conditions. They are computed from the complete sample before encoding and are not a production online-write design.

Local engine: repository-pinned PGlite 0.3.14. Both baseline and candidates have identical synthetic result primary keys. Dictionary primary and scope indexes are included. Baseline allocation: **3,457,024 bytes**.

| Minimum uses | Result + dictionary bytes | Allocation change |
|---|---:|---:|
| 1 | 4,620,288 | +33.65% |
| 2 | 3,825,664 | +10.66% |
| 4 | 3,555,328 | +2.84% |
| 8 | 3,555,328 | +2.84% |
| 16 | 3,579,904 | +3.55% |

See `2026-09-21-validation-snapshot-benchmark.json` for raw aggregate output. Logical validation payload baseline was 2,941,651 bytes. At threshold 4, result + dictionary payload was 2,917,517 bytes (0.82% smaller), but row/index allocation erased that saving. Text-level duplication alone is not a storage-saving estimate.

## Limitations

This is a bounded feasibility result, not a claim that every shared-storage approach must fail. Samples are ordered, not random, and do not contain all rows of each analysis run. Larger populations may amortize dictionaries differently. Scoping prevents cross-run sharing. Synthetic validation-only tables omit the full production row shape/TOAST threshold. Production compression configuration and RPC latency have not been benchmarked. Additional hash/uniqueness indexes, foreign keys, reference integrity and scope mappings required by production are not all represented and can add cost. No fee or full-database savings are inferred.

## Reproduction

Obtain authorized read-only input with the SQL below; save the `sample` JSON array to a temporary file. Data may change, so future aggregates need not match this snapshot.

```sql
with lotteries(lottery) as (
  values ('今彩539'),('天天樂'),('大樂透'),('六合彩')
), s as (
  select 'explore' kind,r.* from lotteries l cross join lateral (
    select lottery,draw_period,analysis_version,item_id,validation
    from public.matrix_explore_results where lottery=l.lottery
    order by draw_period desc,analysis_version,item_id limit 250
  ) r
  union all
  select 'tianheng',r.* from lotteries l cross join lateral (
    select lottery,draw_period,analysis_version,item_id,validation
    from public.matrix_tianheng_results where lottery=l.lottery
    order by draw_period desc,analysis_version,item_id limit 250
  ) r
) select jsonb_agg(to_jsonb(s)) sample from s;
```

```sh
node --test tests/validation-snapshots.test.mjs
node scripts/experiments/validation-storage-compact-bench.mjs /absolute/path/sample.json
```

Fresh checks: four prototype codec tests passed; all 2,000 sampled validations round-tripped for each of five compact variants. Existing `node --test tests/result-item-dedup.test.mjs` baseline passed 11 tests. No full test suite was run. These checks do not certify unimplemented production migrations, recovery or concurrent cleanup.
