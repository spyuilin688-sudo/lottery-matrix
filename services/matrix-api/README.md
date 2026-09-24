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

The live Railway service configuration is authoritative. Do not bind a custom
`railway.json` / `railway.toml` config file path: Railway has deprecated that
Config-as-Code mechanism in favor of project IaC. The current start command is:

```text
uv run --no-dev --no-sync python -u -m app.api_server
```

Public endpoints:

```text
GET  /health
GET  /api/matrix/latest/{lottery}
GET  /api/matrix/history/{lottery}
GET  /api/matrix/history-years/{lottery}
GET  /api/matrix/cards/{lottery}
POST /api/matrix/tongxing
POST /api/matrix/number-reference
```

The PWA reads this service through `VITE_RAILWAY_API_BASE`. The public process
does not serve `/jobs/*` control routes, even when a caller supplies the
administrator token. Job status, manual refresh, primary dispatch, calendar
refresh, result-ready handling, and recovery are owned by the isolated
`matrix-recovery` service.

`GET /health` reports only the public API process/database health and source
revision. It no longer interprets the presence of an administrator job token,
because that token is not part of the public API responsibility.

The shared Python dispatcher remains in `api_server.py` because
`recovery_server.py` reuses its validated job handlers internally. That code
sharing is not a second network owner: `RailwayApiHandler` rejects every
protected `/jobs/*` request before dispatch, while `RecoveryApiHandler`
exposes the job contract on the dedicated recovery host.

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
independent Railway recovery service (`app.recovery_server`). Its live Railway
service settings are authoritative; the repository's older `railway.recovery.json`
is retained only as a legacy/manual compatibility artifact and is not bound as a
custom config file. The recovery service is the sole Railway network owner for `/jobs/*`
control routes and can invoke the dedicated 天天樂 crawler before resuming
analysis. The GitHub `fantasy5-crawler.yml` workflow remains a dispatch-only
fallback; it does not own recurring acquisition or current scheduled recovery.

### Scheduled workers

Draw ingestion and Matrix analysis are split for 天天樂:

| Deployment | Entrypoint | Responsibility |
| --- | --- | --- |
| Railway `fantasy5-crawler` | `app.fantasy5_railway_job` | Scheduled acquisition; UTC `33 1,2 * * *`, DST gate selects one start, at most 10 attempts 600 seconds apart |
| GitHub Actions `fantasy5-crawler.yml` (manual fallback only) | `app.fantasy5_crawler` | Fetch, validate, repair recent gaps, and upsert 天天樂 draws only |
| Railway `fantasy5-analysis` | `app.analysis_worker --lottery 天天樂` | Read stored 天天樂 draws and process pending Matrix analysis only; live Railway service settings own the cron/start command |
| Railway `lottery-matrix` | `app.primary_worker --group evening` | One daily fallback for 今彩539、六合彩、大樂透 after the dynamic window; live Railway service settings own the cron/start command |
| Repository legacy/manual `railway.marksix.json` | `app.worker --lottery 六合彩 --scheduled` | Manual single-run compatibility artifact; no production Railway service is currently bound to it |
| Repository legacy/manual `railway.lotto649.json` | `app.worker --lottery 大樂透 --scheduled` | Manual single-run compatibility artifact; no production Railway service is currently bound to it |

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

The formal primary schedule is now owned by Supabase's durable dynamic scheduler:
evening and Fantasy5 groups store the next primary slot and dispatch only inside
their configured windows. Railway `lottery-matrix` and `fantasy5-analysis`
remain one daily post-window fallback each. Recovery uses its own durable slots,
and actual recovery dispatch excludes every clock already owned by Primary.
Existing completion certificates still skip heavy work when the current stored
results and downstream work are verified complete.

## Supabase data boundary

`lottery_draws` stores historical draws. History is not capped at 80 records. The public history API paginates Supabase reads so 1000/3000/5000-period number-reference queries are not silently truncated.

Matrix background analysis writes its run/artifact data to the existing Supabase Matrix analysis tables. Matrix Explore is read by the PWA through the existing Supabase RPCs `matrix_explore_list` and `matrix_explore_validation`; the current administrator UI is served at `/admin/`; the admin API is the Supabase `admin-api` Edge Function.

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
