import pytest

from app.domain.explore_engine import (
    DRAW_ORDER,
    SORTED_ORDER,
    AlgorithmError,
    EngineMetrics,
    ExploreContext,
    ExploreEngineSession,
    RoadType,
    run_explore_batch,
)


def _history(count: int = 42) -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    for index in range(count):
        numbers: list[int] = []
        cursor = (index * 17 + 3) % 39
        step = (index % 17) + 1
        while len(numbers) < 5:
            cursor = (cursor + step) % 39
            number = cursor + 1
            if number not in numbers:
                numbers.append(number)
            step = (step + 2) % 38 + 1
        strings = [str(number).zfill(2) for number in numbers]
        output.append(
            {
                "lottery": "今彩539",
                "period": f"P{count - index:04d}",
                "numbers": strings,
                "sortedNumbers": sorted(strings),
                "drawOrderNumbers": list(reversed(strings)),
            }
        )
    return output


def test_context_builds_full_history_index_and_thirteen_sources_once() -> None:
    metrics = EngineMetrics()
    context = ExploreContext("今彩539", SORTED_ORDER, _history(100), metrics)

    assert len(context.source_units) == 65
    assert metrics.occurrence_index_builds == 1
    assert metrics.indexed_cells == 500


def test_range_and_candidate_cells_are_cached_once() -> None:
    metrics = EngineMetrics()
    context = ExploreContext("今彩539", SORTED_ORDER, _history(), metrics)
    occurrence = context.source_units[0].occurrence

    first_range = context.range_cells(occurrence, 1)
    second_range = context.range_cells(occurrence, 1)
    first_candidates = context.range_candidate_cells(occurrence, 1)
    second_candidates = context.range_candidate_cells(occurrence, 1)

    assert first_range is second_range
    assert first_candidates is second_candidates
    assert metrics.range_cell_builds == 1
    assert metrics.candidate_builds == 1


def test_drag_candidate_path_never_builds_range_cells() -> None:
    metrics = EngineMetrics()
    context = ExploreContext("今彩539", SORTED_ORDER, _history(), metrics)
    unit = context.source_units[0]
    history_occurrences = context.historical_occurrences(unit)

    if history_occurrences:
        context.drag_candidate_targets(history_occurrences[0], unit.prediction_distance)

    assert metrics.range_cell_builds == 0
    assert metrics.candidate_builds == 0
    assert metrics.drag_candidate_builds <= 1


def test_draw_order_requires_complete_draw_order_data() -> None:
    history = _history()
    del history[0]["drawOrderNumbers"]

    with pytest.raises(AlgorithmError):
        ExploreContext("今彩539", DRAW_ORDER, history, EngineMetrics())


def test_engine_session_builds_both_orders_without_rebuilding_per_checkpoint() -> None:
    history = _history()
    session = ExploreEngineSession.build("今彩539", history)

    assert len(session.contexts) == 2
    assert len(session.indexed_units) == 130
    assert session.matches("今彩539", history)


def test_batch_uses_global_thirteen_source_checkpoint_shape() -> None:
    history = _history()
    session = ExploreEngineSession.build("今彩539", history)
    result = run_explore_batch(
        "今彩539",
        history,
        10,
        2,
        road_types=(RoadType.DRAG,),
        session=session,
    )

    assert result["cursorStart"] == 10
    assert result["cursor"] == 12
    assert result["total"] == 130
    assert result["complete"] is False
    assert result["metrics"]["globalPairEnumerations"] == 0
    assert result["artifact"]["lottery"] == "今彩539"
    assert isinstance(result["artifact"]["items"], list)
    assert "validationById" in result["artifact"]
    assert "tianyanItems" in result["artifact"]
    assert "tianyanValidationById" in result["artifact"]
