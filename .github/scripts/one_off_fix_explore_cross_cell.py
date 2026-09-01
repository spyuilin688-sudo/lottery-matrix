from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EXPLORE_PATH = ROOT / "services/matrix-api/app/domain/explore_v2.py"
TEST_PATH = ROOT / "services/matrix-api/tests/test_explore_v2_runner.py"
WORKER_PATH = ROOT / "services/matrix-api/app/worker.py"
ANALYSIS_WORKFLOW_PATH = ROOT / ".github/workflows/matrix-analysis.yml"
VERSION_PROGRESS_TEST_PATH = ROOT / "services/matrix-api/tests/test_analysis_version_progress.py"
SCHEDULED_WORKER_TEST_PATH = ROOT / "services/matrix-api/tests/test_scheduled_worker_resume.py"
WORKER_TEST_PATH = ROOT / "services/matrix-api/tests/test_worker.py"


OLD_RANGE_TEST = r'''def test_standard_and_full_share_cells_but_decide_final_results_independently() -> None:
    result = run_explore_v2_batch("今彩539", _full_only_one_code_history(), 0, 1)

    full = _matching_items(
        result,
        explore_range="完整範圍",
        algorithm_type="加減",
        rule_count=1,
        reference_offset=-8,
        reference_position=2,
    )
    standard = _matching_items(
        result,
        explore_range="標準範圍",
        algorithm_type="加減",
        rule_count=1,
        reference_offset=-8,
        reference_position=2,
    )

    assert len(full) == 1
    assert standard == []
    assert result["metrics"]["rangeCellBuilds"] == result["metrics"]["uniqueRangeKeys"]
    assert result["metrics"]["candidateBuilds"] == result["metrics"]["uniqueCandidateKeys"]
'''


NEW_RANGE_TEST = r'''def test_standard_and_full_decide_final_results_independently(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(
            position=1,
            rule_sets=((7,),),
            explore_range="標準範圍",
        ),
        _cross_reference_pending(
            position=2,
            rule_sets=((17,),),
            explore_range="標準範圍",
        ),
        _cross_reference_pending(
            position=3,
            rule_sets=((26,),),
            explore_range="完整範圍",
        ),
    ]

    emitted = _flush_cross_reference_results(monkeypatch, pending)

    assert len(emitted) == 3
    assert sorted(args[-1] for args in emitted) == [
        "完整範圍",
        "標準範圍",
        "標準範圍",
    ]
'''


OLD_SAME_PREDICTION_TEST = r'''def test_two_rules_predicting_one_number_emit_one_number() -> None:
    result = run_explore_v2_batch("今彩539", _same_prediction_two_code_history(), 0, 1)

    items = _matching_items(
        result,
        explore_range="標準範圍",
        algorithm_type="合值",
        rule_count=2,
        reference_offset=0,
        reference_position=2,
    )

    item = next(value for value in items if value["predictionNumbers"] == ["05"])
    validation = result["artifact"]["validationById"][item["id"]]
    assert item["ruleCount"] == 2
    assert validation["ruleSets"][0]["rules"] == [
        {"value": 25, "display": "25", "algorithmType": "合值"},
        {"value": 64, "display": "64", "algorithmType": "合值"},
    ]
'''


NEW_SAME_PREDICTION_TEST = r'''def test_two_rules_predicting_one_number_emit_one_number() -> None:
    context = explore_v2.ExploreV2Context.build(
        "今彩539",
        explore_v2.SORTED_ORDER,
        _base_history(20),
    )
    unit = context.source_units()[0]
    reference_cell = explore_v2.VerificationCell(
        occurrence_index=0,
        period="P000",
        relative_offset=0,
        position=2,
        number=20,
        scope_class=explore_v2.ScopeClass.STANDARD_AND_FULL,
    )
    decision = explore_v2.StreakDecision(
        valid=True,
        highest_streak=5,
        rules=(25, 64),
        matched_group_indexes=tuple(range(5)),
        rule_sets=((25, 64),),
    )
    artifact: dict[str, object] = {"items": [], "validationById": {}}

    explore_v2._append_final_results(  # type: ignore[attr-defined]
        artifact,
        context,
        unit,
        reference_cell,
        RoadType.SUM,
        2,
        decision,
        (),
        "標準範圍",
    )

    items = artifact["items"]
    assert isinstance(items, list)
    assert len(items) == 1
    item = items[0]
    assert isinstance(item, dict)
    assert item["predictionNumbers"] == ["05"]
    validation_by_id = artifact["validationById"]
    assert isinstance(validation_by_id, dict)
    validation = validation_by_id[item["id"]]
    assert validation["ruleSets"][0]["rules"] == [
        {"value": 25, "display": "25", "algorithmType": "合值"},
        {"value": 64, "display": "64", "algorithmType": "合值"},
    ]
'''


TESTS = r'''


def _cross_reference_pending(
    *,
    position: int,
    rule_sets: tuple[tuple[int, ...], ...],
    highest_streak: int = 4,
    rule_count: int = 1,
    explore_range: str = "完整範圍",
) -> explore_v2.PendingExploreV2Result:
    rules = tuple(sorted({rule for rule_set in rule_sets for rule in rule_set}))
    return explore_v2.PendingExploreV2Result(
        reference_cell=explore_v2.VerificationCell(
            occurrence_index=position,
            period=f"P{position:03d}",
            relative_offset=-position,
            position=position,
            number=10 + position,
            scope_class=explore_v2.ScopeClass.STANDARD_AND_FULL,
        ),
        road=RoadType.ADD,
        rule_count=rule_count,
        decision=explore_v2.StreakDecision(
            valid=True,
            highest_streak=highest_streak,
            rules=rules,
            matched_group_indexes=tuple(range(highest_streak)),
            rule_sets=rule_sets,
        ),
        groups=(),
        explore_range=explore_range,
    )


def _flush_cross_reference_results(
    monkeypatch: object,
    pending: list[explore_v2.PendingExploreV2Result],
) -> list[tuple[object, ...]]:
    emitted: list[tuple[object, ...]] = []

    def record(*args: object, **_kwargs: object) -> None:
        emitted.append(args)

    monkeypatch.setattr(explore_v2, "_append_final_results", record)  # type: ignore[attr-defined]
    explore_v2._append_aggregated_results(  # type: ignore[attr-defined]
        {"items": [], "validationById": {}},
        object(),
        object(),
        pending,
    )
    return emitted


def test_cross_reference_three_distinct_one_code_rules_are_rejected(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(position=1, rule_sets=((7,),)),
        _cross_reference_pending(position=2, rule_sets=((17,),)),
        _cross_reference_pending(position=3, rule_sets=((26,),)),
    ]

    assert _flush_cross_reference_results(monkeypatch, pending) == []


def test_cross_reference_exactly_two_distinct_rules_are_preserved(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(position=1, rule_sets=((7,),)),
        _cross_reference_pending(position=2, rule_sets=((17,),)),
    ]

    assert len(_flush_cross_reference_results(monkeypatch, pending)) == 2


def test_cross_reference_duplicate_rules_count_once(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(position=1, rule_sets=((7,),)),
        _cross_reference_pending(position=2, rule_sets=((7,),)),
        _cross_reference_pending(position=3, rule_sets=((17,),)),
    ]

    assert len(_flush_cross_reference_results(monkeypatch, pending)) == 3


def test_cross_reference_different_streaks_are_not_combined(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(position=1, rule_sets=((7,),), highest_streak=4),
        _cross_reference_pending(position=2, rule_sets=((17,),), highest_streak=4),
        _cross_reference_pending(position=3, rule_sets=((26,),), highest_streak=5),
    ]

    assert len(_flush_cross_reference_results(monkeypatch, pending)) == 3


def test_cross_reference_two_code_union_over_two_rules_is_rejected(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(
            position=1,
            rule_sets=((10, 20),),
            highest_streak=5,
            rule_count=2,
        ),
        _cross_reference_pending(
            position=2,
            rule_sets=((10, 30),),
            highest_streak=5,
            rule_count=2,
        ),
    ]

    assert _flush_cross_reference_results(monkeypatch, pending) == []
'''


PENDING_MODEL = r'''

@dataclass(frozen=True, slots=True)
class PendingExploreV2Result:
    reference_cell: VerificationCell
    road: RoadType
    rule_count: int
    decision: StreakDecision
    groups: tuple[RoadGroup, ...]
    explore_range: str
'''


EVALUATE_BLOCK = r'''def _evaluate_groups(
    pending_results: list[PendingExploreV2Result],
    reference_cell: VerificationCell,
    road: RoadType,
    groups: tuple[RoadGroup, ...],
    explore_range: str,
    metrics: dict[str, int],
) -> None:
    candidate_sets = tuple(group.candidates for group in groups)
    for rule_count, evaluator in ((1, evaluate_one_code), (2, evaluate_two_code)):
        metrics["scopeDecisions"] += 1
        decision = evaluator(candidate_sets)
        if not decision.valid:
            continue
        pending_results.append(
            PendingExploreV2Result(
                reference_cell=reference_cell,
                road=road,
                rule_count=rule_count,
                decision=decision,
                groups=groups,
                explore_range=explore_range,
            )
        )


def _append_aggregated_results(
    artifact: dict[str, Any],
    context: ExploreV2Context,
    unit: SourceUnit,
    pending_results: Iterable[PendingExploreV2Result],
) -> None:
    grouped: dict[
        tuple[str, RoadType, int, int],
        list[PendingExploreV2Result],
    ] = {}
    for pending in pending_results:
        key = (
            pending.explore_range,
            pending.road,
            pending.rule_count,
            pending.decision.highest_streak,
        )
        grouped.setdefault(key, []).append(pending)

    for same_longest_results in grouped.values():
        distinct_rules = {
            rule
            for pending in same_longest_results
            for rule_set in pending.decision.rule_sets
            for rule in rule_set
        }
        if len(distinct_rules) > 2:
            continue
        for pending in same_longest_results:
            _append_final_results(
                artifact,
                context,
                unit,
                pending.reference_cell,
                pending.road,
                pending.rule_count,
                pending.decision,
                pending.groups,
                pending.explore_range,
            )

'''


RUN_BLOCK = r'''def _run_explore_v2_unit(
    artifact: dict[str, Any],
    context: ExploreV2Context,
    unit: SourceUnit,
    road_types: frozenset[RoadType],
    metrics: dict[str, int],
    include_tianyan: bool,
) -> None:
    range_roads = tuple(road for road in (RoadType.ADD, RoadType.SUM) if road in road_types)
    if range_roads:
        source_cells = context.range_cells(unit.occurrence, unit.prediction_distance)
        bundles = _range_bundles(context, unit)
        for explore_range in EXPLORE_RANGES:
            pending_results: list[PendingExploreV2Result] = []
            for source_cell in source_cells:
                if (
                    explore_range == "標準範圍"
                    and source_cell.scope_class is ScopeClass.FULL_ONLY
                ):
                    continue
                for road in range_roads:
                    groups = _groups_for_cell(bundles, source_cell, road)
                    _evaluate_groups(
                        pending_results,
                        source_cell,
                        road,
                        groups,
                        explore_range,
                        metrics,
                    )
            _append_aggregated_results(
                artifact,
                context,
                unit,
                pending_results,
            )

    if RoadType.DRAG in road_types:
        source_cell = context.drag_cell(unit.occurrence)
        groups = _drag_groups(context, unit)
        for explore_range in EXPLORE_RANGES:
            pending_results = []
            _evaluate_groups(
                pending_results,
                source_cell,
                RoadType.DRAG,
                groups,
                explore_range,
                metrics,
            )
            _append_aggregated_results(
                artifact,
                context,
                unit,
                pending_results,
            )
    if include_tianyan:
        _append_tianyan_results(artifact, context, unit)

'''


def replace_function(source: str, name: str, next_name: str, replacement: str) -> str:
    start = source.index(f"def {name}(")
    end = source.index(f"\ndef {next_name}(", start)
    return source[:start] + replacement + source[end + 1 :]


def replace_exact(path: Path, old: str, new: str, expected: int = 1) -> None:
    source = path.read_text()
    count = source.count(old)
    if count != expected:
        raise SystemExit(f"Expected {expected} matches in {path}, found {count}: {old[:80]}")
    path.write_text(source.replace(old, new))


def write_tests() -> None:
    source = TEST_PATH.read_text()
    marker = "def test_cross_reference_three_distinct_one_code_rules_are_rejected"
    if marker in source:
        raise SystemExit("cross-reference regression tests already exist")
    if source.count(OLD_RANGE_TEST) != 1:
        raise SystemExit("Expected one old range-independence test")
    if source.count(OLD_SAME_PREDICTION_TEST) != 1:
        raise SystemExit("Expected one old same-prediction test")
    source = source.replace(OLD_RANGE_TEST, NEW_RANGE_TEST, 1)
    source = source.replace(OLD_SAME_PREDICTION_TEST, NEW_SAME_PREDICTION_TEST, 1)
    TEST_PATH.write_text(source + TESTS)


def update_version_contract_tests() -> None:
    replace_exact(
        VERSION_PROGRESS_TEST_PATH,
        'CURRENT_VERSION = f"{PERIOD}:matrix-python-v10"',
        'CURRENT_VERSION = f"{PERIOD}:matrix-python-v11"',
    )
    replace_exact(
        VERSION_PROGRESS_TEST_PATH,
        'LEGACY_VERSION = f"{PERIOD}:matrix-python-v9"',
        'LEGACY_VERSION = f"{PERIOD}:matrix-python-v10"',
    )
    replace_exact(
        VERSION_PROGRESS_TEST_PATH,
        'def test_worker_uses_matrix_python_v10() -> None:\n    assert ANALYSIS_VERSION == "matrix-python-v10"',
        'def test_worker_uses_matrix_python_v11() -> None:\n    assert ANALYSIS_VERSION == "matrix-python-v11"',
    )
    replace_exact(
        SCHEDULED_WORKER_TEST_PATH,
        '"000000221:matrix-python-v10"',
        '"000000221:matrix-python-v11"',
        expected=2,
    )
    replace_exact(
        WORKER_TEST_PATH,
        '"000000220:matrix-python-v10"',
        '"000000220:matrix-python-v11"',
    )
    replace_exact(
        WORKER_TEST_PATH,
        '"000000221:matrix-python-v10"',
        '"000000221:matrix-python-v11"',
    )


def apply_fix() -> None:
    source = EXPLORE_PATH.read_text()

    anchor = '\n\nEXPLORE_RANGES = ("標準範圍", "完整範圍")\n'
    if source.count(anchor) != 1:
        raise SystemExit(f"Expected one pending-model anchor, found {source.count(anchor)}")
    if "class PendingExploreV2Result:" in source:
        raise SystemExit("pending result model already exists")
    source = source.replace(anchor, PENDING_MODEL + anchor, 1)

    source = replace_function(
        source,
        "_evaluate_groups",
        "_range_bundles",
        EVALUATE_BLOCK,
    )
    source = replace_function(
        source,
        "_run_explore_v2_unit",
        "_context_metrics",
        RUN_BLOCK,
    )
    EXPLORE_PATH.write_text(source)

    replace_exact(
        WORKER_PATH,
        'ANALYSIS_VERSION = "matrix-python-v10"',
        'ANALYSIS_VERSION = "matrix-python-v11"',
    )
    replace_exact(
        ANALYSIS_WORKFLOW_PATH,
        "name: Matrix latest-period analysis v10",
        "name: Matrix latest-period analysis v11",
    )
    update_version_contract_tests()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("write-tests", "apply-fix"))
    args = parser.parse_args()
    if args.mode == "write-tests":
        write_tests()
    else:
        apply_fix()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
