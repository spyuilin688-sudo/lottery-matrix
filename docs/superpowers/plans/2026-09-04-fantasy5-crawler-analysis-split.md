# Fantasy5 Crawler / Analysis Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub Actions the only active 天天樂 crawler and make the dedicated Railway 天天樂 service analyze only Supabase draw rows.

**Architecture:** Add one crawler-only entrypoint that reuses existing source and draw-refresh code, and one analysis-only entrypoint that reuses the existing idempotent Matrix pipeline without constructing a source client. Remove 天天樂 from every existing GitHub analysis path and from Railway `worker_all`.

**Tech Stack:** Python 3.12, pytest, httpx, Supabase Python client, GitHub Actions, Railway cron

**Spec:** `docs/superpowers/specs/2026-09-04-fantasy5-crawler-analysis-split-design.md`

## Global Constraints

- GitHub Actions may crawl 天天樂 but must not run its Matrix algorithms.
- Railway may analyze 天天樂 but must not connect to California or SC888.
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` remain the only crawler secrets.
- 今彩539, 六合彩, 大樂透, frontend, and Supabase schema behavior remain unchanged.
- Never force-push or overwrite a newer `main` change.

---

### Task 1: Lock the deployment boundaries with RED tests

**Files:**
- Create: `services/matrix-api/tests/test_fantasy5_worker_split.py`
- Modify: `services/matrix-api/tests/test_worker_all.py`

**Interfaces:**
- Consumes: Railway JSON files and GitHub workflow source.
- Produces: regression assertions for `app.fantasy5_crawler`, `app.analysis_worker`, and the three-lottery `worker_all` tuple.

- [ ] Add assertions that `LOTTERIES == ("今彩539", "六合彩", "大樂透")` and that `run_all_workers` preserves that order.
- [ ] Add a config assertion that `railway.fantasy5.json` runs `uv run python -u -m app.analysis_worker --lottery 天天樂`.
- [ ] Add workflow assertions that `fantasy5-crawler.yml` uses `app.fantasy5_crawler`, both Supabase secrets, no `app.worker`, and no `matrix-analysis` command.
- [ ] Add an assertion that `.github/workflows/matrix-analysis.yml` contains no 天天樂 matrix item.
- [ ] Run `uv run pytest -q tests/test_worker_all.py tests/test_fantasy5_worker_split.py` and confirm failure because the split entrypoints/config do not exist.
- [ ] Commit the RED contract.

### Task 2: Implement the crawler-only path

**Files:**
- Create: `services/matrix-api/app/fantasy5_crawler.py`
- Create: `.github/workflows/fantasy5-crawler.yml`
- Test: `services/matrix-api/tests/test_fantasy5_worker_split.py`

**Interfaces:**
- Consumes: `AnalysisRepository`, `LatestDrawSource`, `DrawRefreshService`, `JOB_NAME_BY_LOTTERY`, and `Settings`.
- Produces: `run_fantasy5_crawler(repository, source, now=None) -> dict[str, Any]` and `main() -> int`.

- [ ] Write a failing test where stored periods `11987` and `11989` cause the crawler to fetch history and restore `11988`.
- [ ] Write a failing test where a stale source date is rejected without an upsert and produces `waiting_source` telemetry.
- [ ] Write a failing CLI test that raises if an artifact builder or analysis worker is constructed.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Implement validation, expected-date checking, idempotent latest upsert, `ensure_history`, and existing job-status writes without importing Matrix pipeline code.
- [ ] Add the bounded retry cron expressions and season gate to the workflow.
- [ ] Run the focused tests and confirm they pass.
- [ ] Commit the crawler-only implementation.

### Task 3: Implement the Railway analysis-only path

**Files:**
- Create: `services/matrix-api/app/analysis_worker.py`
- Modify: `services/matrix-api/app/worker.py`
- Modify: `services/matrix-api/app/worker_all.py`
- Modify: `services/matrix-api/railway.fantasy5.json`
- Modify: `.github/workflows/matrix-analysis.yml`
- Modify: `services/matrix-api/tests/test_worker_all.py`
- Test: `services/matrix-api/tests/test_fantasy5_worker_split.py`

**Interfaces:**
- Consumes: `_run_analysis`, `_draw_from_history`, `recent_history_window`, `require_complete_history`, and `create_artifact_builders`.
- Produces: `run_analysis_only_worker(lottery, repository, builders=None) -> dict[str, Any]` and a CLI that accepts only 天天樂.

- [ ] Write a failing test proving a completed `11988:matrix-python-v12` returns without invoking builders.
- [ ] Write a failing test proving an incomplete latest stored period resumes all required builders without source/network construction.
- [ ] Run focused tests and confirm the expected failures.
- [ ] Implement the latest-period/progress check, complete-history gate, expired-lease cleanup, and existing pipeline call.
- [ ] Change Railway and GitHub configuration boundaries and remove 天天樂 from `worker_all`.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit the analysis-only implementation.

### Task 4: Documentation, full verification, merge, and data repair

**Files:**
- Modify: `services/matrix-api/README.md`
- Verify: all files listed above.

**Interfaces:**
- Consumes: completed split and production Supabase project `wcimzbbapfrdotjsfyxa`.
- Produces: merged code, continuous `lottery_draws`, and a completed v12 analysis row for period `11988`.

- [ ] Update the README with the exact GitHub crawler and Railway analysis-only responsibilities.
- [ ] Run `uv run pytest -q` from `services/matrix-api`.
- [ ] Fetch latest `main`, compare changed filenames, and resolve only genuine overlap without force.
- [ ] Re-run focused and full tests after synchronization.
- [ ] Open the PR, inspect CI, and merge only after required checks pass.
- [ ] Upsert the confirmed `11988` draw with `draw_order_numbers = null`.
- [ ] Query recent 天天樂 periods to confirm there is no gap.
- [ ] Query `matrix_analysis_runs` until `11988:matrix-python-v12` is complete; report an unresolved Railway deployment/runtime blocker instead of claiming completion if it is not.
