from app.domain.explore_context import ExploreEngineSession
from app.domain.tianheng_context import TianhengEngineSession


def history(position_count=5):
    values = [str(number).zfill(2) for number in range(1, position_count + 1)]
    return [
        {
            "period": str(120000 - index),
            "numbers": values,
            "sortedNumbers": values,
            "drawOrderNumbers": values,
        }
        for index in range(30)
    ]


def tianshu_context(lottery="今彩539", position_count=5):
    explore = ExploreEngineSession.build(lottery, history(position_count))
    session = TianhengEngineSession.from_explore_session(explore, lock_count=3)
    return next(
        context
        for context in session.contexts
        if context.number_order == "依號碼由小到大排序"
    )


def test_tianshu_has_ten_five_ball_triples_and_thirty_five_seven_ball_triples():
    five = tianshu_context()
    seven = tianshu_context("大樂透", 7)

    five_units = [unit for unit in five.source_units if unit.locked_source_index == 0]
    seven_units = [unit for unit in seven.source_units if unit.locked_source_index == 0]

    assert len(five_units) == 10
    assert len(seven_units) == 35
    assert [
        (
            unit.occurrence.first_position,
            unit.occurrence.second_position,
            unit.occurrence.third_position,
        )
        for unit in five_units
    ] == [
        (1, 2, 3), (1, 2, 4), (1, 2, 5), (1, 3, 4), (1, 3, 5),
        (1, 4, 5), (2, 3, 4), (2, 3, 5), (2, 4, 5), (3, 4, 5),
    ]


def test_tianshu_historical_occurrence_requires_all_three_position_numbers():
    draws = history()
    draws[1] = {
        **draws[1],
        "numbers": ["01", "02", "04", "03", "05"],
        "sortedNumbers": ["01", "02", "04", "03", "05"],
        "drawOrderNumbers": ["01", "02", "04", "03", "05"],
    }
    explore = ExploreEngineSession.build("今彩539", draws)
    session = TianhengEngineSession.from_explore_session(explore, lock_count=3)
    context = next(
        item for item in session.contexts
        if item.number_order == "依號碼由小到大排序"
    )
    unit = next(
        item for item in context.source_units
        if item.locked_source_index == 0
        and item.occurrence.first_position == 1
        and item.occurrence.second_position == 2
        and item.occurrence.third_position == 3
    )

    occurrences = context.historical_occurrences(unit)

    assert 1 not in {occurrence.draw_index for occurrence in occurrences}
    assert all(
        (
            occurrence.first_number,
            occurrence.second_number,
            occurrence.third_number,
        ) == (1, 2, 3)
        for occurrence in occurrences
    )


def test_tianshu_same_period_range_excludes_all_three_locked_positions():
    context = tianshu_context()
    unit = context.source_units[0]

    cells = context.range_cells(unit.occurrence, unit.prediction_distance)
    same_period_positions = {
        cell.position for cell in cells if cell.relative_offset == 0
    }

    assert same_period_positions == {4, 5}
    assert context.drag_cell(unit.occurrence).position == unit.occurrence.first_position

