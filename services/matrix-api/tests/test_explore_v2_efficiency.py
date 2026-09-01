from app.domain.explore_v2 import SORTED_ORDER, ExploreV2Context, LockKey


def _history(count: int) -> list[dict[str, object]]:
    numbers = ["01", "02", "03", "04", "05"]
    return [
        {
            "period": f"P{index:03d}",
            "numbers": numbers,
            "sortedNumbers": numbers,
            "drawOrderNumbers": numbers,
        }
        for index in range(count)
    ]


def test_occurrence_index_and_each_range_are_built_only_once() -> None:
    context = ExploreV2Context.build("今彩539", SORTED_ORDER, _history(160))
    key = LockKey("今彩539", SORTED_ORDER, 1, 1)
    occurrence = context.occurrences_for(key)[20]

    assert context.occurrences_for(key) is context.occurrences_for(key)
    first = context.range_cells(occurrence, 4)
    second = context.range_cells(occurrence, 4)
    first_drag = context.drag_cell(occurrence)
    second_drag = context.drag_cell(occurrence)

    assert first is second
    assert first_drag is second_drag
    assert context.occurrence_index_build_count == 1
    assert tuple(context.range_build_counts.values()) == (1,)
    assert tuple(context.drag_build_counts.values()) == (1,)


def test_index_size_is_linear_in_history_cells_not_rule_combinations() -> None:
    context = ExploreV2Context.build("今彩539", SORTED_ORDER, _history(160))

    assert context.indexed_cell_count == 160 * 5
    assert sum(len(occurrences) for occurrences in context.occurrence_index.values()) == 160 * 5
