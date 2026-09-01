from app.domain.explore_v2 import RoadType, SORTED_ORDER, ExploreV2Context


def draw(period: str, numbers: list[int]) -> dict:
    values = [str(number).zfill(2) for number in numbers]
    return {
        "period": period,
        "drawDate": "",
        "numbers": values,
        "sortedNumbers": values,
        "drawOrderNumbers": values,
    }


def history() -> list[dict]:
    newest_first = [draw("A", [10, 20, 25, 30, 35])]
    for index in range(4, 0, -1):
        newest_first.extend([
            draw(f"P{index}", [1, 2, 3, 4, 25]),
            draw(f"S{index}", [10, 20, 25, 30, 35]),
        ])
    return newest_first


def test_shared_coordinate_builds_add_and_sum_together() -> None:
    context = ExploreV2Context.build("今彩539", SORTED_ORDER, history())
    unit = context.source_units()[0]
    occurrence = context.historical_occurrences(unit)[0]
    non_drag = next(
        candidate
        for candidate in context.range_candidate_cells(occurrence, unit.prediction_distance)
        if candidate.cell.relative_offset == 0 and candidate.cell.position == 2
    )

    assert non_drag.targets_for(RoadType.ADD)
    assert non_drag.targets_for(RoadType.SUM)
    assert len(context.candidate_build_counts) == 1


def test_locked_coordinate_is_drag_only() -> None:
    context = ExploreV2Context.build("今彩539", SORTED_ORDER, history())
    unit = context.source_units()[0]
    occurrence = context.historical_occurrences(unit)[0]

    cell = context.drag_cell(occurrence)
    targets = context.drag_candidate_targets(occurrence, unit.prediction_distance)

    assert cell.relative_offset == 0
    assert cell.position == unit.occurrence.position
    assert targets
    assert context.range_build_counts == {}
