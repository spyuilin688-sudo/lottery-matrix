# Matrix Explore Canonical v12 Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the production Explore v11 runtime with the approved canonical state-machine engine without introducing a second HTTP service, while preserving the existing artifact/Supabase/PWA contract.

**Architecture:** Port the approved canonical engine into `services/matrix-api/app/domain/explore_engine.py`. Keep Railway Worker → AnalysisPipeline → artifact builder → repository as the production path. The new engine must emit the existing Explore artifact shape so Tianyan, Matrix Status, repository persistence, and frontend RPC consumers do not require an algorithm-specific rewrite.

**Tech Stack:** Python 3.12, pytest, existing Matrix API service, Supabase/Postgres migrations, GitHub Actions.

**Spec:** `docs/specs/Matrix_Explore_Canonical_v12_20260902.md`

## Global Constraints

- No global `B ∪ C` pair enumeration, `itertools.combinations`, or `best_pair` selection.
- `globalPairEnumerations` must remain `0`.
- 準4+ requires exactly one final highest rule; streak >= 8 invalidates the cell without truncation.
- 準5+ uses incremental anchor/second-candidate states; second rule may first form at any later legal occurrence; streak >= 12 invalidates that pair without truncation.
- Same validation occurrence with two rules counts as one continuation.
- Parallel highest states must all be retained until final distinct-rule evaluation; >2 distinct highest rules invalidates the cell.
- `+0` is valid for both 加減 and 拖牌.
- Standard/full share full-range candidate construction; drag never builds range cells.
- The full supplied history is indexed; 8/12 are path termination boundaries, not global history caps.
- 13 source periods are computed once; 2/7/13 are query filters.
- Do not directly modify `main`; work only on `work/explore-canonical-v12-rebuild` until verified.
- Existing executed migration history is immutable; v12 changes use forward migrations.

---

### Task 1: Lock canonical state-machine behavior with RED tests

**Files:**
- Create: `services/matrix-api/tests/test_explore_canonical_v12.py`
- Read: `services/matrix-api/app/domain/explore_v2.py`

**Interfaces:**
- Consumes: desired `app.domain.explore_engine.evaluate_one_code`, `evaluate_two_code`, `EngineMetrics`.
- Produces: executable contract for one-code exactness, delayed second-rule formation, all-top-state retention, no global pair enumeration, +0, and max-streak boundaries.

- [ ] Write tests importing `app.domain.explore_engine`; include cases: one-code two tied longest invalid, B/C no common then later two-code formation, B/C/D/E first rule with F second rule, F first+second same occurrence, >2 top rules invalid, same-number prediction from two rules, 12+ invalid, single-use endpoint rule, metrics `globalPairEnumerations == 0`.
- [ ] Push test-only commit and verify the Matrix API CI job fails because `explore_engine` does not exist.
- [ ] Record the RED job URL/commit before production implementation.

### Task 2: Port the canonical core with existing domain conventions

**Files:**
- Create: `services/matrix-api/app/domain/explore_engine.py`
- Test: `services/matrix-api/tests/test_explore_canonical_v12.py`

**Interfaces:**
- Produces: `RoadType`, `ScopeClass`, `EngineMetrics`, `ExploreEngineSession`, `evaluate_one_code`, `evaluate_two_code`, `run_explore_batch`.
- `run_explore_batch(lottery, newest_first, start, limit, *, road_types=..., session=None)` returns the current checkpoint/artifact contract.

- [ ] Implement candidate math and one-code state machine sufficient for the first RED cases.
- [ ] Run targeted tests until one-code cases are GREEN.
- [ ] Implement incremental two-code anchor/second-candidate state machine without N-choose-2 pre-expansion.
- [ ] Preserve all top pairs until final rule-union evaluation.
- [ ] Run targeted tests until all canonical state-machine cases are GREEN.
- [ ] Commit only after targeted tests pass.

### Task 3: Port indexed history, range cache, drag isolation, and canonical artifact assembly

**Files:**
- Modify: `services/matrix-api/app/domain/explore_engine.py`
- Create/modify tests: `services/matrix-api/tests/test_explore_canonical_v12.py`

**Interfaces:**
- Produces session-level occurrence index and 13 source units compatible with checkpoint processing.
- Artifact keys remain `lottery`, `drawPeriod`, `items`, `validationById`, `tianyanItems`, `tianyanValidationById`.

- [ ] Add RED tests proving full history is indexed, 13 sources are built once, standard/full reuse candidate construction, and drag-only runs build zero range cells.
- [ ] Implement caches and artifact result ID/deduplication.
- [ ] Preserve existing Tianyan prepared-coordinate contract so downstream Tianyan builder remains functional.
- [ ] Verify targeted engine and artifact tests GREEN.

### Task 4: Cut artifact runtime to the canonical engine and bump analysis version

**Files:**
- Modify: `services/matrix-api/app/services/artifact_builders.py`
- Modify: `services/matrix-api/app/worker.py`
- Modify: existing artifact/worker/version tests as required.

**Interfaces:**
- Artifact builder defaults to `ExploreEngineSession` + `run_explore_batch`.
- Worker analysis version becomes `matrix-python-v12`.

- [ ] Add RED contract tests that production builder imports canonical engine and Worker uses v12.
- [ ] Switch imports/session cache/default runner.
- [ ] Change `ANALYSIS_VERSION` to `matrix-python-v12`.
- [ ] Run Matrix API targeted + full tests.

### Task 5: Add v12 Supabase RPC forward migration

**Files:**
- Create: `supabase/migrations/20260902xxxxxx_matrix_explore_v12_rpc.sql`
- Modify/add migration contract tests.

**Interfaces:**
- `matrix_explore_list(jsonb)` selects completed `draw_period || ':matrix-python-v12'` runs.
- `matrix_explore_validation(jsonb)` rejects non-v12 analysis versions.
- Existing request/response field names remain compatible with the current frontend.

- [ ] Add RED migration contract test for v12 version selection and current draw-date ordering behavior.
- [ ] Create forward migration based on latest v11 RPC migration, changing only version/runtime semantics needed for v12.
- [ ] Do not delete old migration files.
- [ ] Run migration contract tests.

### Task 6: Remove old algorithm runtime and obsolete v11-specific algorithm tests

**Files:**
- Delete after all callers are migrated: `services/matrix-api/app/domain/explore_v2.py`
- Delete only tests whose sole purpose is the removed v11 implementation; preserve reusable behavioral tests by porting them to canonical v12 first.
- Search all repository runtime references.

**Interfaces:**
- No production import/reference to `explore_v2`, `ExploreV2Session`, or `run_explore_v2_batch` remains.

- [ ] Port any still-valid v11 behavioral assertions to v12 tests before deleting their old test files.
- [ ] Delete old engine and old-only tests.
- [ ] Search repository for old runtime symbols and require zero production hits.
- [ ] Run full Matrix API and project CI.

### Task 7: Production data transition and verification

**Files/Systems:**
- Supabase runtime data via connector after schema inspection.
- Railway deployment/runtime after merge/deploy path is approved.

**Interfaces:**
- v12 results are freshly generated; no v11 row may satisfy v12 RPC queries.

- [ ] Inspect exact Supabase tables/FKs before any delete.
- [ ] Recompute current/previous Explore periods under v12 in a safe validation run.
- [ ] Compare known manual cases and result counts for anomaly detection; do not truncate by count.
- [ ] Only after v12 data/API verification, create forward cleanup migration/operation for obsolete v11 runtime result rows if still required.
- [ ] Verify Explore list, validation, Tianyan, and Matrix Status against v12 data.

### Task 8: Completion gate

**Files:** all changed files.

- [ ] Rebase/merge latest `main` into the work branch without force/reset and resolve only real conflicts.
- [ ] Run full GitHub Project CI and Matrix API tests from the final head.
- [ ] Run repository search proving no production v11 Explore engine references remain.
- [ ] Review PR diff for unrelated UI/PWA changes; there must be none.
- [ ] Do not merge to `main` until these checks are green and the user authorizes merge.
