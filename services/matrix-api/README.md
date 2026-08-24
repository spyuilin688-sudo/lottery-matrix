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

## Draw-history boundary

`lottery_draws` is the durable historical store and is not capped at 80 rows per lottery. On an empty/new database, the first worker cycle loads the complete history exposed by the formal source and idempotently upserts every valid draw. The algorithm then reads only the newest 80 draws as its current maximum analysis window.

After the database has at least the analysis minimum, scheduled worker cycles skip the historical network backfill and fetch only the latest draw. The 80-draw value is therefore a compute-window/minimum-data rule, not a database retention rule. Historical draw rows are retained; only completed Matrix analysis artifacts use the separate three-day retention policy.

Each worker cycle also deletes analysis artifacts whose three-day retention window has expired before starting new work.

## Deployment boundary

Run `app.main:app` behind the Oracle Cloud process manager/reverse proxy. Configure the two environment variables above only on the Oracle host. FastAPI Cloud can be used for temporary API testing, but it is not the selected production compute target for this service.

## Oracle Cloud installation

The checked-in systemd units assume:

- repository releases live under `/opt/lottery-matrix/releases/<git-sha>`;
- `/opt/lottery-matrix/current` is a symlink to the active release;
- the service account is `matrix`;
- `uv` is installed at `/usr/local/bin/uv`;
- secrets exist only in `/etc/lottery-matrix/matrix-api.env`.

Initial host setup (run as an Oracle host administrator):

```bash
sudo useradd --system --home /opt/lottery-matrix --shell /usr/sbin/nologin matrix
sudo install -d -o matrix -g matrix /opt/lottery-matrix/releases /var/cache/lottery-matrix/uv
sudo install -d -m 0750 -o root -g matrix /etc/lottery-matrix
sudoedit /etc/lottery-matrix/matrix-api.env
```

The environment file must contain `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; keep it mode `0640`, owned by `root:matrix`. Do not copy `.env.example` as a production secret file.

For each release, replace `<git-sha>` with the verified commit:

```bash
sudo -u matrix git clone --no-checkout https://github.com/spyuilin688-sudo/lottery-matrix.git /opt/lottery-matrix/releases/<git-sha>
sudo -u matrix git -C /opt/lottery-matrix/releases/<git-sha> checkout --detach <git-sha>
cd /opt/lottery-matrix/releases/<git-sha>/services/matrix-api
sudo -u matrix /usr/local/bin/uv sync --frozen --no-dev
sudo ln -sfn /opt/lottery-matrix/releases/<git-sha> /opt/lottery-matrix/current
sudo install -m 0644 deploy/matrix-api.service deploy/matrix-worker.service deploy/matrix-worker.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now matrix-api.service matrix-worker.timer
```

Keep port 8000 bound to `127.0.0.1`; expose it only through the host reverse proxy and TLS endpoint. Verify the release and run one worker cycle:

```bash
curl --fail http://127.0.0.1:8000/health
sudo systemctl start matrix-worker.service
sudo systemctl status matrix-api.service matrix-worker.service matrix-worker.timer
sudo journalctl -u matrix-api.service -u matrix-worker.service --since today
```

The timer attempts all four lotteries every 15 minutes. Each worker uses the draw period as its analysis version, so repeated runs for the same completed draw are idempotent.

Rollback changes only the active symlink; replace `<previous-git-sha>` with a release that remains on disk:

```bash
sudo systemctl stop matrix-api.service matrix-worker.timer
sudo ln -sfn /opt/lottery-matrix/releases/<previous-git-sha> /opt/lottery-matrix/current
sudo systemctl daemon-reload
sudo systemctl start matrix-api.service matrix-worker.timer
curl --fail http://127.0.0.1:8000/health
```
