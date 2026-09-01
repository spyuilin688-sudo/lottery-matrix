import pytest

from app.domain.explore_v2 import (
    DRAW_ORDER,
    SORTED_ORDER,
    ExploreV2Context,
    LockKey,
    LockOccurrence,
    RoadType,
    ScopeClass,
    VerificationCell,
    apply_candidate,
    candidate_value,
    ordered_numbers,
)


def test_add_and_drag_keep_zero_and_wrap_by_lottery_maximum() -> None:
    assert candidate_value(RoadType.ADD, 20, 20, 39) == 0
    assert candidate_value(RoadType.DRAG, 20, 20, 39) == 0
    assert apply_candidate(RoadType.ADD, 39, 1, 39) == 1
    assert apply_candidate(RoadType.DRAG, 39, 1, 39) == 1


def test_sum_keeps_complete_value_and_returns_legal_prediction() -> None:
    assert candidate_value(RoadType.SUM, 39, 39, 39) == 78
    assert apply_candidate(RoadType.SUM, 39, 78, 39) == 39
    assert candidate_value(RoadType.SUM, 49, 49, 49) == 98


def test_verification_cell_records_required_scope_and_coordinates() -> None:
    cell = VerificationCell(
        occurrence_index=7,
        period="114200",
        relative_offset=-8,
        position=4,
        number=20,
        scope_class=ScopeClass.FULL_ONLY,
    )
    assert cell.relative_offset == -8
    assert cell.scope_class is ScopeClass.FULL_ONLY


def test_lock_types_are_immutable_and_hashable() -> None:
    key = LockKey("今彩539", SORTED_ORDER, 1, 10)
    occurrence = LockOccurrence(3, "114200", 1, 10)
    assert {key: (occurrence,)}[key] == (occurrence,)
    with pytest.raises(AttributeError):
        key.number = 11  # type: ignore[misc]


def test_sorted_and_draw_order_are_never_mixed() -> None:
    draw = {
        "period": "114200",
        "numbers": ["01", "02", "03", "04", "05"],
        "sortedNumbers": ["01", "02", "03", "04", "05"],
        "drawOrderNumbers": ["05", "01", "04", "02", "03"],
    }
    assert ordered_numbers(draw, "今彩539", SORTED_ORDER) == (1, 2, 3, 4, 5)
    assert ordered_numbers(draw, "今彩539", DRAW_ORDER) == (5, 1, 4, 2, 3)


def test_missing_draw_order_is_not_replaced_by_sorted_numbers() -> None:
    draw = {
        "period": "114200",
        "numbers": ["01", "02", "03", "04", "05"],
        "sortedNumbers": ["01", "02", "03", "04", "05"],
        "drawOrderNumbers": None,
    }
    assert ordered_numbers(draw, "今彩539", DRAW_ORDER) == ()


def test_special_number_stays_last_in_sorted_seven_position_lottery() -> None:
    draw = {
        "period": "114200",
        "numbers": [10, 1, 8, 4, 3, 6, 49],
        "drawOrderNumbers": [10, 1, 8, 4, 3, 6, 49],
    }
    assert ordered_numbers(draw, "六合彩", SORTED_ORDER) == (1, 3, 4, 6, 8, 10, 49)


def _complete_history(lottery: str, count: int) -> list[dict[str, object]]:
    position_count = 5 if lottery in {"今彩539", "天天樂"} else 7
    numbers = [str(number) for number in range(1, position_count + 1)]
    return [
        {
            "lottery": lottery,
            "period": f"P{index:03d}",
            "numbers": numbers,
            "sortedNumbers": numbers,
            "drawOrderNumbers": list(reversed(numbers)),
        }
        for index in range(count)
    ]


def test_occurrence_search_uses_history_older_than_one_hundred_draws() -> None:
    history = _complete_history("今彩539", 140)
    history[130] = {
        **history[130],
        "period": "old-match",
        "numbers": ["10", "02", "03", "04", "05"],
        "sortedNumbers": ["10", "02", "03", "04", "05"],
    }
    context = ExploreV2Context.build("今彩539", SORTED_ORDER, history)

    occurrences = context.occurrences_for(LockKey("今彩539", SORTED_ORDER, 1, 10))

    assert occurrences[-1].period == "old-match"


@pytest.mark.parametrize(
    ("lottery", "order", "count"),
    [
        ("今彩539", SORTED_ORDER, 65),
        ("天天樂", SORTED_ORDER, 65),
        ("六合彩", SORTED_ORDER, 91),
        ("大樂透", DRAW_ORDER, 91),
    ],
)
def test_thirteen_source_units_are_built_once(lottery: str, order: str, count: int) -> None:
    context = ExploreV2Context.build(lottery, order, _complete_history(lottery, 30))

    units = context.source_units()

    assert len(units) == count
    assert {unit.locked_source_index for unit in units} == set(range(13))
    assert all(unit.prediction_distance == unit.locked_source_index + 1 for unit in units)


def test_range_cells_have_exact_scope_boundaries_and_exclude_result_and_lock() -> None:
    context = ExploreV2Context.build("今彩539", SORTED_ORDER, _complete_history("今彩539", 50))
    occurrence = context.occurrences_for(LockKey("今彩539", SORTED_ORDER, 1, 1))[20]

    cells = context.range_cells(occurrence, prediction_distance=3)

    assert {cell.relative_offset for cell in cells if cell.scope_class is ScopeClass.FULL_ONLY} == set(
        range(-14, -7)
    )
    assert {cell.relative_offset for cell in cells} == {*range(-14, 0), 0, 1, 2}
    assert not any(cell.relative_offset == 3 for cell in cells)
    assert not any(cell.relative_offset == 0 and cell.position == occurrence.position for cell in cells)
    assert len(cells) == (14 * 5) + 4 + (2 * 5)


def test_drag_cell_is_only_the_locked_condition() -> None:
    context = ExploreV2Context.build("今彩539", SORTED_ORDER, _complete_history("今彩539", 30))
    occurrence = context.occurrences_for(LockKey("今彩539", SORTED_ORDER, 2, 2))[10]

    cell = context.drag_cell(occurrence)

    assert (cell.period, cell.relative_offset, cell.position, cell.number) == (
        occurrence.period,
        0,
        occurrence.position,
        occurrence.number,
    )


def test_fantasy5_rejects_draw_order_context() -> None:
    with pytest.raises(ValueError, match="天天樂只使用依號碼由小到大排序"):
        ExploreV2Context.build("天天樂", DRAW_ORDER, _complete_history("天天樂", 30))
