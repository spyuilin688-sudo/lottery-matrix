# Matrix Railway Service

`services/matrix-api` is the Railway execution service for lottery draw ingestion and Matrix background analysis. Supabase is the durable data store. Cloudflare Pages hosts the PWA.

## Required Railway variables

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret-key>
MATRIX_ADMIN_STATUS_TOKEN=<shared-admin-status-token>
```

## Railway services

### Public lottery API

Use `railway.api.json`.

Start command:

```text
uv run python -u -m app.api_server
```

Endpoints:

```text
GET  /health
GET  /jobs/status
POST /jobs/refresh
POST /jobs/recover
GET  /api/matrix/latest/{lottery}
GET  /api/matrix/history/{lottery}
POST /api/matrix/tongxing
POST /api/matrix/number-reference
```

The PWA reads this service through `VITE_RAILWAY_API_BASE`.

`GET /health` is public. `GET /jobs/status`, `POST /jobs/refresh`, and
`POST /jobs/recover` are for the Supabase `admin-api` Edge Function only and require the
`X-Matrix-Admin-Token` request
header. Railway and the Supabase Edge Function must store the same server-only secret under
`MATRIX_ADMIN_STATUS_TOKEN`. Never expose that value through a `VITE_` variable
or other browser configuration.

The health payload reports `adminApi.status` as `ok` or `misconfigured` without
exposing the secret. Supabase `admin-api` is the administrator-backend consumer.
The current administrator UI is `https://matrixlottery.idv.tw/admin/`. The old
AppDeploy endpoint remains reachable; its deployed code and data ownership have
not been verified in this audit.

`POST /jobs/refresh` accepts `{"lottery":"今彩539"}` for 今彩539、六合彩、or
大樂透, then fetches and upserts only its latest draw. It does not backfill
history, run Matrix analysis, or update scheduled-job status records. Requests
for 天天樂 return `409 FANTASY5_CRAWLER_GITHUB_ONLY`; this public API does not
ingest 天天樂. The scheduled Railway crawler and the
manual GitHub fallback use the dedicated crawler entrypoint. The existing error
code is a legacy name, not a description of current deployment ownership.

`POST /jobs/recover` starts one deduplicated background recovery for the selected
lottery and returns `202` immediately. For 天天樂 it invokes only
`app.analysis_worker`; it never constructs or calls a draw source. For the
three Railway-owned lotteries it invokes the tracked scheduled pipeline. The
pipeline refreshes only inside a due stale-draw window and otherwise resumes
stored analysis. Concurrent requests in the Railway API process for the same lottery return
`already-running`; recovery threads are non-daemon. The API atomically consumes the Supabase watchdog claim with a unique runner fence,
renews its durable Supabase lease every minute while work runs, and releases it
only after completion. If a live runner loses ownership, that Railway replica
terminates before a replacement may continue.

### Independent watchdog

Supabase recovery uses daily cycle starts at 20:30 and 09:30 Asia/Taipei
(`matrix-recovery-start-evening` / `matrix-recovery-start-fantasy5`) and one
pending next-slot job per group. The old `matrix-admin-watchdog-v1` all-day
poller was retired by `20260920233444_recovery_dynamic_slots.sql`.
Evening recovery checks every 10 minutes until 01:00, then every 50 minutes
before 06:00, with extra checks at 12:00 and 18:00. 天天樂 checks every 10
minutes until 14:00, then every 50 minutes before 18:00, with extra checks at
00:00 and 06:00 the next day. Verified current-cycle completion or a known
no-draw day cancels remaining checks; unknown calendar data does not.
Recovery reads job, draw, and analysis state and uses a durable lease before
dispatch. Its schedule is independent of the primary workers.

The watchdog dispatches targeted crawler, analysis, or Matrix-status work to the
independent Railway recovery service (`app.recovery_server`, configured by
`railway.recovery.json`). Unlike the public API's analysis-only 天天樂 recovery
entry, this service can invoke the dedicated 天天樂 crawler and then resume
analysis. The GitHub `fantasy5-crawler.yml` workflow remains a dispatch-only
fallback; it does not own recurring acquisition or current scheduled recovery.

### Scheduled workers

Draw ingestion and Matrix analysis are split for 天天樂:

| Deployment | Entrypoint | Responsibility |
| --- | --- | --- |
| Railway `fantasy5-crawler` | `app.fantasy5_railway_job` | Scheduled acquisition; UTC `33 1,2 * * *`, DST gate selects one start, at most 10 attempts 600 seconds apart |
| GitHub Actions `fantasy5-crawler.yml` (manual fallback only) | `app.fantasy5_crawler` | Fetch, validate, repair recent gaps, and upsert 天天樂 draws only |
| Railway `railway.fantasy5.json` | `app.analysis_worker --lottery 天天樂` | Read stored 天天樂 draws and process pending Matrix analysis only |
| Railway `railway.json` | `app.primary_worker --group evening` | One daily fallback for 今彩539、六合彩、大樂透 after the dynamic window |
| Railway `railway.marksix.json` | `app.worker --lottery 六合彩 --scheduled` | Manual single-run entry; no cron |
| Railway `railway.lotto649.json` | `app.worker --lottery 大樂透 --scheduled` | Manual single-run entry; no cron |

Both crawler entrypoints use the same acquisition service, validate the source
date and numbers, repair recent period gaps, and upsert `lottery_draws`. They own
天天樂 acquisition telemetry in `system_job_status` and never construct Matrix
artifact builders. Completion telemetry is fenced by each attempt's `started_at`,
so an older attempt cannot finish or overwrite a newer attempt's status.

The primary schedule is stored in Supabase and dispatches only inside the two
configured Taipei windows. `lottery-matrix` and `fantasy5-analysis` retain one
daily Railway fallback at 06:10 and 18:10 Asia/Taipei respectively, after each
dynamic window has closed, instead of starting every ten minutes all day;
`fantasy5-crawler` uses `33 1,2 * * *` UTC; the public API and recovery server
are persistent services. Repository configuration alone is not evidence of the
live service binding.

The dedicated Railway 天天樂 process reads a bounded set of recent
`lottery_draws` from Supabase and batch-checks their
`period:matrix-python-v15-sorted` progress rows. It processes a new tail in order and
repairs bounded analysis gaps such as a late-backfilled period between two
completed periods. Full-history reads restart if concurrent ingestion shifts an
offset page, so no duplicated draw reaches the algorithms. It does not
construct an HTTP client, `LatestDrawSource`, or `DrawRefreshService`, and
therefore cannot connect to California or SC888.

天天樂只儲存並計算依號碼由小到大排列的順球資料；不要求、補抓或以其他資料偽造落球順序。其來源日期使用加州當地開獎日，因此台灣早上的排程週期必須對應來源的前一日。

The other automated `app.worker` entrypoints must use `--scheduled`. The 天天樂
analysis-only entrypoint intentionally has no scheduled crawl mode.

Base call times in Asia/Taipei:

```text
今彩539  20:33
大樂透   20:53
六合彩   21:33
天天樂 Railway crawler   Taipei 09:33 during Los Angeles PDT
天天樂 Railway crawler   Taipei 10:33 during Los Angeles PST
```

The three evening lotteries retain their existing draw admission/retry rules.
The scheduled 天天樂 crawler uses an `America/Los_Angeles` UTC-offset gate so
only one of its two daily UTC starts performs acquisition. It exits after
`acquired` or `already-acquired`; waiting-source attempts are bounded to 10.
The GitHub workflow is dispatch-only and uses the same bounded retry count.

`app.worker_schedule.plan_run` expresses the approved primary windows: evening
20:30–01:00 every 10 minutes, then every 30 minutes before 06:00; 天天樂 analysis
09:30–14:00 every 10 minutes, then every 30 minutes before 18:00. This pure policy
is **not connected to production entrypoints** and does not reduce all-day
Railway starts. The integration plan requires a crash-safe next daily start,
verified current-cycle completion, preservation of pending repair/in-flight work,
and independent recovery. No cron or admission change is made by this audit fix.
See `docs/superpowers/plans/2026-09-21-dynamic-worker-schedule.md` for the open
integration work. Existing completion certificates already skip heavy analysis
reads when the current stored results and downstream work are verified complete.

## Supabase data boundary

`lottery_draws` stores historical draws. History is not capped at 80 records. The public history API paginates Supabase reads so 1000/3000/5000-period number-reference queries are not silently truncated.

Matrix background analysis writes its run/artifact data to the existing Supabase Matrix analysis tables. Matrix Explore is read by the PWA through the existing Supabase RPCs `matrix_explore_list` and `matrix_explore_validation`; the current administrator UI is served at `/admin/`; ownership of the old live AppDeploy endpoint remains unverified.

## Algorithm specification and runtime versions

`v12` names the canonical Explore algorithm specification in
`docs/specs/Matrix_Explore_Canonical_v12_20260902.md`; it is not a deploy or
artifact version. `v13` introduced the Tianheng artifact contract. `v14` added
separate sorted-order and draw-order artifacts. Both remain historical result
versions. `v15` adds the independent Tianshu phase and is the current
runtime/result artifact contract: `<period>:matrix-python-v15-sorted` and, where
the source provides draw order, `<period>:matrix-python-v15-draw`. The Railway
execution version is the deployed Git commit SHA and is recorded separately.

`app.domain.explore_engine` is the only production Explore/Status core. It builds a complete-history occurrence
index per lottery/order and reuses cached range cells across the thirteen source
periods. Drag reads only the locked cell; add and sum reuse their range cells.
Only fully finalized and valid results are persisted.

Every reference cell for
the same locked condition is finalized before a result is emitted. Each
persisted Explore row includes its validation payload for the
`matrix_explore_validation` RPC and the expandable road details in the PWA.

## Current analysis integration (v15)

Analysis phases run in order: Explore, Tianheng, Tianshu, Tianyan, Tiangong,
Status. Tian Gong is generated by this leased pipeline; the obsolete
push-triggered artifact refresh script/job has been removed. The retained Tian
Gong workflow runs layout checks only and has no database credentials. Artifact
writes continue to require both the current owner and run-start fence.
Tianheng and Tianshu run in resumable, lease-guarded batches with their
own artifact chunks and normalized result rows. Workers repair missing Explore,
Tianheng, and Tianshu normalized result sets from completed artifacts without
rerunning analysis. Matrix Status continues to consume only Explore and Tianyan.

## Local verification

```bash
uv sync
uv run pytest -q tests/test_security_monitor.py tests/test_api_server_http.py
uv run pytest -q tests/test_analysis_worker_notifications.py tests/test_fantasy5_card_notifications.py
```

Choose only the directly affected test files for each change; the repository CI
scope job expands that selection. Do not use an unbounded `pytest` invocation as
the standard local verification command.
