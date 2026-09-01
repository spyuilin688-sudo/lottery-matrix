from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EXPLORE_PATH = ROOT / "services/matrix-api/app/domain/explore_v2.py"
TEST_PATH = ROOT / "services/matrix-api/tests/test_explore_v2_runner.py"
WORKER_PATH = ROOT / "services/matrix-api/app/worker.py"
ANALYSIS_WORKFLOW_PATH = ROOT / ".github/workflows/matrix-analysis.yml"


TESTS = r'''


def _cross_reference_pending(
    *,
    position: int,
    rule_sets: tuple[tuple[int, ...], ...],
    highest_streak: int = 4,
    rule_count: int = 1,
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
        explore_range="完整範圍",
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


def write_tests() -> None:
    source = TEST_PATH.read_text()
    marker = "def test_cross_reference_three_distinct_one_code_rules_are_rejected"
    if marker in source:
        raise SystemExit("cross-reference regression tests already exist")
    TEST_PATH.write_text(source + TESTS)


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

    worker_source = WORKER_PATH.read_text()
    old_version = 'ANALYSIS_VERSION = "matrix-python-v10"'
    if worker_source.count(old_version) != 1:
        raise SystemExit("Expected exactly one v10 analysis version")
    WORKER_PATH.write_text(
        worker_source.replace(
            old_version,
            'ANALYSIS_VERSION = "matrix-python-v11"',
            1,
        )
    )

    workflow_source = ANALYSIS_WORKFLOW_PATH.read_text()
    old_name = "name: Matrix latest-period analysis v10"
    if workflow_source.count(old_name) != 1:
        raise SystemExit("Expected exactly one v10 workflow name")
    ANALYSIS_WORKFLOW_PATH.write_text(
        workflow_source.replace(
            old_name,
            "name: Matrix latest-period analysis v11",
            1,
        )
    )


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
