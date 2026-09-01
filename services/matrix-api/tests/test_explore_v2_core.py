import pytest

from app.domain.explore_v2 import (
    DRAW_ORDER,
    SORTED_ORDER,
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
