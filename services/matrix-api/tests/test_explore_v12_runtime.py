import app.domain.explore_engine as explore_engine
import app.domain.explore_runtime as explore_runtime
from app.domain.explore_context import RoadGroup
from app.domain.explore_engine import (
    EngineMetrics,
    ExploreContext,
    RoadType,
    ScopeClass,
    StreakDecision,
    run_explore_batch,
)


def _constant_history(count: int = 116) -> list[dict[str, object]]:
    strings = ["01", "06", "12", "28", "37"]
    return [
        {
            "lottery": "今彩539",
            "period": f"P{count - index:04d}",
            "numbers": list(strings),
            "sortedNumbers": list(strings),
            "drawOrderNumbers": list(reversed(strings)),
        }
        for index in range(count)
    ]


def _set_numbers(draw: dict[str, object], numbers: list[int]) -> None:
    strings = [str(number).zfill(2) for number in numbers]
    draw["numbers"] = strings
    draw["sortedNumbers"] = sorted(strings)
    draw["drawOrderNumbers"] = list(reversed(strings))


def _known_full_only_one_code_history() -> list[dict[str, object]]:
    history = _constant_history()
    _set_numbers(history[0], [10, 20, 25, 30, 35])
    _set_numbers(history[8], [1, 20, 25, 30, 35])
    result_numbers = (
        [1, 6, 12, 25, 37],
        [2, 7, 13, 25, 38],
        [3, 8, 14, 25, 39],
        [4, 9, 15, 25, 36],
        [5, 11, 16, 25, 35],
    )
    for group_index, source_index in enumerate((20, 40, 60, 80, 100)):
        _set_numbers(history[source_index], [10, 20, 25, 30, 35])
        _set_numbers(history[source_index + 8], [1, 20, 25, 30, 35])
        _set_numbers(history[source_index - 1], list(result_numbers[group_index]))
    return history


def test_shared_cell_emits_one_canonical_result_with_shared_scope(monkeypatch) -> None:
    context = ExploreContext(
        "今彩539",
        "依號碼由小到大排序",
        _constant_history(),
        EngineMetrics(),
    )
    unit = context.source_units[0]
    cell = next(
        candidate
        for candidate in context.range_cells(unit.occurrence, unit.prediction_distance)
        if candidate.scope_class is ScopeClass.STANDARD_AND_FULL
    )
    artifact = {"items": [], "validationById": {}}

    monkeypatch.setattr(
        explore_runtime,
        "evaluate_one_code",
        lambda _groups: StreakDecision(True, 4, (1,), matched_group_indexes=()),
    )
    monkeypatch.setattr(
        explore_runtime,
        "evaluate_two_code",
        lambda _groups, _metrics: StreakDecision(False, 0, ()),
    )

    explore_runtime._evaluate_cell(
        artifact,
        context,
        unit,
        cell,
        RoadType.ADD,
        (),
        ScopeClass.STANDARD_AND_FULL,
    )

    assert len(artifact["items"]) == 1
    assert artifact["items"][0]["scopeClass"] == "STANDARD_AND_FULL"
    assert artifact["items"][0]["exploreRange"] == "標準範圍"


def test_batch_emits_known_full_only_one_code_result() -> None:
    history = _known_full_only_one_code_history()
    result = run_explore_batch(
        "今彩539",
        history,
        0,
        1,
        road_types=(RoadType.ADD,),
    )

    matches = [
        item
        for item in result["artifact"]["items"]
        if item["ruleCount"] == 1
        and item["algorithmType"] == "加減"
        and item["exploreRange"] == "完整範圍"
        and item.get("referenceOffset") == -8
        and item.get("referencePosition") == 1
        and item["predictionNumbers"] == ["25"]
    ]
    assert len(matches) == 1
    assert matches[0]["highestStreak"] == 5
    assert matches[0]["consecutive"] == "準5進6"
    assert matches[0]["id"] in result["artifact"]["validationById"]
    assert not any(
        item.get("referenceOffset") == -8
        and item.get("referencePosition") == 1
        and item["exploreRange"] == "標準範圍"
        for item in result["artifact"]["items"]
    )


def test_all_road_batch_reuses_shared_candidates_for_tianyan(monkeypatch) -> None:
    prepared_calls: list[dict[str, object]] = []

    def fake_tianyan(prepared: dict[str, object]) -> dict[str, object]:
        prepared_calls.append(prepared)
        return {
            "items": [{"id": "tianyan-v12", "predictionNumbers": ["25"]}],
            "validationById": {"tianyan-v12": {"rules": []}},
        }

    monkeypatch.setattr(
        explore_engine,
        "build_tianyan_unit_artifact",
        fake_tianyan,
    )
    history = _known_full_only_one_code_history()
    result = run_explore_batch("今彩539", history, 0, 1)

    assert len(prepared_calls) == 1
    coordinates = prepared_calls[0]["coordinates"]
    assert isinstance(coordinates, list)
    assert any(
        coordinate["algorithmTypes"] == ["加減", "合值"]
        for coordinate in coordinates
    )
    assert any(
        coordinate["algorithmTypes"] == ["拖牌"]
        for coordinate in coordinates
    )
    assert result["artifact"]["tianyanItems"] == [
        {"id": "tianyan-v12", "predictionNumbers": ["25"]}
    ]
    assert result["artifact"]["tianyanValidationById"] == {
        "tianyan-v12": {"rules": []}
    }


def test_one_code_two_tied_rules_emit_no_result() -> None:
    history = _constant_history(20)
    context = ExploreContext(
        "今彩539",
        "依號碼由小到大排序",
        history,
        EngineMetrics(),
    )
    unit = context.source_units[0]
    cell = context.range_cells(unit.occurrence, unit.prediction_distance)[0]
    rules = (1, 2)
    decision = StreakDecision(
        True,
        4,
        rules,
        matched_group_indexes=(0, 1, 2, 3),
        top_rule_sets=(rules,),
    )
    groups = tuple(
        RoadGroup(
            occurrence=unit.occurrence,
            reference_cell=cell,
            result_draw_index=0,
            candidate_targets=((1, (2,)), (2, (3,))),
        )
        for _ in range(4)
    )
    artifact: dict[str, object] = {"items": [], "validationById": {}}

    explore_runtime._append_result(
        artifact,
        context,
        unit,
        cell,
        RoadType.ADD,
        1,
        decision,
        groups,
        "完整範圍",
    )

    items = artifact["items"]
    assert isinstance(items, list)
    assert items == []
