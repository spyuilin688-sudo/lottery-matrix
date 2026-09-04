# Fantasy5 Crawler / Analysis Split Design

## Goal

Split 天天樂 draw ingestion from Matrix analysis so GitHub Actions is the only active 天天樂 crawler and Railway analyzes only draw rows already stored in Supabase.

## Current problem

- `app.worker_all.LOTTERIES` contains 天天樂, so the primary Railway worker can crawl it.
- `railway.fantasy5.json` separately runs `app.worker --lottery 天天樂 --scheduled`, creating a second Railway crawl-and-analysis path.
- `.github/workflows/matrix-analysis.yml` also includes 天天樂 and can run the same combined worker from GitHub.
- `DrawRefreshService` legitimately owns source validation, recent-gap repair, and `lottery_draws` upserts, but the combined worker also starts Matrix analysis.

## Approved architecture

### GitHub Actions: crawler-only

Create `app.fantasy5_crawler` and `.github/workflows/fantasy5-crawler.yml`.

The crawler:

1. Reads the latest stored 天天樂 row from Supabase.
2. Fetches the latest draw through the existing California / SC888 source implementation.
3. Reuses `DrawRefreshService` validation.
4. Rejects a stale draw whose California draw date is not the previous Taipei calendar date.
5. Upserts the valid latest draw into `lottery_draws`.
6. Reuses `ensure_history` to repair internal recent period gaps with idempotent upserts.
7. Updates the existing 天天樂 acquisition job status without invoking `AnalysisPipeline` or any artifact builder.

The workflow uses only the existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` secrets. It supports manual dispatch and scheduled retries. The scheduled retry offsets remain the existing values: every five minutes from 0 through 45 minutes after the base call, then 75, 105, 135, 165, 225, 285, and 345 minutes. The current Taipei base times remain 09:33 from 03/13 through 11/05 and 10:33 otherwise. A season gate runs before checkout so the overlapping March and November cron ranges do not crawl twice.

### Railway: analysis-only

Create `app.analysis_worker` and change `railway.fantasy5.json` to run it.

The analysis worker:

1. Reads the newest 天天樂 draw from `lottery_draws`.
2. Uses `matrix_analysis_runs` and the current `matrix-python-v12` version as the idempotency boundary.
3. Returns without analysis when that period/version is already complete.
4. Resumes the existing period/version when it is incomplete.
5. Requires complete recent stored history before starting.
6. Writes Matrix run, Explore, 天衍, 天工, and status artifacts through the existing pipeline.
7. Never constructs `LatestDrawSource`, an HTTP client, or `DrawRefreshService`.

“Reads only from Supabase” applies to draw acquisition: Matrix analysis still writes its normal analysis results back to Supabase.

### Other entrypoints

- Remove 天天樂 from `app.worker_all.LOTTERIES`.
- Remove the 天天樂 matrix entry from `.github/workflows/matrix-analysis.yml`; GitHub must not run 天天樂 Matrix analysis.
- Leave 今彩539, 六合彩, and 大樂透 worker behavior unchanged.
- Do not modify frontend source, layout, or API consumption.

## Data and status flow

```text
California / SC888
        -> GitHub Actions fantasy5 crawler
        -> Supabase lottery_draws
        -> Railway analysis-only worker
        -> Supabase Matrix runs and artifacts
        -> existing PWA RPC reads
```

The crawler remains the owner of 天天樂 acquisition telemetry in `system_job_status`. A stale or transiently unavailable source remains `waiting_source`; a validated upsert is `success`; an unexpected validation or persistence error is `failed`. Analysis failure does not rewrite a successful acquisition status.

## Backfill

After code and CI verification, upsert the currently confirmed missing draw exactly once:

- Lottery: 天天樂
- Period: `11988`
- Draw date: `2026-09-02`
- Sorted numbers: `03, 06, 23, 29, 35`
- Draw-order numbers: `null`

Then verify `lottery_draws` continuity and wait for the Railway analysis-only worker to create or complete `11988:matrix-python-v12`.

## Verification

- Tests prove `worker_all` excludes 天天樂.
- Tests prove `railway.fantasy5.json` calls only `app.analysis_worker`.
- Tests prove the GitHub crawler workflow calls only `app.fantasy5_crawler` and uses the two existing Supabase secrets.
- Tests prove `.github/workflows/matrix-analysis.yml` no longer includes 天天樂.
- Crawler tests prove validation, stale-source rejection, recent-gap repair, and no Matrix analysis.
- Analysis-worker tests prove no network/source construction, no reanalysis of completed periods, and resume of incomplete stored periods.
- Run the full Matrix API pytest suite and repository CI before merge.

## Non-goals

- No Supabase schema or RLS change.
- No frontend or admin UI change.
- No change to the three other lottery source or analysis flows.
- No replacement of the existing California / SC888 parsing rules.
