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
