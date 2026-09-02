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

`POST /jobs/refresh` accepts `{"lottery":"今彩539"}` (or another supported
lottery), then fetches and upserts only its latest draw. It does not backfill
history, run Matrix analysis, or update scheduled-job status records.

### Scheduled workers

The four lottery worker configs are:

```text
railway.json
railway.fantasy5.json
railway.marksix.json
railway.lotto649.json
```

Each worker is triggered on the five-minute Railway cron grid. `app.schedule` decides whether the current minute is one of the configured call times. `app.worker` checks Supabase before fetching; once the current draw has been acquired, later calls for that draw stop doing network work.

天天樂只儲存並計算依號碼由小到大排列的順球資料；不要求、補抓或以其他資料偽造落球順序。

Automated entrypoints must use `--scheduled`. The CLI defaults to scheduled mode as a
second safeguard for deployment configuration.

Call times in Asia/Taipei:

```text
今彩539  20:33
大樂透   20:53
六合彩   21:33
天天樂   03/13–11/05 09:33
天天樂   11/06–03/12 10:33
```

Additional calls occur 2 hours, 1 hour, and 30 minutes before the base call time. If the new draw has not been acquired, retries are 5 minutes × 10, 30 minutes × 4, 1 hour × 3, 3 hours × 2, then 6 hours × 1. Any successful acquisition stops later calls for that draw.

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
