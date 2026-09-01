# Matrix Explore v2 API Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the production Matrix Explore calculation path with the complete v2 three-road algorithm while preserving the existing PWA RPC contract.

**Architecture:** Build one immutable full-history context per lottery and number order, reuse one occurrence index and one full-range cell cache across all thirteen source periods, then evaluate standard and full scopes independently through shared one-code and two-code state machines. Persist only fully validated final rows, tagged internally by explore range, and make the existing RPCs read the requested range directly.

**Tech Stack:** Python 3.12, pytest, Supabase PostgreSQL/PLpgSQL, existing Railway worker and artifact pipeline.

**Spec:** `docs/superpowers/specs/2026-09-01-explore-v2-api-replacement-design.md`; authoritative rules: `docs/specs/Matrix_探索功能_三版路演算法_API_完整修正版_v2_20260901.md`

## Global Constraints

- The authoritative v2 specification sections 1–33 are mandatory and may not be summarized away.
- Full history has no 30, 80, 100, or other fixed draw limit.
- Thirteen source periods, occurrence indexes, and reusable range cells are calculated once.
- Standard and full scopes share base cells/candidates but independently decide common values, streaks, and validity.
- Drag reads only the locked cell; add and sum exclude the locked cell and share full-range cells.
- No Cartesian product, no pair expansion for more than two equal-longest values, and no intermediate candidate persistence.
- Existing frontend request and response fields remain unchanged.
- The worker and both Explore RPCs must use the same new analysis version.
- Until complete real-history comparison is performed, completion means specification tests passed, not algorithm correctness proven.

---

### Task 1: Add v2 domain data structures and deterministic number operations

**Files:**
- Create: `services/matrix-api/app/domain/explore_v2.py`
- Create: `services/matrix-api/tests/test_explore_v2_core.py`

**Interfaces:**
- Produces: `LockKey`, `LockOccurrence`, `VerificationCell`, `ScopeClass`, `RoadType`, `candidate_value()`, `apply_candidate()`, and `ordered_numbers()`.
- Consumes: `lottery_maximum()` and `lottery_position_count()` from `app.domain.models`.

- [ ] **Step 1: Write failing tests for types, +0, cyclic add, full sum, and number order**

```python
def test_add_and_drag_keep_zero_and_wrap_by_lottery_maximum() -> None:
    assert candidate_value("加減", 20, 20, 39) == 0
    assert candidate_value("拖牌", 20, 20, 39) == 0
    assert apply_candidate("加減", 39, 1, 39) == 1

def test_sum_keeps_the_complete_value_and_returns_a_legal_prediction() -> None:
    assert candidate_value("合值", 39, 39, 39) == 78
    assert apply_candidate("合值", 39, 78, 39) == 39

def test_verification_cell_records_scope_and_coordinates() -> None:
    cell = VerificationCell(7, "114200", -8, 4, 20, ScopeClass.FULL_ONLY)
    assert cell.relative_offset == -8
    assert cell.scope_class is ScopeClass.FULL_ONLY
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `cd services/matrix-api && uv run pytest tests/test_explore_v2_core.py -q`

Expected: FAIL because `app.domain.explore_v2` does not exist.

- [ ] **Step 3: Implement the immutable core types and operations**

```python
class ScopeClass(StrEnum):
    STANDARD_AND_FULL = "STANDARD_AND_FULL"
    FULL_ONLY = "FULL_ONLY"

class RoadType(StrEnum):
    ADD = "加減"
    SUM = "合值"
    DRAG = "拖牌"

@dataclass(frozen=True, slots=True)
class LockKey:
    lottery: str
    sort_mode: str
    position: int
    number: int

@dataclass(frozen=True, slots=True)
class LockOccurrence:
    draw_index: int
    period: str
    position: int
    number: int

@dataclass(frozen=True, slots=True)
class VerificationCell:
    occurrence_index: int
    period: str
    relative_offset: int
    position: int
    number: int
    scope_class: ScopeClass
```

Implement `candidate_value` and `apply_candidate` exactly from v2 sections 8–10 and normalize sorted/draw-order values without substituting sorted data for missing draw-order data.

- [ ] **Step 4: Run the focused tests**

Run: `cd services/matrix-api && uv run pytest tests/test_explore_v2_core.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/matrix-api/app/domain/explore_v2.py services/matrix-api/tests/test_explore_v2_core.py
git commit -m "feat: add explore v2 domain primitives"
```

---

### Task 2: Build one full-history index, thirteen-source batch, and reusable scope cells

**Files:**
- Modify: `services/matrix-api/app/domain/explore_v2.py`
- Modify: `services/matrix-api/tests/test_explore_v2_core.py`
- Create: `services/matrix-api/tests/test_explore_v2_efficiency.py`

**Interfaces:**
- Consumes: Task 1 types and number operations.
- Produces: `ExploreV2Context.build(lottery, number_order, newest_first)`, `occurrences_for(key)`, `source_units()`, `range_cells(occurrence, prediction_distance)`, and `drag_cell(occurrence)`.

- [ ] **Step 1: Write failing tests for full history, source counts, scope classes, and cache reuse**

```python
def test_occurrence_search_uses_history_older_than_one_hundred_draws() -> None:
    context = ExploreV2Context.build("今彩539", SORTED_ORDER, history_with_match_at(130))
    assert context.occurrences_for(LockKey("今彩539", SORTED_ORDER, 1, 10))[-1].period == "old-match"

@pytest.mark.parametrize(("lottery", "order", "count"), [
    ("今彩539", SORTED_ORDER, 65),
    ("天天樂", SORTED_ORDER, 65),
    ("六合彩", SORTED_ORDER, 91),
    ("大樂透", SORTED_ORDER, 91),
])
def test_thirteen_source_units_are_built_once(lottery: str, order: str, count: int) -> None:
    context = ExploreV2Context.build(lottery, order, complete_history(lottery, 30))
    assert len(context.source_units()) == count

def test_full_cells_are_cached_and_standard_filters_only_full_only_cells() -> None:
    context = ExploreV2Context.build("今彩539", SORTED_ORDER, complete_history("今彩539", 40))
    occurrence = context.occurrences_for(context.source_units()[0].lock_key)[1]
    first = context.range_cells(occurrence, 2)
    second = context.range_cells(occurrence, 2)
    assert first is second
    assert {cell.relative_offset for cell in first if cell.scope_class is ScopeClass.FULL_ONLY} == set(range(-14, -7))
```

Add counters to the test context and assert occurrence-index builds equal one and each range-cache key builds equal one.

- [ ] **Step 2: Run the tests and verify failure**

Run: `cd services/matrix-api && uv run pytest tests/test_explore_v2_core.py tests/test_explore_v2_efficiency.py -q`

Expected: FAIL because `ExploreV2Context` is absent.

- [ ] **Step 3: Implement the context and caches**

Use these exact cache keys:

```python
_occurrence_index: dict[LockKey, tuple[LockOccurrence, ...]]
_range_cache: dict[tuple[int, int], tuple[VerificationCell, ...]]
_drag_cache: dict[int, VerificationCell]
```

Build source units from the latest thirteen opened draws. For each range cache entry, create upper offsets -14 through -1, legal same-period positions, and lower offsets 1 through `prediction_distance - 1`; exclude the result draw and locked cell. Label upper -14 through -8 as `FULL_ONLY`, all other cells as `STANDARD_AND_FULL`.

- [ ] **Step 4: Run focused tests**

Run: `cd services/matrix-api && uv run pytest tests/test_explore_v2_core.py tests/test_explore_v2_efficiency.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/matrix-api/app/domain/explore_v2.py services/matrix-api/tests/test_explore_v2_core.py services/matrix-api/tests/test_explore_v2_efficiency.py
git commit -m "feat: index complete explore history once"
```

---

### Task 3: Implement v2 one-code and two-code incremental state machines

**Files:**
- Modify: `services/matrix-api/app/domain/explore_v2.py`
- Create: `services/matrix-api/tests/test_explore_v2_state_machine.py`

**Interfaces:**
- Consumes: ordered per-occurrence candidate sets from Task 2.
- Produces: `evaluate_one_code(groups)` and `evaluate_two_code(groups)`, each returning `StreakDecision(valid, highest_streak, rules, reason, matched_group_indexes)`.

- [ ] **Step 1: Write failing one-code boundary tests**

```python
@pytest.mark.parametrize("length", [4, 5, 6, 7])
def test_one_code_accepts_only_legal_streaks(length: int) -> None:
    assert evaluate_one_code(repeated_groups({5}, length)).highest_streak == length

def test_one_code_rejects_no_b_c_intersection_and_eight_or_more() -> None:
    assert not evaluate_one_code([{1}, {2}, {1}, {1}]).valid
    decision = evaluate_one_code(repeated_groups({5}, 8))
    assert not decision.valid
    assert decision.highest_streak == 8
```

- [ ] **Step 2: Write failing two-code state tests**

```python
def test_second_rule_may_first_appear_at_f() -> None:
    groups = [{10, 24}, {10}, {10}, {10}, {10, 24}, {10}]
    decision = evaluate_two_code(groups)
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 6

def test_two_hits_in_one_group_count_as_one_streak() -> None:
    decision = evaluate_two_code([{10}, {24}, {10, 24}, {10}, {24}])
    assert decision.highest_streak == 5

def test_more_than_two_equal_longest_values_invalidates_whole_road() -> None:
    decision = evaluate_two_code([{10, 15, 20}] * 5)
    assert not decision.valid
    assert decision.reason == INVALID_MORE_THAN_TWO_LONGEST

def test_single_use_rule_is_valid_only_in_the_middle() -> None:
    assert not evaluate_two_code([{24}, {10}, {10}, {10}, {10}]).valid
    assert evaluate_two_code([{10}, {24}, {10}, {10}, {10}]).valid
    assert not evaluate_two_code([{10}, {10}, {10}, {10}, {24}]).valid
```

Cover B/C no common then D first common, late second rule, no second rule, legal 5/6/7/9/11, rejected 8/10, and 12+ invalid without truncation.

- [ ] **Step 3: Run tests and verify failure**

Run: `cd services/matrix-api && uv run pytest tests/test_explore_v2_state_machine.py -q`

Expected: FAIL because state-machine functions are absent.

- [ ] **Step 4: Implement incremental state transitions without global pair expansion**

Represent active states as immutable records containing at most one fixed rule plus one bounded second-rule candidate set before the second rule is fixed. Once two rules are fixed, advance only that pair. Stop only when all legal states end or the invalid maximum is confirmed. After all states end, compare actual longest values, reject more than two, then enforce exact rule count and single-use placement.

- [ ] **Step 5: Run focused tests**

Run: `cd services/matrix-api && uv run pytest tests/test_explore_v2_state_machine.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/matrix-api/app/domain/explore_v2.py services/matrix-api/tests/test_explore_v2_state_machine.py
git commit -m "feat: implement explore v2 streak states"
```

---

### Task 4: Produce standard and full final results from one shared calculation

**Files:**
- Modify: `services/matrix-api/app/domain/explore_v2.py`
- Create: `services/matrix-api/tests/test_explore_v2_runner.py`

**Interfaces:**
- Consumes: `ExploreV2Context`, range/drag builders, and state machines.
- Produces: `run_explore_v2_batch(lottery, newest_first, start, limit) -> dict` with the existing artifact item and validation shapes plus internal `exploreRange`.

- [ ] **Step 1: Write failing tests for separate scope decisions and final-only output**

```python
def test_standard_and_full_share_cells_but_decide_validity_independently() -> None:
    result = run_fixture_with_only_full_only_evidence()
    assert result.items_for("完整範圍")
    assert result.items_for("標準範圍") == []
    assert result.metrics["rangeCellBuilds"] == result.metrics["uniqueRangeKeys"]

def test_invalid_and_intermediate_candidates_never_enter_items() -> None:
    result = run_fixture_with_three_equal_longest_values()
    assert result["items"] == []
    assert result["validationById"] == {}

def test_two_rules_predicting_one_number_emit_one_number() -> None:
    item = run_fixture_with_same_prediction()["items"][0]
    assert item["ruleCount"] == 2
    assert len(item["predictionNumbers"]) == 1
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd services/matrix-api && uv run pytest tests/test_explore_v2_runner.py -q`

Expected: FAIL because `run_explore_v2_batch` is absent.

- [ ] **Step 3: Implement candidate building, both scope evaluations, validation, IDs, and sorting**

For each source lock, fetch occurrences once. Build drag groups from locked cells. Build add/sum candidate maps from each cached range cell once, then filter candidates by scope and run the state machine independently. Include `exploreRange` in the internal item and item ID. Sort final items by descending `highestStreak`, ascending `predictionDistance`, and ascending `lockedPosition`; sort two rules and predictions numerically and format rules with a dot.

- [ ] **Step 4: Add every v2 section 30 and 31 case to the runner test**

Create parametrized cases for all eight one-code cases, fourteen two-code cases, and ten scope/performance cases. Each case asserts both the positive result and the prohibited result absence.

- [ ] **Step 5: Run focused tests**

Run: `cd services/matrix-api && uv run pytest tests/test_explore_v2_runner.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/matrix-api/app/domain/explore_v2.py services/matrix-api/tests/test_explore_v2_runner.py
git commit -m "feat: finalize explore v2 scope results"
```

---

### Task 5: Replace the production artifact path and persist range-specific final rows

**Files:**
- Modify: `services/matrix-api/app/services/artifact_builders.py`
- Modify: `services/matrix-api/app/services/explore_batches.py`
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Modify: `services/matrix-api/tests/test_artifact_builders.py`
- Modify: `services/matrix-api/tests/test_explore_batches.py`
- Modify: `services/matrix-api/tests/test_analysis_repository.py`
- Modify: `services/matrix-api/tests/test_status_artifact_sources.py`

**Interfaces:**
- Consumes: `run_explore_v2_batch` from Task 4.
- Produces: the existing chunk/artifact contract, records with internal `explore_range`, and Matrix Status inputs derived only from full-range Explore items.

- [ ] **Step 1: Write failing integration tests**

```python
def test_artifact_builder_calls_one_v2_batch_runner_per_checkpoint() -> None:
    calls = []
    builder = create_artifact_builders(explore_batch_runner=lambda **kwargs: calls.append(kwargs) or empty_batch())
    builder["explore"](checkpoint_context(start=0, limit=10))
    assert len(calls) == 1

def test_repository_stores_scope_column_but_not_scope_in_public_item() -> None:
    record = _explore_result_records("今彩539", "114200", "114200:matrix-python-v10", payload_with_range(), "expiry")[0]
    assert record["explore_range"] == "標準範圍"
    assert "exploreRange" not in record["item"]

def test_status_uses_only_full_range_explore_results() -> None:
    status = _status_artifact(artifact_with_both_ranges(), empty_tianyan())
    assert {item["id"] for item in status["statusSources"]["explore"]["items"]} == {"full-id"}
```

- [ ] **Step 2: Run integration tests and verify failure**

Run: `cd services/matrix-api && uv run pytest tests/test_artifact_builders.py tests/test_explore_batches.py tests/test_analysis_repository.py tests/test_status_artifact_sources.py -q`

Expected: FAIL because the production path still imports `explore_shared_v8` and records lack `explore_range`.

- [ ] **Step 3: Wire the v2 batch runner and preserve checkpoint behavior**

Replace the production import with `run_explore_v2_batch`. Keep existing `cursorStart`, `cursor`, `total`, and `complete` keys. Preserve the injectable per-unit runner only for legacy tests if required; production must call the batch runner once per checkpoint.

- [ ] **Step 4: Persist only final rows with internal range**

Set `record["explore_range"] = item["exploreRange"]`; build `record["item"]` from the item excluding `exploreRange`. Ensure validation stays keyed by the range-specific item ID. Filter Matrix Status and compact status sources to `exploreRange == "完整範圍"`.

- [ ] **Step 5: Run integration tests**

Run: `cd services/matrix-api && uv run pytest tests/test_artifact_builders.py tests/test_explore_batches.py tests/test_analysis_repository.py tests/test_status_artifact_sources.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/matrix-api/app/services/artifact_builders.py services/matrix-api/app/services/explore_batches.py services/matrix-api/app/repositories/analysis_repository.py services/matrix-api/tests/test_artifact_builders.py services/matrix-api/tests/test_explore_batches.py services/matrix-api/tests/test_analysis_repository.py services/matrix-api/tests/test_status_artifact_sources.py
git commit -m "feat: publish explore v2 final artifacts"
```

---

### Task 6: Cut Worker and Explore RPCs over atomically to matrix-python-v10

**Files:**
- Create: `supabase/migrations/20260901100000_matrix_explore_v2_ranges.sql`
- Modify: `services/matrix-api/app/worker.py`
- Modify: `services/matrix-api/tests/test_analysis_version_progress.py`
- Modify: `services/matrix-api/tests/test_worker.py`
- Modify: `services/matrix-api/tests/test_scheduled_worker_resume.py`
- Modify: `services/matrix-api/tests/test_matrix_explore_migration_contract.py`
- Modify: `tests/supabase-rpc-security.test.mjs`
- Modify: `tests/requested-history-and-explore-data.test.mjs`

**Interfaces:**
- Consumes: final Explore rows from Task 5.
- Produces: `matrix_explore_results.explore_range`, v10 worker artifacts, and existing RPC responses selected by exact requested range.

- [ ] **Step 1: Write failing migration/version contract tests**

```python
assert "add column if not exists explore_range text" in V10_SQL
assert "result.explore_range = v_range" in _function_definition(V10_SQL, "matrix_explore_list")
assert "result.explore_range = v_range" in _function_definition(V10_SQL, "matrix_explore_validation")
assert "reference_offset, 0) >= -7" not in V10_SQL
assert "matrix-python-v10" in V10_SQL
assert ANALYSIS_VERSION == "matrix-python-v10"
```

Also assert both functions remain `security definer`, `set search_path = ''`, complete-run-only, entitlement-checked, and explicitly granted only as before.

- [ ] **Step 2: Run focused contract tests and verify failure**

Run: `cd services/matrix-api && uv run pytest tests/test_analysis_version_progress.py tests/test_worker.py tests/test_scheduled_worker_resume.py tests/test_matrix_explore_migration_contract.py -q`

Expected: FAIL because the worker is v9 and no v10 range migration exists.

- [ ] **Step 3: Add the additive migration**

Add a non-null checked `explore_range` column after backfilling existing rows to `完整範圍`, update the list and validation RPC definitions to require `result.explore_range = v_range`, remove derived standard filtering by reference offset, add range to the list index, preserve permissions, and require only complete `matrix-python-v10` runs.

- [ ] **Step 4: Bump the worker and update exact version tests**

Set:

```python
ANALYSIS_VERSION = "matrix-python-v10"
```

Update resume/progress tests so v9 is legacy and v10 is current.

- [ ] **Step 5: Run backend and Node contract tests**

Run: `cd services/matrix-api && uv run pytest tests/test_analysis_version_progress.py tests/test_worker.py tests/test_scheduled_worker_resume.py tests/test_matrix_explore_migration_contract.py -q`

Run: `node --test tests/supabase-rpc-security.test.mjs tests/requested-history-and-explore-data.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260901100000_matrix_explore_v2_ranges.sql services/matrix-api/app/worker.py services/matrix-api/tests/test_analysis_version_progress.py services/matrix-api/tests/test_worker.py services/matrix-api/tests/test_scheduled_worker_resume.py services/matrix-api/tests/test_matrix_explore_migration_contract.py tests/supabase-rpc-security.test.mjs tests/requested-history-and-explore-data.test.mjs
git commit -m "feat: cut explore RPCs over to v10"
```

---

### Task 7: Remove the old production path and verify the complete replacement

**Files:**
- Modify: `services/matrix-api/tests/test_explore_v2_efficiency.py`
- Modify: `services/matrix-api/tests/test_explore_v2_runner.py`
- Modify: `services/matrix-api/README.md`
- Delete when no production/test imports remain: `services/matrix-api/app/domain/explore_shared_v8.py`
- Delete when no production/test imports remain: `services/matrix-api/app/domain/explore_shared.py`
- Modify or replace imports in: `services/matrix-api/tests/test_explore_shared.py`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: one production Explore engine, complete verification evidence, and no active v8/shared algorithm route.

- [ ] **Step 1: Add source guards against old production logic and fixed history windows**

```python
def test_production_has_no_old_explore_runner_or_fixed_explore_history_limit() -> None:
    source = Path("app/services/artifact_builders.py").read_text()
    assert "explore_shared_v8" not in source
    assert "run_explore_v2_batch" in source
    engine = Path("app/domain/explore_v2.py").read_text()
    assert "TIANYAN_HISTORY_LIMIT" not in engine
```

Add a counter-based test proving one occurrence-index build, one range build per unique key, no pair-list materialization, and zero persisted invalid/intermediate rows.

- [ ] **Step 2: Run all v2 tests**

Run: `cd services/matrix-api && uv run pytest tests/test_explore_v2_core.py tests/test_explore_v2_efficiency.py tests/test_explore_v2_state_machine.py tests/test_explore_v2_runner.py -q`

Expected: PASS.

- [ ] **Step 3: Remove unused old production modules and update documentation**

Use `rg` to confirm no remaining production or test import of `explore_shared_v8` or `explore_shared`, then delete them. Update the README to name v2 as the Explore/Status shared core and state that real-history verification remains incomplete.

- [ ] **Step 4: Run the complete backend suite**

Run: `cd services/matrix-api && uv run pytest`

Expected: all tests pass; the pre-change baseline was 369 passed.

- [ ] **Step 5: Run repository contract checks and build**

Run: `npm run test:unit -- src/matrix-algorithm-api.test.ts src/matrix-explore-rpc.test.ts`

Run: `node --test tests/supabase-rpc-security.test.mjs tests/requested-history-and-explore-data.test.mjs`

Run: `npm run build:pages`

Expected: changed-scope checks pass. Record any unrelated pre-existing frontend failures separately; do not modify unrelated UI files.

- [ ] **Step 6: Check diff, version references, and forbidden patterns**

Run:

```bash
git diff --check
rg -n "explore_shared_v8|TIANYAN_HISTORY_LIMIT|matrix-python-v8|matrix-python-v9|reference_offset, 0\) >= -7" services/matrix-api/app services/matrix-api/tests supabase/migrations/20260901100000_matrix_explore_v2_ranges.sql tests
```

Expected: no old production Explore runner, no fixed Explore history limit, v8/v9 only in explicit legacy migration/progress assertions, and no derived standard-range filter in the v10 RPC.

- [ ] **Step 7: Commit**

```bash
git add services/matrix-api services/matrix-api/README.md
git commit -m "test: verify complete explore v2 replacement"
```
