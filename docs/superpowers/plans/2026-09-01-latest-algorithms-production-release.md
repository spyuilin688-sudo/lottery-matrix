# Latest Matrix Algorithms Production Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Explore v10, Tianyan, and Tiangong v2 online for only the latest draw of each lottery, with complete real draw-order inputs and no sorted-order fallback.

**Architecture:** Extend the existing Railway draw source so production can restore missing real draw-order history before the v10 pipeline starts. Keep Explore/Tianyan/Tiangong fail-closed on missing actual order, remove the obsolete Supabase Tiangong artifact blocker, then cut the Explore RPCs to v10 and run the existing four-lottery workflow once.

**Tech Stack:** Python 3.12, httpx, pytest, PostgreSQL 17, Supabase migrations/RPC, GitHub Actions, Railway workers

**Spec:** `docs/specs/Matrix_探索功能_三版路演算法_API_完整修正版_v2_20260901.md`; `docs/superpowers/specs/2026-08-31-shared-explore-tianyan-pipeline-design.md`; `docs/superpowers/specs/2026-08-21-matrix-tiangong-production-generator-design.md`

## Global Constraints

- Compute only the latest draw for 今彩539、天天樂、六合彩、大樂透; do not precompute yesterday or the day before yesterday.
- Explore and Tianyan use `matrix-python-v10`; Tiangong uses `tiangong-two-stage-near-2-to-3-v2.0.0` within the same completed analysis run.
- 今彩539、六合彩、大樂透 must never substitute sorted numbers for missing actual draw-order numbers.
- 天天樂 remains sorted-order only.
- Complete history remains uncapped; 50/80 periods limit only Tiangong source combinations.
- Do not alter algorithm formulas, boundaries, deduplication, candidate legality, or Cartesian-product prohibitions.
- Publish a run only after Explore, Tianyan, Tiangong, and status artifacts all succeed.

---

### Task 1: Restore verifiable actual draw-order sources

**Files:**
- Modify: `services/matrix-api/app/scraping/sources.py`
- Test: `services/matrix-api/tests/test_scraping_sources.py`
- Test: `services/matrix-api/tests/test_scraping_history.py`

**Interfaces:**
- Produces: `parse_nfd_marksix_draw_order_history(html: str) -> dict[str, list[str]]`
- Produces: `parse_sc888_marksix_history(html: str) -> list[MatrixDraw]`
- Produces: `parse_nfd_daily539_draw_order_history(html: str) -> list[MatrixDraw]`
- Produces: `LatestDrawSource.fetch_algorithm_history(lottery: str) -> list[MatrixDraw]`
- Preserves: `LatestDrawSource.fetch(lottery)` and `fetch_history(lottery, limit)`

- [x] **Step 1: Write failing parser tests**

Add literal fixtures proving that NFD `FYYYY` rows preserve the six drawn balls in their original order plus the special number, that old rows without a date can be paired by period with the normal NFD page, and that SC888 separates `落球` from `大小` for the latest Mark Six draw.

- [x] **Step 2: Run parser tests and verify RED**

Run: `uv run pytest -q tests/test_scraping_sources.py tests/test_scraping_history.py`

Expected: FAIL because the new Mark Six and Daily539 draw-order parsers and URLs do not exist.

- [x] **Step 3: Implement minimal parsers and source selection**

Implement the four interfaces above. Materialize every draw through `_materialize_draw(...)` so the unordered set and special number must exactly match the sorted result. For Mark Six, use SC888 for the newest order and NFD normal plus `FYYYY` pages for complete historical coverage. For algorithm-specific Daily539 history, merge Taiwan Lottery API rows with NFD `39-fYYYY` rows, keeping complete API rows authoritative on duplicate periods. Preserve the ordinary `fetch_history` behavior used by non-algorithm gap repair.

- [x] **Step 4: Run parser tests and verify GREEN**

Run: `uv run pytest -q tests/test_scraping_sources.py tests/test_scraping_history.py`

Expected: all selected tests pass with no fallback that copies sorted numbers into draw-order fields.

### Task 2: Repair history before production algorithms and fail closed in Tiangong

**Files:**
- Modify: `services/matrix-api/app/services/draw_refresh.py`
- Modify: `services/matrix-api/app/worker.py`
- Modify: `services/matrix-api/app/domain/tiangong_artifact.py`
- Test: `services/matrix-api/tests/test_history_backfill.py`
- Test: `services/matrix-api/tests/test_worker.py`
- Test: `services/matrix-api/tests/test_scheduled_worker_resume.py`
- Test: `services/matrix-api/tests/test_tiangong_artifact.py`

**Interfaces:**
- Produces: `DrawRefreshService.ensure_algorithm_history(lottery: str) -> list[dict[str, Any]]`
- Consumes: `LatestDrawSource.fetch_algorithm_history(lottery)` from Task 1, with `DrawSource.fetch_history(lottery, None)` as the test-double fallback
- Preserves: injected test builders do not require production draw-order data

- [x] **Step 1: Write failing backfill and fail-closed tests**

Add tests proving: a production 539/Mark Six history with one missing actual-order row requests full history once and persists the repaired row; an unrepaired row raises `DRAW_ORDER_HISTORY_INCOMPLETE`; 天天樂 does not request draw-order backfill; and Tiangong rejects missing draw order for 539/Mark Six/Lotto649 while still using sorted numbers for 天天樂.

- [x] **Step 2: Run focused tests and verify RED**

Run: `uv run pytest -q tests/test_history_backfill.py tests/test_worker.py tests/test_scheduled_worker_resume.py tests/test_tiangong_artifact.py`

Expected: FAIL because production does not yet repair complete actual-order history and Tiangong still falls back to sorted numbers.

- [x] **Step 3: Implement minimal history gate**

Add `ensure_algorithm_history` after the existing recent-period gap check. For 539/Mark Six/Lotto649, read the complete stored history, bulk fetch only when any row lacks the exact required draw-order count, reread, and fail if any row remains incomplete. For 天天樂, return complete stored sorted history without requesting actual order. Call this gate only for the real production builders before `_run_analysis`; keep dependency-injected unit builders isolated.

- [x] **Step 4: Remove Tiangong's silent fallback**

In `build_tiangong_artifact`, use `drawOrderNumbers` for 539/Mark Six/Lotto649 and `numbers` for 天天樂. Raise `DRAW_ORDER_HISTORY_INCOMPLETE` rather than substituting sorted numbers.

- [x] **Step 5: Run focused tests and verify GREEN**

Run: `uv run pytest -q tests/test_history_backfill.py tests/test_worker.py tests/test_scheduled_worker_resume.py tests/test_tiangong_artifact.py`

Expected: all selected tests pass.

### Task 3: Enable Tiangong artifacts and cut Explore RPCs to v10

**Files:**
- Modify: `supabase/migrations/20260901100000_matrix_explore_v2_ranges.sql`
- Test: `services/matrix-api/tests/test_matrix_explore_migration_contract.py`

**Interfaces:**
- Removes: `public.matrix_analysis_artifacts` constraint `matrix_analysis_artifacts_no_tiangong`
- Preserves: v10 exact `explore_range` storage and entitlement/security checks

- [x] **Step 1: Write the failing migration contract**

Extend the v10 migration contract to require:

```python
assert "drop constraint if exists matrix_analysis_artifacts_no_tiangong" in v10_sql
```

- [x] **Step 2: Run the migration contract and verify RED**

Run: `uv run pytest -q tests/test_matrix_explore_migration_contract.py`

Expected: FAIL because the obsolete blocker is still present in production and the pending v10 migration does not remove it.

- [x] **Step 3: Add the idempotent constraint removal**

Add:

```sql
alter table public.matrix_analysis_artifacts
  drop constraint if exists matrix_analysis_artifacts_no_tiangong;
```

Do not alter any other table policy, role grant, or artifact kind constraint.

- [x] **Step 4: Run the migration contract and verify GREEN**

Run: `uv run pytest -q tests/test_matrix_explore_migration_contract.py`

Expected: all migration contract tests pass.

### Task 4: Verify, integrate, deploy, and run only latest periods

**Files:**
- Verify all files changed in Tasks 1–3
- No frontend files

**Interfaces:**
- Consumes: GitHub `main`, Supabase project `wcimzbbapfrdotjsfyxa`, workflow `.github/workflows/matrix-analysis.yml`
- Produces: four completed latest-period `matrix-python-v10` runs with Explore/Tianyan/Tiangong/status artifacts

- [x] **Step 1: Run focused and full verification**

Run:

```bash
cd services/matrix-api && uv run pytest -q
cd ../.. && npm run test:unit
npm run build
```

Expected: 426 or more Python tests pass, 742 frontend tests pass, and the production build succeeds.

- [x] **Step 2: Review diff and synchronize current main**

Fetch `origin/main`, inspect overlap against the worktree base, and integrate without force push, reset, or unrelated revert.

- [ ] **Step 3: Commit and push tested source**

Commit only the plan, source, tests, and pending migration changes; merge cleanly to `main` and push.

- [ ] **Step 4: Apply the pending v10 migration**

Apply the exact checked-in `20260901100000_matrix_explore_v2_ranges.sql` to Supabase. Verify `matrix_explore_list` pins `matrix-python-v10`, `explore_range` is constrained and indexed, and `matrix_analysis_artifacts_no_tiangong` no longer exists.

- [ ] **Step 5: Dispatch the existing four-lottery workflow once**

Trigger `.github/workflows/matrix-analysis.yml` with `workflow_dispatch`. This runs each lottery's current latest draw only; it does not create yesterday or day-before runs.

- [ ] **Step 6: Verify production acceptance**

For each lottery, require the newest stored draw period to match a complete run whose version is `<period>:matrix-python-v10`. Require exactly one artifact of each kind `explore`, `tianyan`, `tiangong`, and `status`; require Tiangong payload version `tiangong-two-stage-near-2-to-3-v2.0.0`; require v8/v9 result counts to remain zero. If any condition fails, do not report the algorithms as fully online.
