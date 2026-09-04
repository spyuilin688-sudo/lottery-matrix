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
GET  /api/matrix/latest/{lottery}
GET  /api/matrix/history/{lottery}
POST /api/matrix/tongxing
POST /api/matrix/number-reference
```

The PWA reads this service through `VITE_RAILWAY_API_BASE`.

`GET /health` is public. `GET /jobs/status` and `POST /jobs/refresh` are for
the AppDeploy backend only and require the `X-Matrix-Admin-Token` request
header. Railway and AppDeploy must store the same server-only secret under
`MATRIX_ADMIN_STATUS_TOKEN`. Never expose that value through a `VITE_` variable
or other browser configuration.

The health payload reports `adminApi.status` as `ok` or `misconfigured` without
exposing the secret. AppDeploy is an administrator-backend consumer only; it is
not a deployment target for the public PWA.

`POST /jobs/refresh` accepts `{"lottery":"今彩539"}` for 今彩539、六合彩、or
大樂透, then fetches and upserts only its latest draw. It does not backfill
history, run Matrix analysis, or update scheduled-job status records. Requests
for 天天樂 return `409 FANTASY5_CRAWLER_GITHUB_ONLY`; its only ingestion path is
the GitHub crawler.

### Scheduled workers

Draw ingestion and Matrix analysis are split for 天天樂:

| Deployment | Entrypoint | Responsibility |
| --- | --- | --- |
| GitHub Actions `fantasy5-crawler.yml` | `app.fantasy5_crawler` | Fetch, validate, repair recent gaps, and upsert 天天樂 draws only |
| Railway `railway.fantasy5.json` | `app.analysis_worker --lottery 天天樂` | Read stored 天天樂 draws and process pending Matrix analysis only |
| Railway `railway.json` | `app.worker_all` | Scheduled ingestion and analysis for 今彩539、六合彩、大樂透 |
| Railway `railway.marksix.json` | `app.worker --lottery 六合彩 --scheduled` | Existing 六合彩 worker |
| Railway `railway.lotto649.json` | `app.worker --lottery 大樂透 --scheduled` | Existing 大樂透 worker |

The GitHub crawler uses only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. It obtains
the latest California Fantasy5 draw through the existing source implementation,
validates the source date and numbers, repairs internal recent-period gaps, and
upserts `lottery_draws`. It owns 天天樂 acquisition status in
`system_job_status` and never constructs Matrix artifact builders.

The dedicated Railway 天天樂 process reads a bounded set of recent
`lottery_draws` from Supabase and batch-checks their
`period:matrix-python-v12` progress rows. It processes a new tail in order and
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
天天樂 GitHub crawler   03/13–11/05 09:33
天天樂 GitHub crawler   11/06–03/12 10:33
```

The three existing Railway crawl workers retain their current pre-draw and retry
grid. The GitHub 天天樂 crawler runs only at the bounded post-draw retry offsets:
every 5 minutes from 0 through 45 minutes after the base call, then at 75, 105,
135, 165, 225, 285, and 345 minutes. A Taipei-date season gate prevents the
overlapping March and November UTC cron ranges from running twice.

## Supabase data boundary

`lottery_draws` stores historical draws. History is not capped at 80 records. The public history API paginates Supabase reads so 1000/3000/5000-period number-reference queries are not silently truncated.

Matrix background analysis writes its run/artifact data to the existing Supabase Matrix analysis tables. Matrix Explore is read by the PWA through the existing Supabase RPCs `matrix_explore_list` and `matrix_explore_validation`; AppDeploy no longer exposes Matrix Explore HTTP routes.

## Matrix Explore canonical v12 core

`app.domain.explore_engine` is the only production Explore/Status core for the
`matrix-python-v12` analysis version. It builds a complete-history occurrence
index per lottery/order and reuses cached range cells across the thirteen source
periods. Drag reads only the locked cell; add and sum reuse their range cells.
Only fully finalized and valid results are persisted.

The authoritative behavior is documented in
`docs/specs/Matrix_Explore_Canonical_v12_20260902.md`. Every reference cell for
the same locked condition is finalized before a result is emitted. Each
persisted Explore row includes its validation payload for the
`matrix_explore_validation` RPC and the expandable road details in the PWA.

## Local verification

```bash
uv sync
uv run pytest -q
```
