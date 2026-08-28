# Matrix Railway Service

`services/matrix-api` is the Railway execution service for lottery draw ingestion and Matrix background analysis. Supabase is the durable data store. Cloudflare Pages hosts the PWA.

## Required Railway variables

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret-key>
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
GET  /api/matrix/latest/{lottery}
GET  /api/matrix/history/{lottery}
POST /api/matrix/tongxing
POST /api/matrix/number-reference
```

The PWA reads this service through `VITE_RAILWAY_API_BASE`.

### Scheduled workers

The four lottery worker configs are:

```text
railway.json
railway.fantasy5.json
railway.marksix.json
railway.lotto649.json
```

Each worker is triggered on the five-minute Railway cron grid. `app.schedule` decides whether the current minute is one of the configured call times. `app.worker` checks Supabase before fetching; once the current draw has been acquired, later calls for that draw stop doing network work.

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

## Local verification

```bash
uv sync
uv run pytest -q
```
