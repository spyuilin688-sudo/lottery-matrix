from collections.abc import Iterable

import app.domain.explore_v2 as explore_v2
from app.domain.explore_v2 import RoadType, run_explore_v2_batch


def _draw(period: str, ordered: Iterable[int]) -> dict[str, object]:
    values = [int(number) for number in ordered]
    strings = [str(number).zfill(2) for number in values]
    return {
        "lottery": "今彩539",
        "period": period,
        "numbers": strings,
        "sortedNumbers": sorted(strings),
        "drawOrderNumbers": list(reversed(strings)),
    }


def _base_history(count: int = 116) -> list[dict[str, object]]:
    return [_draw(f"P{index:03d}", [1, 6, 12, 28, 37]) for index in range(count)]


def _set_sorted(draw: dict[str, object], numbers: Iterable[int]) -> None:
    strings = [str(number).zfill(2) for number in numbers]
    draw["numbers"] = strings
    draw["sortedNumbers"] = sorted(strings)
    draw["drawOrderNumbers"] = list(reversed(strings))


def _cross_cell_more_than_two_longest_history() -> list[dict[str, object]]:
    history = _base_history()
    _set_sorted(history[0], [10, 23, 35, 38, 39])

    group_specs = (
        (20, [23, 35, 38, 39], [24, 37, 2, 30, 4]),
        (40, [19, 23, 26, 27], [20, 25, 29, 22, 35]),
        (60, [17, 22, 29, 39], [18, 24, 32, 37, 9]),
        (80, [14, 15, 20, 35], [15, 17, 23, 20, 39]),
        (100, [30, 33, 36, 39], [31, 35, 39, 11, 21]),
    )
    for source_index, reference_numbers, result_numbers in group_specs:
        _set_sorted(history[source_index], [10, *reference_numbers])
        _set_sorted(history[source_index - 1], result_numbers)
    return history


def test_runner_rejects_three_equal_longest_rules_from_different_reference_cells() -> None:
    history = _cross_cell_more_than_two_longest_history()
    context = explore_v2.ExploreV2Context.build(
        "今彩539",
        explore_v2.SORTED_ORDER,
        history,
    )
    unit = context.source_units()[0]
    bundles = explore_v2._range_bundles(context, unit)  # type: ignore[attr-defined]
    source_cells = context.range_cells(unit.occurrence, unit.prediction_distance)

    for reference_position, expected_rule in ((2, 1), (3, 2), (4, 3)):
        reference_cell = next(
            cell
            for cell in source_cells
            if cell.relative_offset == 0 and cell.position == reference_position
        )
        groups = explore_v2._groups_for_cell(  # type: ignore[attr-defined]
            bundles,
            reference_cell,
            RoadType.ADD,
        )
        decision = explore_v2.evaluate_one_code(
            [set(group.candidates) for group in groups]
        )
        assert decision.valid
        assert decision.highest_streak == 5
        assert decision.rule_sets == ((expected_rule,),)

    result = run_explore_v2_batch(
        "今彩539",
        history,
        0,
        1,
        road_types=(RoadType.ADD,),
    )
    items = result["artifact"]["items"]

    for explore_range in ("標準範圍", "完整範圍"):
        matching = [
            item
            for item in items
            if item["exploreRange"] == explore_range
            and item["algorithmType"] == "加減"
            and item["ruleCount"] == 1
            and item["highestStreak"] == 5
            and item.get("referenceOffset") == 0
            and item.get("referencePosition") in {2, 3, 4}
        ]
        assert matching == []
