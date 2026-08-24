# Matrix FastAPI Oracle Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Matrix scraping, Explore, Tianyan, Tiangong, status evaluation, progress tracking, and completed-result storage into a Python／FastAPI backend that runs on Oracle Cloud and persists to Supabase.

**Architecture:** A Python 3.12 service under `services/matrix-api` ports the existing TypeScript domain rules without changing behavior. Oracle runs the pipeline; Supabase stores draws, versioned job progress, and completed artifacts; the existing PWA and Cloudflare deployment remain visually unchanged.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, pytest, Supabase PostgreSQL, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-matrix-fastapi-oracle-backend-design.md`

## Global Constraints

- `lottery-matrix/main` is the only formal source.
- Preserve all existing Explore, Tianyan, Tiangong, and Matrix status rules.
- Do not modify UI, copy, layout, or user workflow.
- PWA never computes or fabricates Matrix results.
- Only complete analysis versions are readable.
- Retain algorithm and status artifacts for 3 days.
- Never commit Supabase secret keys.

---

### Task 1: FastAPI Service Foundation

**Files:**
- Create: `services/matrix-api/pyproject.toml`
- Create: `services/matrix-api/uv.lock`
- Create: `services/matrix-api/app/main.py`
- Create: `services/matrix-api/app/settings.py`
- Create: `services/matrix-api/tests/test_health.py`

**Interfaces:**
- Produces: `app.main:app` and `GET /health` returning `{"status":"ok"}`.

- [ ] Write and run a failing health endpoint test.
- [ ] Implement the minimal FastAPI application and environment settings.
- [ ] Run `uv run pytest tests/test_health.py -q` and confirm it passes.

### Task 2: Domain Types and Explore Algorithm

**Files:**
- Create: `services/matrix-api/app/domain/models.py`
- Create: `services/matrix-api/app/domain/explore.py`
- Create: `services/matrix-api/tests/test_explore.py`

**Interfaces:**
- Consumes: draw/request structures equivalent to `backend/matrix-algorithm.ts`.
- Produces: `run_matrix_algorithm_with_history`, `run_matrix_automatic_explore_with_history`, and `run_matrix_explore_group_with_history`.

- [ ] Port the existing TypeScript reference cases into failing Python tests.
- [ ] Implement number normalization, source matching, rule generation, streak validation, one-rule and two-rule coverage, and completed Explore output.
- [ ] Confirm Python expected outputs match the TypeScript fixtures.

### Task 3: Tianyan, Tiangong, and Status Rules

**Files:**
- Create: `services/matrix-api/app/domain/tianyan.py`
- Create: `services/matrix-api/app/domain/tiangong.py`
- Create: `services/matrix-api/app/domain/status.py`
- Create: `services/matrix-api/tests/test_tianyan.py`
- Create: `services/matrix-api/tests/test_tiangong.py`
- Create: `services/matrix-api/tests/test_status.py`

**Interfaces:**
- Produces: Python equivalents of `evaluateTianyanCandidate`, `enumerateEqualSpacingSequences`, `evaluateTiangongCandidate`, `deduplicateTiangongResults`, and `evaluateChapter15`.

- [ ] Port the existing TypeScript tests before production code.
- [ ] Implement the minimal Python equivalents.
- [ ] Run the focused tests and compare output identity fields, predictions, invalid reasons, and status priority.

### Task 4: Supabase Schema and Repository

**Files:**
- Create: `supabase/migrations/20260824180000_matrix_fastapi_backend.sql`
- Create: `services/matrix-api/app/repositories/analysis_repository.py`
- Create: `services/matrix-api/tests/test_analysis_repository.py`

**Interfaces:**
- Produces: idempotent draw upsert, run progress updates, atomic completed-artifact reads, and 3-day cleanup.

- [ ] Write failing repository contract tests using an in-memory adapter.
- [ ] Implement the repository protocol and Supabase adapter.
- [ ] Add the three RLS-enabled tables, unique keys, indexes, and grants needed by backend-only writes.
- [ ] Apply the migration, inspect tables, and run Supabase advisors.

### Task 5: Pipeline and Read Endpoints

**Files:**
- Create: `services/matrix-api/app/services/analysis_pipeline.py`
- Create: `services/matrix-api/app/api/analysis.py`
- Create: `services/matrix-api/tests/test_analysis_pipeline.py`
- Create: `services/matrix-api/tests/test_analysis_api.py`
- Modify: `services/matrix-api/app/main.py`

**Interfaces:**
- Produces: latest-draw pipeline, progress endpoint, and completed-artifact endpoint.

- [ ] Write failing tests for success, partial failure, duplicate execution, progress, and incomplete-version rejection.
- [ ] Implement the pipeline and route handlers with dependency injection.
- [ ] Confirm all Python tests pass.

### Task 6: Integration Verification and Main Synchronization

**Files:**
- Modify only integration/configuration files required by the implemented backend.

**Interfaces:**
- Produces: verified source on `lottery-matrix/main`; no UI changes.

- [ ] Run `uv run pytest -q` in `services/matrix-api`.
- [ ] Run `npm run test:unit`.
- [ ] Run `npm run build:verified`.
- [ ] Verify the Supabase migration and RLS state.
- [ ] Review `git diff --check` and `git status --short`.
- [ ] Commit and push directly to `main`.
- [ ] Confirm the latest GitHub HEAD and existing Cloudflare／AppDeploy deployment boundary.

### Task 7: Formal Latest-Draw Source Adapters

**Files:**
- Create: `services/matrix-api/app/scraping/__init__.py`
- Create: `services/matrix-api/app/scraping/html_tables.py`
- Create: `services/matrix-api/app/scraping/sources.py`
- Create: `services/matrix-api/tests/test_scraping_sources.py`

**Interfaces:**
- Consumes: the four formal sources already declared in `backend/scraper.ts`.
- Produces: `parse_taiwan_lottery_payload`, `parse_sc888_fantasy5_html`, `parse_nfd_marksix_html`, and `LatestDrawSource.fetch(lottery)`.

- [x] Write literal fixtures for Taiwan Lottery JSON, sc888 table HTML, and NFD table HTML; assert period, date, sorted numbers, and draw-order numbers.
- [x] Run `uv run pytest tests/test_scraping_sources.py -q` and confirm collection fails because `app.scraping.sources` does not exist.
- [x] Implement a standard-library table parser plus the three formal parsers without adding a second HTML parsing dependency.
- [x] Add an injected `httpx.Client` adapter that selects only the four existing formal source URLs and rejects incomplete responses.
- [x] Run the focused tests and commit `feat: add Python lottery source adapters`.

### Task 8: Supabase Draw History and Refresh Service

**Files:**
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Create: `services/matrix-api/app/services/draw_refresh.py`
- Create: `services/matrix-api/tests/test_draw_refresh.py`
- Modify: `services/matrix-api/tests/test_analysis_repository.py`

**Interfaces:**
- Consumes: `LatestDrawSource.fetch(lottery)` and the existing `lottery_draws` table.
- Produces: `AnalysisRepository.list_draws(lottery, limit)` and `DrawRefreshService.refresh(lottery)`.

- [x] Write failing repository and refresh tests proving newest-first history, idempotent upsert, and rejection of a source response that does not match the requested lottery.
- [x] Implement `list_draws` in both repository adapters with one normalized camel-case response shape.
- [x] Implement `DrawRefreshService` so one lottery failure cannot write another lottery's data.
- [x] Run repository and refresh tests and commit `feat: refresh lottery history in Supabase`.

### Task 9: Complete Artifact Builders and Oracle Worker Entry Point

**Files:**
- Create: `services/matrix-api/app/domain/tianyan_artifact.py`
- Create: `services/matrix-api/app/domain/tiangong_generator.py`
- Create: `services/matrix-api/app/domain/tiangong_artifact.py`
- Create: `services/matrix-api/app/services/artifact_builders.py`
- Create: `services/matrix-api/app/worker.py`
- Create: `services/matrix-api/tests/test_tianyan_artifact.py`
- Create: `services/matrix-api/tests/test_tiangong_generator.py`
- Create: `services/matrix-api/tests/test_worker.py`

**Interfaces:**
- Consumes: completed Python Explore output, draw history, `DrawRefreshService`, and `AnalysisPipeline`.
- Produces: four concrete builders and `python -m app.worker --lottery <彩種>`.

- [x] Port the existing TypeScript Tianyan artifact fixtures before implementing the Python pair builder.
- [x] Port the existing TypeScript Tiangong generator fixtures before implementing position paths, rule derivation, source sequences, and artifact deduplication.
- [x] Assemble concrete `explore`, `tianyan`, `tiangong`, and `status` builders; do not expose a public compute endpoint.
- [x] Write a worker test proving refresh → history → four artifacts → complete status order and failure isolation.
- [x] Run all Python tests and commit `feat: run complete Matrix analysis worker`.

### Task 10: Oracle Runtime Files and Final Verification

**Files:**
- Create: `services/matrix-api/deploy/matrix-api.service`
- Create: `services/matrix-api/deploy/matrix-worker.service`
- Create: `services/matrix-api/deploy/matrix-worker.timer`
- Modify: `services/matrix-api/README.md`

**Interfaces:**
- Produces: reproducible Oracle process and timer configuration; actual host deployment still requires Oracle host access.

- [x] Add systemd unit and timer files that execute only repository code and read secrets from the Oracle environment.
- [x] Document exact install, start, status, and rollback commands without storing credentials.
- [x] Run all Python tests, `npm run test:unit`, `npm run build:verified`, `git diff --check`, and secret-pattern checks.
- [x] Push verified source directly to `lottery-matrix/main`, then report whether actual Oracle deployment was possible with the available access.
