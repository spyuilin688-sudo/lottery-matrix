# Matrix FastAPI

Python 3.12 backend for Matrix draw ingestion, long-running analysis, progress tracking, and completed-result reads. The production target is Oracle Cloud; Supabase is the durable store. React/PWA remains on the existing frontend deployment.

## Local development

```bash
uv sync
uv run fastapi dev
uv run pytest -q
```

The health endpoint works without database credentials. Analysis endpoints return `503` until both server-only variables are configured:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret-key>
```

Never use the publishable/anon key for the Oracle worker, and never expose the secret key to React, Cloudflare Pages, logs, or GitHub.

## HTTP boundary

- `GET /health`
- `GET /v1/analysis/{lottery}/{draw_period}/progress`
- `GET /v1/analysis/{lottery}/{draw_period}/{kind}` where `kind` is `explore`, `tianyan`, `tiangong`, or `status`

Only a completed four-artifact analysis version is returned. The worker pipeline is intentionally not exposed as a public trigger endpoint.

## Deployment boundary

Run `app.main:app` behind the Oracle Cloud process manager/reverse proxy. Configure the two environment variables above only on the Oracle host. FastAPI Cloud can be used for temporary API testing, but it is not the selected production compute target for this service.
