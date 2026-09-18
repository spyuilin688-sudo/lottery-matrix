from pathlib import Path

from app.domain.explore_engine import EngineMetrics, ExploreContext, SORTED_ORDER


def _history(count: int) -> list[dict[str, object]]:
    numbers = ["01", "02", "03", "04", "05"]
    return [
        {
            "period": f"P{index:03d}",
            "numbers": list(numbers),
            "sortedNumbers": list(numbers),
            "drawOrderNumbers": list(reversed(numbers)),
        }
        for index in range(count)
    ]


def test_occurrence_index_and_each_range_are_built_only_once() -> None:
    metrics = EngineMetrics()
    context = ExploreContext("今彩539", SORTED_ORDER, _history(160), metrics)
    unit = context.source_units[0]
    occurrence = context.historical_occurrences(unit)[20]

    first = context.range_cells(occurrence, 4)
    second = context.range_cells(occurrence, 4)
    first_drag = context.drag_cell(occurrence)
    second_drag = context.drag_cell(occurrence)

    assert first is second
    assert first_drag is second_drag
    assert metrics.occurrence_index_builds == 1
    assert metrics.range_cell_builds == 1


def test_index_size_is_linear_in_history_cells_not_rule_combinations() -> None:
    metrics = EngineMetrics()
    ExploreContext("今彩539", SORTED_ORDER, _history(160), metrics)

    assert metrics.indexed_cells == 160 * 5
    assert metrics.global_pair_enumerations == 0


def test_production_uses_canonical_runner_without_pair_product_helpers() -> None:
    service_root = Path(__file__).resolve().parents[1]
    artifact_builder = (service_root / "app/services/artifact_builders.py").read_text()
    state_engine = (service_root / "app/domain/explore_state.py").read_text()
    runtime = (service_root / "app/domain/explore_runtime.py").read_text()

    assert "run_explore_batch" in artifact_builder
    assert "run_explore_v2_batch" not in artifact_builder
    assert "itertools.combinations" not in state_engine
    assert "all_bc_candidates" not in state_engine
    assert "best_pair" not in state_engine
    assert "global_pair_enumerations" in state_engine
    assert "TIANYAN_HISTORY_LIMIT" not in runtime
