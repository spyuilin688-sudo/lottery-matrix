# Matrix 天衡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增固定使用兩個來源鎖定條件的 Matrix 天衡演算法、同一次背景分析階段、Supabase 結果 RPC，以及完全比照 Matrix 探索的手機頁面。

**Architecture:** 在既有 `matrix-python-v12` 探索核心旁新增獨立 `tianheng` domain/runtime 與批次 phase，重用同一次歷史資料解析及 Explore engine session，但以雙位置雙號碼索引回推。天衡結果正規化到獨立資料表，由獨立 list/validation RPC 提供；前端擴充既有 MatrixExplorePage 的頁面模式，保留探索版面與互動，只替換期數、連準選項、雙鎖定欄位及兩列摘要。

**Tech Stack:** Python 3.12、pytest、React 19、TypeScript 7、Vitest、Supabase PostgreSQL 17。

**Spec:** `docs/superpowers/specs/2026-09-10-matrix-tianheng-design.md`

## Global Constraints

- 除規格列出的差異外，所有規則、設定、版面、間距、字型、大小及互動完全比照 Matrix 探索。
- 每個天衡來源條件固定包含兩個不同位置及其號碼，依位置由前到後排列。
- 天衡只提供三期、十三期；三期權限比照探索二期，十三期權限比照探索十三期。
- 天衡拖牌以靠前鎖定條件的同期位置作為基準；`XX.XX` 必須是回推規則值，不得直接使用兩個鎖定號碼。
- Matrix 狀態不得納入天衡結果。
- 使用既有資產 `public/assets/lottery/functions/天衡標題K.png` 與 `public/assets/lottery/functions/天衡.png`，不得產生替代圖片。
- 僅執行與本功能直接相關的具名測試檔，不執行全專案測試。

---

## File Structure

### Create

- `services/matrix-api/app/domain/tianheng_context.py`：雙鎖定索引、來源單位、歷史出現、範圍 cell 與拖牌 cell。
- `services/matrix-api/app/domain/tianheng_runtime.py`：天衡候選規則、連準判定、結果及驗證 artifact。
- `services/matrix-api/tests/test_tianheng_state.py`：天衡連準層級與 Explore 預設回歸測試。
- `services/matrix-api/tests/test_tianheng_context.py`：雙鎖定組合、精確回推、範圍排除與拖牌基準測試。
- `services/matrix-api/tests/test_tianheng_runtime.py`：三種版路、結果契約及驗證資料測試。
- `services/matrix-api/tests/test_tianheng_pipeline.py`：同一分析任務、批次續跑、正規化保存測試。
- `supabase/migrations/20260910233000_matrix_tianheng.sql`：資料表、索引、清理、私有實作、公開防護 RPC 與 ACL。
- `tests/matrix-tianheng-migration.test.mjs`：migration、RPC、版本及 ACL 契約測試。
- `src/matrix-algorithm-api.tianheng.test.ts`：天衡 RPC request、normalize、快取範圍及三期訪客行為測試。
- `src/__tests__/MatrixTianhengPage.test.tsx`：路由、設定、結果、摘要、詞綴及驗證展開測試。
- `src/matrix-tianheng.css`：雙鎖定結果 cell 與兩列摘要的必要差異樣式。

### Modify

- `services/matrix-api/app/domain/explore_state.py`：讓既有一碼／二碼連準判定接受具名層級參數，同時保留 Explore 預設值。
- `services/matrix-api/app/services/artifact_builders.py`：建立 `tianheng` 批次 builder，重用 Explore engine session。
- `services/matrix-api/app/services/analysis_pipeline.py`：支援 `explore` 與 `tianheng` 兩個可續跑批次 phase。
- `services/matrix-api/app/repositories/analysis_repository.py`：新增天衡 artifact kind、結果正規化、save/has repository 介面及實作。
- `services/matrix-api/app/analysis_worker.py`：完整 run 缺少正規化結果時，同時修復 Explore 與天衡結果。
- `services/matrix-api/app/worker.py`：分析版本由 `matrix-python-v12` 升為 `matrix-python-v13`。
- `services/matrix-api/README.md`：記錄 v13、天衡 phase 與結果儲存。
- `src/matrix-algorithm-api.ts`：新增天衡 types、list/validation 呼叫及三期快取權限。
- `src/features/navigation.tsx`：新增 `tianheng` ScreenId。
- `src/features/shared.tsx`：新增天衡切換項目、標題資產與 current type。
- `src/features/router.tsx`：新增 Matrix 天衡靜態路由。
- `src/features/MatrixExplorePage.tsx`：新增天衡頁面模式、設定差異、雙鎖定結果與驗證呼叫。
- `src/features/MatrixValidation.tsx`：新增 `TianhengValidationProcess` 與兩列摘要。
- `src/main.tsx`：載入天衡差異樣式。

---

### Task 1: Parameterize streak evaluation without changing Explore

**Files:**
- Create: `services/matrix-api/tests/test_tianheng_state.py`
- Modify: `services/matrix-api/app/domain/explore_state.py`

**Interfaces:**
- Consumes: existing `StreakDecision`, `_incremental_pair_scores`, `_endpoint_invalid`.
- Produces: `evaluate_one_code(groups, *, eligible_streaks=frozenset({4,5,6,7}), invalid_streak=8, tier_label="準4+", invalid_reason=INVALID_ONE_CODE_MAXIMUM)` and `evaluate_two_code(groups, metrics=None, *, eligible_streaks=frozenset({5,6,7,9,11}), invalid_streak=12, tier_label="準5+")`.

- [ ] **Step 1: Write failing tests for Tianheng levels and Explore defaults**

~~~python
from app.domain.explore_state import evaluate_one_code, evaluate_two_code


def test_tianheng_one_rule_accepts_nine_but_not_eight():
    accepted = evaluate_one_code(
        [{18}] * 9 + [set()],
        eligible_streaks=frozenset({5, 6, 7, 9}),
        invalid_streak=10,
        tier_label="準5+",
    )
    rejected = evaluate_one_code(
        [{18}] * 8 + [set()],
        eligible_streaks=frozenset({5, 6, 7, 9}),
        invalid_streak=10,
        tier_label="準5+",
    )
    assert accepted.valid and accepted.highest_streak == 9
    assert not rejected.valid and rejected.highest_streak == 8


def test_explore_default_still_rejects_eight():
    decision = evaluate_one_code([{18}] * 8)
    assert not decision.valid
    assert decision.highest_streak == 8


def test_tianheng_two_rules_accepts_only_requested_levels():
    decision = evaluate_two_code(
        [{18}, {20}, {18, 20}, {18, 20}, {18, 20}, {18, 20}],
        eligible_streaks=frozenset({6, 7, 9, 11}),
        invalid_streak=12,
        tier_label="準7+",
    )
    assert decision.valid
    assert decision.highest_streak == 6
    assert decision.rules == (18, 20)
~~~

- [ ] **Step 2: Run the state tests and verify failure**

Run:

~~~bash
cd services/matrix-api
python -m pytest tests/test_tianheng_state.py -q
~~~

Expected: FAIL because the evaluator functions do not accept the new keyword arguments.

- [ ] **Step 3: Add explicit configurable parameters while retaining exact defaults**

~~~python
def evaluate_one_code(
    groups: Iterable[Iterable[int]],
    *,
    eligible_streaks: frozenset[int] = frozenset({4, 5, 6, 7}),
    invalid_streak: int = 8,
    tier_label: str = "準4+",
    invalid_reason: str = INVALID_ONE_CODE_MAXIMUM,
) -> StreakDecision:
    normalized = _candidate_groups(groups)
    # Preserve the existing uniqueness and prefix rules; only the scan limit
    # and eligible values come from the caller.
    for rule in common:
        streak = 0
        for group in normalized[:invalid_streak]:
            if rule not in group:
                break
            streak += 1
        scores[rule] = streak
    if highest >= invalid_streak:
        return StreakDecision(False, highest, top_rules, invalid_reason, matched)
    if highest not in eligible_streaks:
        return StreakDecision(False, highest, top_rules, f"準{highest}進{highest + 1}不屬{tier_label}有效層級", matched)


def evaluate_two_code(
    groups: Iterable[Iterable[int]],
    metrics: EngineMetrics | None = None,
    *,
    eligible_streaks: frozenset[int] = frozenset({5, 6, 7, 9, 11}),
    invalid_streak: int = 12,
    tier_label: str = "準5+",
) -> StreakDecision:
    # Keep incremental pair scoring and endpoint validation unchanged.
    eligible_scores = {
        pair: streak for pair, streak in scores.items()
        if streak in eligible_streaks
        and streak < invalid_streak
        and not _endpoint_invalid(pair, normalized, streak)
    }
~~~

Use `tier_label` in every one-code and two-code tier-specific rejection message so the default Explore wording remains unchanged while Tianheng reports its own level. Do not alter pair scoring, endpoint validation, uniqueness rules or default arguments.

- [ ] **Step 4: Run the focused state tests**

Run: `cd services/matrix-api && python -m pytest tests/test_tianheng_state.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the evaluator change**

~~~bash
git add services/matrix-api/app/domain/explore_state.py services/matrix-api/tests/test_tianheng_state.py
git commit -m "feat(matrix): parameterize Tianheng streak levels"
~~~

---

### Task 2: Build the double-lock occurrence context

**Files:**
- Create: `services/matrix-api/app/domain/tianheng_context.py`
- Create: `services/matrix-api/tests/test_tianheng_context.py`

**Interfaces:**
- Consumes: `ExploreContext`, `ExploreEngineSession`, `CandidateCell`, `VerificationCell`, `RoadType`, `ScopeClass`, `candidate_value`.
- Produces: `TianhengLockKey`, `TianhengLockOccurrence`, `TianhengSourceUnit`, `TianhengRoadGroup`, `TianhengContext`, `TianhengEngineSession.from_explore_session(session)` and `indexed_units`.

- [ ] **Step 1: Write failing pair-index tests**

~~~python
import pytest

from app.domain.explore_context import ExploreEngineSession
from app.domain.tianheng_context import TianhengEngineSession


def history_539():
    numbers = ["05", "10", "15", "18", "20"]
    return [
        {
            "period": str(120000 - index),
            "numbers": numbers,
            "sortedNumbers": numbers,
            "drawOrderNumbers": numbers,
        }
        for index in range(30)
    ]


@pytest.fixture
def tianheng_context():
    session = TianhengEngineSession.from_explore_session(
        ExploreEngineSession.build("今彩539", history_539()),
    )
    return next(c for c in session.contexts if c.number_order == "依號碼由小到大排序")


def test_five_number_draw_has_ten_ordered_pairs_per_source_period():
    explore = ExploreEngineSession.build("今彩539", history_539())
    tianheng = TianhengEngineSession.from_explore_session(explore)
    sorted_context = next(c for c in tianheng.contexts if c.number_order == "依號碼由小到大排序")
    first_period = [u for u in sorted_context.source_units if u.locked_source_index == 0]
    assert len(first_period) == 10
    assert [(u.occurrence.first_position, u.occurrence.second_position) for u in first_period] == [
        (1, 2), (1, 3), (1, 4), (1, 5), (2, 3),
        (2, 4), (2, 5), (3, 4), (3, 5), (4, 5),
    ]


def test_historical_occurrence_requires_both_position_numbers(tianheng_context):
    unit = tianheng_context.source_units[0]
    occurrences = tianheng_context.historical_occurrences(unit)
    assert all(o.first_number == unit.occurrence.first_number for o in occurrences)
    assert all(o.second_number == unit.occurrence.second_number for o in occurrences)


def test_same_period_range_excludes_both_locked_positions(tianheng_context):
    unit = tianheng_context.source_units[0]
    cells = tianheng_context.range_cells(unit.occurrence, unit.prediction_distance)
    same_period_positions = {cell.position for cell in cells if cell.relative_offset == 0}
    assert unit.occurrence.first_position not in same_period_positions
    assert unit.occurrence.second_position not in same_period_positions


def test_drag_cell_uses_the_earlier_lock(tianheng_context):
    occurrence = tianheng_context.source_units[0].occurrence
    cell = tianheng_context.drag_cell(occurrence)
    assert (cell.position, cell.number) == (occurrence.first_position, occurrence.first_number)
~~~

- [ ] **Step 2: Run context tests and verify import failure**

Run: `cd services/matrix-api && python -m pytest tests/test_tianheng_context.py -q`

Expected: FAIL with `ModuleNotFoundError: app.domain.tianheng_context`.

- [ ] **Step 3: Implement pair dataclasses and the indexed context**

~~~python
@dataclass(frozen=True, slots=True)
class TianhengLockKey:
    lottery: str
    number_order: str
    first_position: int
    first_number: int
    second_position: int
    second_number: int


@dataclass(frozen=True, slots=True)
class TianhengLockOccurrence:
    draw_index: int
    period: str
    first_position: int
    first_number: int
    second_position: int
    second_number: int


class TianhengContext:
    def __init__(self, explore: ExploreContext) -> None:
        self.explore = explore
        mutable_index: dict[TianhengLockKey, list[TianhengLockOccurrence]] = {}
        for draw_index, draw in enumerate(explore.history):
            numbers = explore.ordered_at(draw_index)
            for first_index in range(len(numbers) - 1):
                for second_index in range(first_index + 1, len(numbers)):
                    occurrence = TianhengLockOccurrence(
                        draw_index, str(draw["period"]),
                        first_index + 1, numbers[first_index],
                        second_index + 1, numbers[second_index],
                    )
                    key = self.key_for(occurrence)
                    mutable_index.setdefault(key, []).append(occurrence)
        self._occurrence_index = {key: tuple(value) for key, value in mutable_index.items()}
~~~

Implement `range_cells()` with the same offsets and scope classes as Explore while excluding both locked positions at offset zero. Implement candidate target maps with `candidate_value()`. Implement `drag_cell()` with the first position/number only. Construct thirteen-period source units and `TianhengEngineSession.indexed_units` from the existing Explore session contexts.

- [ ] **Step 4: Run focused context tests**

Run: `cd services/matrix-api && python -m pytest tests/test_tianheng_context.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the pair context**

~~~bash
git add services/matrix-api/app/domain/tianheng_context.py services/matrix-api/tests/test_tianheng_context.py
git commit -m "feat(matrix): index Tianheng double locks"
~~~

---

### Task 3: Produce Tianheng results and validation artifacts

**Files:**
- Create: `services/matrix-api/app/domain/tianheng_runtime.py`
- Create: `services/matrix-api/tests/test_tianheng_runtime.py`

**Interfaces:**
- Consumes: all Task 2 context types plus the parameterized evaluators from Task 1.
- Produces: `run_tianheng_batch(lottery, newest_first, start, limit, *, road_types=(RoadType.ADD, RoadType.SUM, RoadType.DRAG), session=None)` returning `{artifact, cursorStart, cursor, total, complete, metrics}`.
- Produces item fields: `id`, `firstNumber`, `firstLockedPosition`, `secondNumber`, `secondLockedPosition`, `predictionDistance`, `consecutive`, `highestStreak`, `predictionNumbers`, `algorithmType`, `numberOrder`, `ruleCount`, `lockedSourceIndex`, `lockedSourcePeriod`, `exploreRange`, optional `referenceOffset`, optional `referencePosition`.

- [ ] **Step 1: Write failing runtime contract tests**

~~~python
from app.domain.explore_context import ExploreEngineSession
from app.domain.explore_state import RoadType, StreakDecision
from app.domain.tianheng_context import TianhengEngineSession
from app.domain.tianheng_runtime import evaluate_tianheng_candidates, run_tianheng_batch


def history_539():
    numbers = ["05", "10", "15", "18", "20"]
    return [
        {
            "period": str(120000 - index),
            "numbers": numbers,
            "sortedNumbers": numbers,
            "drawOrderNumbers": numbers,
        }
        for index in range(30)
    ]


def test_tianheng_rule_count_one_uses_requested_levels():
    decision = evaluate_tianheng_candidates(({18},) * 9 + (frozenset(),), 1)
    assert decision.valid
    assert decision.highest_streak == 9


def test_tianheng_rule_count_two_uses_requested_levels():
    groups = ({18}, {20}, {18, 20}, {18, 20}, {18, 20}, {18, 20})
    decision = evaluate_tianheng_candidates(groups, 2)
    assert decision.valid
    assert decision.highest_streak == 6


def test_artifact_items_keep_both_locks(monkeypatch):
    monkeypatch.setattr(
        "app.domain.tianheng_runtime.evaluate_tianheng_candidates",
        lambda groups, rule_count, metrics=None: StreakDecision(True, 5, (0,)),
    )
    history = history_539()
    session = TianhengEngineSession.from_explore_session(
        ExploreEngineSession.build("今彩539", history),
    )
    response = run_tianheng_batch(
        "今彩539", history, 0, 10,
        road_types=(RoadType.DRAG,), session=session,
    )
    assert response["artifact"]["items"]
    for item in response["artifact"]["items"]:
        assert item["firstLockedPosition"] < item["secondLockedPosition"]
        assert item["firstNumber"] and item["secondNumber"]
        validation = response["artifact"]["validationById"][item["id"]]
        assert validation["sourceA"]["lockedPositions"] == [
            item["firstLockedPosition"], item["secondLockedPosition"],
        ]


def test_drag_summary_data_uses_first_lock_as_reference(monkeypatch):
    monkeypatch.setattr(
        "app.domain.tianheng_runtime.evaluate_tianheng_candidates",
        lambda groups, rule_count, metrics=None: StreakDecision(True, 5, (0,)),
    )
    history = history_539()
    session = TianhengEngineSession.from_explore_session(
        ExploreEngineSession.build("今彩539", history),
    )
    response = run_tianheng_batch(
        "今彩539", history, 0, 10,
        road_types=(RoadType.DRAG,), session=session,
    )
    item = next(
        row for row in response["artifact"]["items"]
        if row["algorithmType"] == "拖牌"
        and row["firstLockedPosition"] == 1
        and row["secondLockedPosition"] == 4
    )
    validation = response["artifact"]["validationById"][item["id"]]
    assert validation["sourceA"]["baseNumber"] == int(item["firstNumber"])
    assert item["referenceOffset"] == 0
    assert item["referencePosition"] == item["firstLockedPosition"]
~~~

- [ ] **Step 2: Run runtime tests and verify failure**

Run: `cd services/matrix-api && python -m pytest tests/test_tianheng_runtime.py -q`

Expected: FAIL because `tianheng_runtime` does not exist.

- [ ] **Step 3: Implement evaluation and artifact construction**

~~~python
TIANHENG_ONE_RULE_STREAKS = frozenset({5, 6, 7, 9})
TIANHENG_TWO_RULE_STREAKS = frozenset({6, 7, 9, 11})


def evaluate_tianheng_candidates(
    groups: Iterable[Iterable[int]],
    rule_count: int,
    metrics: EngineMetrics | None = None,
) -> StreakDecision:
    if rule_count == 1:
        return evaluate_one_code(
            groups,
            eligible_streaks=TIANHENG_ONE_RULE_STREAKS,
            invalid_streak=10,
            tier_label="準5+",
            invalid_reason="鎖定1碼連準達10次以上，整條cell無效，不得截短",
        )
    if rule_count == 2:
        return evaluate_two_code(
            groups,
            metrics,
            eligible_streaks=TIANHENG_TWO_RULE_STREAKS,
            invalid_streak=12,
            tier_label="準7+",
        )
    raise AlgorithmError("ruleCount必須是1或2")
~~~

For add/sum, enumerate the same range cells and candidate maps as Explore, but build historical groups from exact pair occurrences. For drag, create one same-period reference cell from the first lock. Apply rules to the selected reference base with the existing `apply_candidate()` wrapping. Build deterministic IDs from both locks, source index, reference coordinate, road, rule count, streak, predictions and scope. Store both locks in every item and every validation source/historical group.

- [ ] **Step 4: Run state, context and runtime tests together**

Run:

~~~bash
cd services/matrix-api
python -m pytest tests/test_tianheng_state.py tests/test_tianheng_context.py tests/test_tianheng_runtime.py -q
~~~

Expected: PASS.

- [ ] **Step 5: Commit the runtime**

~~~bash
git add services/matrix-api/app/domain/tianheng_runtime.py services/matrix-api/tests/test_tianheng_runtime.py
git commit -m "feat(matrix): generate Tianheng road artifacts"
~~~

---

### Task 4: Integrate Tianheng into the resumable analysis run

**Files:**
- Create: `services/matrix-api/tests/test_tianheng_pipeline.py`
- Modify: `services/matrix-api/app/services/artifact_builders.py`
- Modify: `services/matrix-api/app/services/analysis_pipeline.py`
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Modify: `services/matrix-api/app/analysis_worker.py`
- Modify: `services/matrix-api/app/worker.py`
- Modify: `services/matrix-api/README.md`

**Interfaces:**
- Consumes: `run_tianheng_batch()` and existing Explore session cache.
- Produces: artifact kind `tianheng`; repository methods `save_tianheng_results(...)` and `has_tianheng_results(...)`; analysis version `matrix-python-v13`.

- [ ] **Step 1: Write failing pipeline and repository tests**

~~~python
from inspect import signature

from app.repositories.analysis_repository import ARTIFACT_KINDS, InMemoryAnalysisRepository
from app.services.artifact_builders import _status_artifact
from app.services.analysis_pipeline import PHASES, AnalysisPipeline


DRAW = {
    "lottery": "今彩539",
    "period": "114001",
    "numbers": ["01", "02", "03", "04", "05"],
}
VERSION = "114001:matrix-python-v13"


def empty_artifact():
    return {"lottery": "今彩539", "drawPeriod": "114001", "items": [], "validationById": {}}


def tianheng_artifact():
    item = {
        "id": "th_test", "firstNumber": "05", "firstLockedPosition": 1,
        "secondNumber": "18", "secondLockedPosition": 4,
        "predictionDistance": 3, "consecutive": "準5進6", "highestStreak": 5,
        "predictionNumbers": ["23"], "algorithmType": "拖牌",
        "numberOrder": "依號碼由小到大排序", "ruleCount": 1,
        "exploreRange": "標準範圍", "lockedSourceIndex": 0,
        "lockedSourcePeriod": "114001", "referenceOffset": 0, "referencePosition": 1,
    }
    return {**empty_artifact(), "items": [item], "validationById": {"th_test": {"itemId": "th_test"}}}


def complete_batch(kind, artifact):
    def builder(context):
        batch = context[f"{kind}Batch"]
        return {"artifact": artifact(), "_checkpoint": {
            "cursorStart": int(batch["start"]), "cursor": 1,
            "total": 1, "complete": True,
        }}
    return builder


def builders():
    return {
        "explore": complete_batch("explore", empty_artifact),
        "tianyan": lambda context: empty_artifact(),
        "tianheng": complete_batch("tianheng", tianheng_artifact),
        "tiangong": lambda context: empty_artifact(),
        "status": lambda context: {
            **empty_artifact(), "artifactKinds": ["explore", "tianyan"],
        },
    }


def test_tianheng_is_a_required_batched_phase():
    assert "tianheng" in ARTIFACT_KINDS
    assert PHASES.index("tianheng") > PHASES.index("explore")


def test_pipeline_checkpoints_and_resumes_tianheng():
    repository = InMemoryAnalysisRepository()
    pipeline = AnalysisPipeline(repository, builders(), VERSION, explore_batch_size=10)
    while True:
        result = pipeline.run(DRAW, [])
        if result["status"] == "complete":
            break
    assert repository.has_artifact("今彩539", "114001", VERSION, "tianheng")
    assert repository.has_tianheng_results("今彩539", "114001", VERSION)


def test_status_builder_does_not_accept_tianheng():
    assert tuple(signature(_status_artifact).parameters) == ("explore", "tianyan")
~~~

- [ ] **Step 2: Run the pipeline test and verify failure**

Run: `cd services/matrix-api && python -m pytest tests/test_tianheng_pipeline.py -q`

Expected: FAIL because the new phase and repository methods are absent.

- [ ] **Step 3: Add the builder and generalize batched phases**

~~~python
PHASES = ("explore", "tianyan", "tianheng", "tiangong", "status")
BATCHED_PHASES = frozenset({"explore", "tianheng"})
PHASE_DEPENDENCIES = {
    "tianyan": ("explore",),
    "tianheng": (),
    "tiangong": (),
    "status": ("explore", "tianyan"),
}
~~~

Replace the `phase == "explore"` batch branch with `phase in BATCHED_PHASES`, use `${phase}Batch`, save chunks under that phase, and dispatch normalized saves by phase:

~~~python
if phase == "explore":
    self._save_explore_results(lottery, period, self.analysis_version, payload)
elif phase == "tianheng":
    self._save_tianheng_results(lottery, period, self.analysis_version, payload)
~~~

Create the builder from the same cached `ExploreEngineSession`:

~~~python
def tianheng(context: dict[str, Any]) -> dict[str, Any]:
    draw = context["draw"]
    session = TianhengEngineSession.from_explore_session(
        engine_session(draw["lottery"], context["history"]),
    )
    batch = context["tianhengBatch"]
    result = run_tianheng_batch(
        draw["lottery"], context["history"],
        int(batch["start"]), int(batch["limit"]), session=session,
    )
    result["artifact"]["drawPeriod"] = draw["period"]
    return {"artifact": result["artifact"], "_checkpoint": {
        "cursorStart": result["cursorStart"], "cursor": result["cursor"],
        "total": result["total"], "complete": result["complete"],
    }}
~~~

- [ ] **Step 4: Add repository normalization and worker recovery**

~~~python
ARTIFACT_KINDS = {"explore", "tianyan", "tianheng", "tiangong", "status"}


def _tianheng_result_records(lottery, draw_period, analysis_version, payload, expires_at):
    records = []
    for item in payload.get("items", []):
        item_id = str(item["id"])
        records.append({
            "lottery": lottery,
            "draw_period": draw_period,
            "analysis_version": analysis_version,
            "item_id": item_id,
            "first_number": str(item["firstNumber"]),
            "first_locked_position": int(item["firstLockedPosition"]),
            "second_number": str(item["secondNumber"]),
            "second_locked_position": int(item["secondLockedPosition"]),
            "prediction_distance": int(item["predictionDistance"]),
            "consecutive": str(item["consecutive"]),
            "highest_streak": int(item["highestStreak"]),
            "prediction_numbers": list(item["predictionNumbers"]),
            "algorithm_type": str(item["algorithmType"]),
            "number_order": str(item["numberOrder"]),
            "rule_count": int(item["ruleCount"]),
            "explore_range": str(item["exploreRange"]),
            "locked_source_index": int(item["lockedSourceIndex"]),
            "locked_source_period": str(item["lockedSourcePeriod"]),
            "reference_offset": item.get("referenceOffset"),
            "reference_position": item.get("referencePosition"),
            "item": {key: value for key, value in item.items() if key != "exploreRange"},
            "validation": payload["validationById"].get(item_id, {}),
            "expires_at": expires_at,
        })
    return records
~~~

Implement identical in-memory and Supabase batch-upsert paths for `matrix_tianheng_results`. Extend completed-run recovery to restore both normalized result sets from their artifacts. Bump `ANALYSIS_VERSION` to `matrix-python-v13` and update README references.

- [ ] **Step 5: Run focused backend tests**

Run:

~~~bash
cd services/matrix-api
python -m pytest tests/test_tianheng_state.py tests/test_tianheng_context.py tests/test_tianheng_runtime.py tests/test_tianheng_pipeline.py -q
~~~

Expected: PASS.

- [ ] **Step 6: Commit pipeline integration**

~~~bash
git add services/matrix-api/app services/matrix-api/tests/test_tianheng_pipeline.py services/matrix-api/README.md
git commit -m "feat(matrix): run Tianheng in analysis pipeline"
~~~

---

### Task 5: Add Supabase storage and guarded RPCs

**Files:**
- Create: `supabase/migrations/20260910233000_matrix_tianheng.sql`
- Create: `tests/matrix-tianheng-migration.test.mjs`

**Interfaces:**
- Consumes: `private.matrix_result_entitlements()`, `private.matrix_request_guard(text,jsonb)`, `matrix_analysis_runs`, `lottery_draws`.
- Produces: `matrix_tianheng_results`, `private.matrix_tianheng_list_impl(jsonb)`, `private.matrix_tianheng_validation_impl(jsonb)`, `public.matrix_tianheng_list(jsonb)`, `public.matrix_tianheng_validation(jsonb)`.

- [ ] **Step 1: Write failing migration contract tests**

~~~javascript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../supabase/migrations/20260910233000_matrix_tianheng.sql', import.meta.url),
  'utf8',
);

test('creates isolated Tianheng storage and guarded RPC operations', () => {
  assert.match(sql, /create table public\.matrix_tianheng_results/i);
  assert.match(sql, /first_locked_position integer not null/i);
  assert.match(sql, /second_locked_position integer not null/i);
  assert.match(sql, /v_periods not in \(3, 13\)/i);
  assert.match(sql, /matrix-python-v13/i);
  assert.match(sql, /matrix_analysis_runs_phase_check/i);
  assert.match(sql, /matrix_analysis_artifacts_kind_check/i);
  assert.match(sql, /matrix_analysis_artifact_chunks_kind_check/i);
  assert.match(sql, /when 'tianheng_list' then/i);
  assert.match(sql, /when 'tianheng_validation' then/i);
  assert.match(sql, /grant execute on function public\.matrix_tianheng_list\(jsonb\) to anon, authenticated, service_role/i);
});

test('keeps Tianheng out of status sources', () => {
  assert.doesNotMatch(sql, /matrix_status.*tianheng/is);
});
~~~

- [ ] **Step 2: Run the migration test and verify missing-file failure**

Run: `node --test tests/matrix-tianheng-migration.test.mjs`

Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Create the table, indexes, RLS and cleanup path**

~~~sql
create table public.matrix_tianheng_results (
  lottery text not null check (lottery in ('今彩539','天天樂','六合彩','大樂透')),
  draw_period text not null,
  analysis_version text not null,
  item_id text not null,
  first_number text not null,
  first_locked_position integer not null check (first_locked_position > 0),
  second_number text not null,
  second_locked_position integer not null check (second_locked_position > first_locked_position),
  prediction_distance integer not null check (prediction_distance > 0),
  consecutive text not null,
  highest_streak integer not null check (highest_streak > 0),
  prediction_numbers jsonb not null check (jsonb_typeof(prediction_numbers) = 'array'),
  algorithm_type text not null check (algorithm_type in ('加減','合值','拖牌')),
  number_order text not null check (number_order in ('依號碼由小到大排序','依實際開獎順序排序')),
  rule_count integer not null check (rule_count in (1,2)),
  explore_range text not null check (explore_range in ('標準範圍','完整範圍')),
  locked_source_index integer not null check (locked_source_index between 0 and 12),
  locked_source_period text not null,
  reference_offset integer,
  reference_position integer,
  item jsonb not null check (jsonb_typeof(item) = 'object'),
  validation jsonb not null check (jsonb_typeof(validation) = 'object'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (lottery, draw_period, analysis_version, item_id),
  foreign key (lottery, draw_period, analysis_version)
    references public.matrix_analysis_runs(lottery, draw_period, analysis_version)
    on delete cascade
);
alter table public.matrix_tianheng_results enable row level security;
revoke all on table public.matrix_tianheng_results from public, anon, authenticated;
grant select, insert, update, delete on table public.matrix_tianheng_results to service_role;
~~~

Add a B-tree list index ending in `highest_streak desc, prediction_distance, first_locked_position, second_locked_position`, a GIN index on `prediction_numbers`, and an expiry index. Replace the three existing check constraints so `matrix_analysis_runs.phase`, `matrix_analysis_artifacts.kind`, and `matrix_analysis_artifact_chunks.kind` accept `tianheng`. Extend `matrix_analysis_cleanup_expired` to delete expired Tianheng rows using the same bounded cleanup pattern as Explore.

- [ ] **Step 4: Implement list and validation RPC internals**

The list internal must validate `explorePeriods in (3,13)`, select the requested completed v13 run by draw date and offset, enforce `canUseThirteen` and `canUseFullRange`, then apply range/order/source-index/rule/road/streak/same-code/prediction-number filters. It returns this exact envelope:

~~~sql
return jsonb_build_object(
  'kind','tianheng', 'lottery',v_lottery, 'drawPeriod',v_draw,
  'analysisVersion',v_version, 'status','complete',
  'items',v_items, 'duplicateStats',v_stats, 'total',v_total
);
~~~

The validation internal must require the same lottery, draw, version, item ID, period and range access fields, verify `analysis_version = draw_period || ':matrix-python-v13'`, and only return rows with `locked_source_index < explorePeriods` and the selected range.

Because Task 4 bumps the shared analysis run to v13, replace the existing private Explore list and validation implementations with their current definitions changing only the exact analysis suffix from `matrix-python-v12` to `matrix-python-v13`. Add contract assertions that both private Explore implementations contain the v13 suffix and no active list/validation implementation still selects v12.

- [ ] **Step 5: Route both public RPCs through the existing request guard**

~~~sql
-- Add only these cases to the current guard case statement.
when 'tianheng_list' then
  v_result := private.matrix_tianheng_list_impl(p_request);
when 'tianheng_validation' then
  v_result := private.matrix_tianheng_validation_impl(p_request);

create function public.matrix_tianheng_list(p_request jsonb)
returns jsonb language sql volatile security definer set search_path=''
as $$select private.matrix_request_guard('tianheng_list', p_request)$$;

create function public.matrix_tianheng_validation(p_request jsonb)
returns jsonb language sql volatile security definer set search_path=''
as $$select private.matrix_request_guard('tianheng_validation', p_request)$$;

revoke all on function public.matrix_tianheng_list(jsonb),
  public.matrix_tianheng_validation(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.matrix_tianheng_list(jsonb),
  public.matrix_tianheng_validation(jsonb) to anon, authenticated, service_role;
~~~

Revoke direct execute on both private implementation functions from `public`, `anon`, `authenticated`, and `service_role`.

- [ ] **Step 6: Run the focused migration contract test**

Run: `node --test tests/matrix-tianheng-migration.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit the migration**

~~~bash
git add supabase/migrations/20260910233000_matrix_tianheng.sql tests/matrix-tianheng-migration.test.mjs
git commit -m "feat(supabase): add guarded Tianheng result RPCs"
~~~

---

### Task 6: Add the frontend Tianheng API contract

**Files:**
- Create: `src/matrix-algorithm-api.tianheng.test.ts`
- Modify: `src/matrix-algorithm-api.ts`

**Interfaces:**
- Consumes: `cachedMatrixResultRpc`, Explore request fields and Matrix API error mapping.
- Produces: `TianhengApiRow`, `TianhengValidation`, `TianhengListRequest`, `TianhengListResponse`, `fetchTianhengList()`, `fetchTianhengValidation()`.

- [ ] **Step 1: Write failing API contract tests**

~~~typescript
import { beforeEach, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  rpc: vi.fn(),
  readAlgorithmCacheScope: vi.fn().mockResolvedValue('guest'),
}));
vi.mock('./lib/supabase', () => ({
  getSupabaseClient: () => ({ rpc: dependencies.rpc }),
}));
vi.mock('./auth/algorithm-cache-scope', () => ({
  readAlgorithmCacheScope: dependencies.readAlgorithmCacheScope,
}));
vi.mock('./permission-settings', () => ({
  refreshPermissionSettings: vi.fn().mockResolvedValue({ revision: 1 }),
}));
vi.mock('./matrix-data-revision', () => ({ getMatrixDataRevision: () => 1 }));
vi.mock('./read-cache', () => ({
  stableCacheKey: () => 'tianheng-test',
  readThroughCache: (_key, _ttl, loader) => loader({ isCurrent: () => true }),
}));

import { fetchTianhengList, type TianhengListRequest } from './matrix-algorithm-api';

const rpc = dependencies.rpc;
const readAlgorithmCacheScope = dependencies.readAlgorithmCacheScope;

beforeEach(() => {
  rpc.mockReset();
  readAlgorithmCacheScope.mockClear();
});

const threePeriodRequest = {
  lottery: '今彩539', numberOrder: '依號碼由小到大排序',
  explorePeriods: 3, exploreDateOffset: 0, exploreRange: '標準範圍',
  ruleCount: 1, roadTypes: ['拖牌'], selectedStreaks: ['準5進6'],
  sameCode: false,
} satisfies TianhengListRequest;

it('calls the Tianheng list RPC with three periods', async () => {
  rpc.mockResolvedValue({ data: {
    kind: 'tianheng', lottery: '今彩539', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13', status: 'complete',
    items: [], duplicateStats: [], total: 0,
  }, error: null });
  await fetchTianhengList(threePeriodRequest);
  expect(rpc).toHaveBeenCalledWith('matrix_tianheng_list', expect.objectContaining({
    p_request: expect.objectContaining({ explorePeriods: 3 }),
  }));
});

it('allows the existing guest cache scope only for Tianheng three periods', async () => {
  await fetchTianhengList(threePeriodRequest);
  expect(readAlgorithmCacheScope).toHaveBeenCalledWith(expect.anything(), { allowGuest: true });
});
~~~

- [ ] **Step 2: Run the API test and verify export failure**

Run: `npx vitest run src/matrix-algorithm-api.tianheng.test.ts`

Expected: FAIL because Tianheng exports are absent.

- [ ] **Step 3: Add exact TypeScript types and RPC functions**

~~~typescript
export type TianhengApiRow = {
  id: string;
  firstNumber: string;
  firstLockedPosition: number;
  secondNumber: string;
  secondLockedPosition: number;
  predictionDistance: number;
  consecutive: string;
  highestStreak: number;
  predictionNumbers: string[];
  algorithmType: '加減' | '合值' | '拖牌';
  numberOrder: MatrixNumberOrder;
  explorePeriods: 3 | 13;
  exploreDateOffset: 0 | 1 | 2;
  ruleCount: 1 | 2;
  referenceOffset?: number;
  referencePosition?: number;
};

export type TianhengListRequest = Omit<ExploreListRequest, 'explorePeriods'> & {
  explorePeriods: 3 | 13;
};

export function fetchTianhengList(request: TianhengListRequest) {
  return cachedMatrixResultRpc<TianhengListResponse>('matrix_tianheng_list', request);
}

export function fetchTianhengValidation(meta, itemId, access) {
  return cachedMatrixResultRpc<TianhengValidationResponse>(
    'matrix_tianheng_validation', { ...meta, itemId, ...access },
  );
}
~~~

Define validation source/history fields with `lockedPositions: [number, number]` and `lockedNumbers: [number, number]`, plus the existing Explore rule-set, source/reference/prediction fields. Normalize Tianheng list/validation envelopes exactly like Explore. Extend `allowGuest` only when the RPC is Tianheng list/validation and `explorePeriods === 3`.

- [ ] **Step 4: Run the focused API test**

Run: `npx vitest run src/matrix-algorithm-api.tianheng.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the API contract**

~~~bash
git add src/matrix-algorithm-api.ts src/matrix-algorithm-api.tianheng.test.ts
git commit -m "feat(matrix): add Tianheng frontend API contract"
~~~

---

### Task 7: Add the Tianheng route, settings and result page

**Files:**
- Create: `src/__tests__/MatrixTianhengPage.test.tsx`
- Create: `src/matrix-tianheng.css`
- Modify: `src/features/navigation.tsx`
- Modify: `src/features/shared.tsx`
- Modify: `src/features/router.tsx`
- Modify: `src/features/MatrixExplorePage.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: Task 6 API functions and existing `MatrixPageSwitcher`, `SubscriptionCopy`, Explore settings/results components.
- Produces: `tianheng` route and `MatrixExplorePage title="Matrix 天衡"` mode.

- [ ] **Step 1: Write failing route and settings tests**

~~~tsx
// @vitest-environment jsdom
import { render } from '../../test/render-with-dialog';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MatrixExplorePage } from '../features/MatrixExplorePage';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(), fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(), fetchTianyanValidation: vi.fn(),
  fetchTianhengList: vi.fn(), fetchTianhengValidation: vi.fn(),
}));
const uiState = vi.hoisted(() => ({
  permissionSettings: {
    subscriptionPurchaseVisible: true,
    registeredMemberFreeAccess: false,
    revision: 1,
  },
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);
vi.mock('../permission-settings', () => ({
  usePermissionSettings: () => uiState.permissionSettings,
}));
vi.mock('../member-api', () => ({
  bootstrapMember: vi.fn().mockResolvedValue(undefined),
  fetchMemberProfile: vi.fn().mockResolvedValue({
    exploreEntitlements: { canUseThirteen: false, canUseFullRange: false },
  }),
}));
beforeEach(() => {
  document.body.innerHTML = '';
  uiState.permissionSettings.subscriptionPurchaseVisible = true;
  matrixApi.fetchTianhengList.mockReset().mockResolvedValue({
    kind: 'tianheng', lottery: '今彩539', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13', status: 'complete',
    items: [], duplicateStats: [], total: 0,
  });
  matrixApi.fetchTianhengValidation.mockReset();
});

it('renders Tianheng with the uploaded artwork and only 3/13 periods', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衡" />);
  expect(screen.getByAltText('Matrix 天衡')).toHaveAttribute(
    'src', '/assets/lottery/functions/天衡標題K.png',
  );
  expect(screen.getByRole('button', { name: '三期' })).toBeVisible();
  expect(screen.getByRole('button', { name: /十三期/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: '二期' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '七期' })).not.toBeInTheDocument();
});

it('shows all other Matrix switch icons', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衡" />);
  expect(screen.getByRole('button', { name: 'Matrix 探索' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Matrix 天衍' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Matrix 天工' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Matrix 天衡' })).not.toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run the page test and verify failure**

Run: `npx vitest run src/__tests__/MatrixTianhengPage.test.tsx`

Expected: FAIL because `Matrix 天衡` is not a valid page title or route.

- [ ] **Step 3: Add navigation, artwork and static route**

~~~typescript
// navigation.tsx
| "tianheng"

// shared.tsx
{ screen: "tianheng", label: "Matrix 天衡", image: "/assets/lottery/functions/天衡.png" }

// MATRIX_TITLE_ARTWORK
"Matrix 天衡": "/assets/lottery/functions/天衡標題K.png",

// router.tsx
if (screen === "tianheng") {
  return <MatrixExplorePage key="tianheng" onNavigate={onNavigate} title="Matrix 天衡" />;
}
~~~

Extend `MatrixPageSwitcher.current` to `"explore" | "tianyan" | "tiangong" | "tianheng"`.

- [ ] **Step 4: Add Tianheng mode to the existing Explore page**

Use explicit booleans and mode-specific constants so existing branches remain unchanged:

~~~typescript
const isExplore = title === 'Matrix 探索';
const isTianyan = title === 'Matrix 天衍';
const isTianheng = title === 'Matrix 天衡';
const periodOptions = isTianheng
  ? (['三期', '十三期'] as const)
  : (['二期', '七期', '十三期'] as const);
const tianhengFilters = {
  '準5+（鎖定1碼）': ['準5進6', '準6進7', '準7進8', '準9進10'],
  '準7+（鎖定2碼）': ['準6進7', '準7進8', '準9進10', '準11進12'],
} as const;
~~~

Add Tianheng response/loading/validation state, clear it on cache revision, call `fetchTianhengList()` with `3 | 13`, and call `fetchTianhengValidation()` on expansion. Keep latest-request-only generation/revision checks. Use the existing Explore history block because the specification says the page otherwise matches Explore. Keep the Explore action label unchanged and set the result title to `天衡結果區`.

- [ ] **Step 5: Render both lock conditions in the existing result grid**

~~~tsx
<span className="tag tianheng-lock-positions">
  <span>{positionLabel(item.firstLockedPosition, item.numberOrder)}</span>
  <span>{positionLabel(item.secondLockedPosition, item.numberOrder)}</span>
</span>
<span className="result-number numeric-text tianheng-lock-numbers">
  <span>{item.firstNumber}</span>
  <span>{item.secondNumber}</span>
</span>
~~~

Do not change the other four columns. Add only the minimum CSS required to stack the two lock values inside the existing column widths and preserve the 390px grid.

- [ ] **Step 6: Test exact filters, request payload, copy variants and mobile classes**

~~~tsx
it('uses the exact Tianheng streak filters', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衡" />);
  fireEvent.click(screen.getByRole('button', { name: '準7+（鎖定2碼）' }));
  fireEvent.click(screen.getByRole('button', { name: '連準篩選' }));
  expect(screen.getAllByRole('button', { name: /準\d+進\d+/ }).map(b => b.textContent)).toEqual([
    '準6進7', '準7進8', '準9進10', '準11進12',
  ]);
});

it.each([
  [true, '預測期', '預測'],
  [false, '查詢期', '結果'],
])('switches Tianheng result copy with the independent setting', (visible, periodCopy, resultCopy) => {
  uiState.permissionSettings.subscriptionPurchaseVisible = visible;
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衡" />);
  expect(screen.getByText(periodCopy)).toBeVisible();
  expect(screen.getByText(resultCopy)).toBeVisible();
});
~~~

- [ ] **Step 7: Run focused page and API tests**

Run:

~~~bash
npx vitest run src/matrix-algorithm-api.tianheng.test.ts src/__tests__/MatrixTianhengPage.test.tsx
~~~

Expected: PASS.

- [ ] **Step 8: Commit the route and page**

~~~bash
git add src/features/navigation.tsx src/features/shared.tsx src/features/router.tsx src/features/MatrixExplorePage.tsx src/matrix-tianheng.css src/main.tsx src/__tests__/MatrixTianhengPage.test.tsx
git commit -m "feat(matrix): add Tianheng exploration page"
~~~

---

### Task 8: Render the two-line summary and Explore-style validation

**Files:**
- Modify: `src/features/MatrixValidation.tsx`
- Modify: `src/__tests__/MatrixTianhengPage.test.tsx`
- Modify: `src/matrix-tianheng.css`

**Interfaces:**
- Consumes: `TianhengValidation`, Tianheng result row, `ExploreValidationSummary`, `SubscriptionCopy`, existing Explore validation classes.
- Produces: `TianhengValidationProcess` and accessible label `天衡驗證過程`.

- [ ] **Step 1: Write failing summary and validation tests**

~~~tsx
const tianhengItem = {
  id: 'th-1', firstNumber: '05', firstLockedPosition: 1,
  secondNumber: '18', secondLockedPosition: 4,
  predictionDistance: 5, consecutive: '準5進6', highestStreak: 5,
  predictionNumbers: ['19'], algorithmType: '拖牌',
  numberOrder: '依號碼由小到大排序', explorePeriods: 3,
  exploreDateOffset: 0, ruleCount: 2, referenceOffset: 0, referencePosition: 1,
} as const;

const tianhengValidation = {
  itemId: 'th-1',
  sourceA: {
    sourcePeriod: '114001', sourceNumbers: ['05', '10', '15', '18', '20'],
    lockedPositions: [1, 4], lockedNumbers: [5, 18], baseNumber: 5,
    referencePeriod: '114001', referenceNumbers: ['05', '10', '15', '18', '20'],
    predictionPeriod: null, predictionCompleted: false,
  },
  ruleSets: [{
    rules: [
      { value: 14, display: '+14', algorithmType: '拖牌' },
      { value: 24, display: '+24', algorithmType: '拖牌' },
    ],
    predictionNumbers: [19],
    historicalValidation: [{
      group: 'B', sourcePeriod: '113990',
      sourceNumbers: ['05', '10', '15', '18', '20'],
      sourceSortedNumbers: ['05', '10', '15', '18', '20'],
      sourceDrawOrderNumbers: ['05', '10', '15', '18', '20'],
      lockedPositions: [1, 4], lockedNumbers: [5, 18],
      referencePeriod: '113990', referenceNumbers: ['05', '10', '15', '18', '20'],
      referenceSortedNumbers: ['05', '10', '15', '18', '20'],
      referenceDrawOrderNumbers: ['05', '10', '15', '18', '20'],
      baseNumber: 5, predictionPeriod: '113985',
      predictionNumbers: ['01', '09', '19', '23', '30'],
      candidateRules: [14, 24], matchedRules: [
        { value: 14, display: '+14', algorithmType: '拖牌' },
        { value: 24, display: '+24', algorithmType: '拖牌' },
      ],
      hitNumbers: [19], success: true,
    }],
  }],
};

async function renderTianhengResult(overrides = {}) {
  matrixApi.fetchTianhengList.mockResolvedValue({
    kind: 'tianheng', lottery: '今彩539', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13', status: 'complete',
    items: [{ ...tianhengItem, ...overrides }], duplicateStats: [], total: 1,
  });
  matrixApi.fetchTianhengValidation.mockResolvedValue({
    kind: 'tianheng', lottery: '今彩539', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13', status: 'complete',
    itemId: 'th-1', validation: tianhengValidation,
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衡" />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  return screen.findByRole('button', { name: /展開版路 th-1/ });
}

it('orders the drag summary in exactly two rows', async () => {
  const resultButton = await renderTianhengResult({
    firstNumber: '05', firstLockedPosition: 1,
    secondNumber: '18', secondLockedPosition: 4,
    predictionDistance: 5, algorithmType: '拖牌',
  });
  fireEvent.click(resultButton);
  const rows = await screen.findAllByTestId('tianheng-summary-row');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('開 05 第 1 顆｜同期｜第 1 顆');
  expect(rows[1]).toHaveTextContent('開 18 第 4 顆｜+14.24｜下 5 期開');
});

it('highlights both locked numbers in every source group', async () => {
  const resultButton = await renderTianhengResult();
  fireEvent.click(resultButton);
  const sourceRow = await screen.findByTestId('tianheng-source-row-B');
  expect(within(sourceRow).getByText('05')).toHaveClass('explore-validation-number--hit');
  expect(within(sourceRow).getByText('18')).toHaveClass('explore-validation-number--hit');
});
~~~

- [ ] **Step 2: Run the page test and verify summary failure**

Run: `npx vitest run src/__tests__/MatrixTianhengPage.test.tsx`

Expected: FAIL because `TianhengValidationProcess` is absent.

- [ ] **Step 3: Implement the exact two-row summary**

~~~tsx
<ExploreValidationSummary layout="tianyan">
  <span className="tianyan-validation-summary-lines tianheng-summary-lines" aria-label="版路摘要">
    <span className="tianyan-validation-summary-row" data-testid="tianheng-summary-row">
      <SummaryLocked number={item.firstNumber} position={item.firstLockedPosition} />
      <Divider />
      <SummaryDirection offset={item.referenceOffset ?? 0} />
      <Divider />
      <SummaryPosition position={item.referencePosition ?? item.firstLockedPosition} />
    </span>
    <span className="tianyan-validation-summary-row" data-testid="tianheng-summary-row">
      <SummaryLocked number={item.secondNumber} position={item.secondLockedPosition} />
      <Divider />
      <SummaryRuleValues rules={ruleSet.rules} algorithmType={item.algorithmType} />
      <Divider />
      <span>下 <i className="validation-summary-future">{item.predictionPeriod}</i> 期開</span>
    </span>
  </span>
</ExploreValidationSummary>
~~~

For drag, force the first row to `同期` and the first locked position. The second row must show the returned rule displays joined with `.`. For add/sum, use the returned reference offset/position. Do not insert Tianyan's second-row indentation.

- [ ] **Step 4: Reuse the Explore validation layout with two-lock highlighting**

Map historical and current source groups into the existing issue/numbers/formula columns. Mark both `lockedNumbers` as `explore-validation-number--hit`; keep reference base and result hit colors identical to Explore. Render the footer with `<SubscriptionCopy formal="本期預測" alternative="版路結果" />`.

- [ ] **Step 5: Run the focused page test**

Run: `npx vitest run src/__tests__/MatrixTianhengPage.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit summary and validation UI**

~~~bash
git add src/features/MatrixValidation.tsx src/__tests__/MatrixTianhengPage.test.tsx src/matrix-tianheng.css
git commit -m "feat(matrix): add Tianheng validation layout"
~~~

---

### Task 9: Focused verification and pull request

**Files:**
- Modify only files needed to correct failures found by the commands below.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a clean, reviewable feature branch and pull request; no production deployment or merge.

- [ ] **Step 1: Run all Tianheng backend tests**

~~~bash
cd services/matrix-api
python -m pytest tests/test_tianheng_state.py tests/test_tianheng_context.py tests/test_tianheng_runtime.py tests/test_tianheng_pipeline.py -q
~~~

Expected: PASS with zero failures.

- [ ] **Step 2: Run the migration contract test**

~~~bash
node --test tests/matrix-tianheng-migration.test.mjs
~~~

Expected: PASS with zero failures.

- [ ] **Step 3: Run all Tianheng frontend tests**

~~~bash
npx vitest run src/matrix-algorithm-api.tianheng.test.ts src/__tests__/MatrixTianhengPage.test.tsx
~~~

Expected: PASS with zero failures.

- [ ] **Step 4: Verify the changed TypeScript compiles and diff is clean**

~~~bash
npx tsc --noEmit
git diff --check
git status --short
~~~

Expected: TypeScript exits 0, `git diff --check` exits 0, and status contains only intentional Tianheng changes.

- [ ] **Step 5: Inspect the 390px page against Matrix Explore**

Start the existing development server and inspect the Tianheng route at a 390px viewport. Verify the title asset, four-page switcher behavior, two period buttons, six-column result grid, stacked lock values, two-line summary and expanded validation. Correct only Tianheng-specific CSS; do not alter shared Explore dimensions.

- [ ] **Step 6: Review Supabase migration security**

Verify that the result table has RLS enabled and no anon/authenticated table grants; private implementations are not executable by callers; public RPCs pass through `private.matrix_request_guard`; three-period access has no thirteen-period entitlement check; full range and thirteen periods retain Explore entitlements.

- [ ] **Step 7: Commit verification corrections, if any**

~~~bash
git add services/matrix-api src supabase/migrations/20260910233000_matrix_tianheng.sql tests/matrix-tianheng-migration.test.mjs
git commit -m "test(matrix): verify Tianheng integration"
~~~

If no files changed after verification, do not create an empty commit.

- [ ] **Step 8: Open a pull request without merging or deploying**

Create a PR from `work/matrix-tianheng-20260910` to `main` containing the confirmed specification, implementation commits, exact focused test commands and their results. Do not apply the production migration, merge the PR or trigger Cloudflare/Railway deployment in this task.
