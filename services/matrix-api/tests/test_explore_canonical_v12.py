import pytest

import app.domain.explore_engine as explore_engine
from app.domain.explore_engine import (
    DRAW_ORDER,
    SORTED_ORDER,
    AlgorithmError,
    EngineMetrics,
    ExploreContext,
    ExploreEngineSession,
    INVALID_MORE_THAN_TWO_LONGEST,
    INVALID_ONE_CODE_MAXIMUM,
    INVALID_ONE_CODE_NOT_EXACT,
    INVALID_SINGLE_USE_ENDPOINT,
    INVALID_TWO_CODE_MAXIMUM,
    RoadType,
    apply_candidate,
    candidate_value,
    evaluate_one_code,
    evaluate_two_code,
    run_explore_batch,
)


def _repeat(values: set[int], count: int) -> list[set[int]]:
    return [set(values) for _ in range(count)]


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


def _set_numbers(draw: dict[str, object], numbers: list[int]) -> None:
    strings = [str(number).zfill(2) for number in numbers]
    draw["numbers"] = strings
    draw["sortedNumbers"] = sorted(strings)
    draw["drawOrderNumbers"] = list(reversed(strings))


def _known_full_only_one_code_history() -> list[dict[str, object]]:
    history = _history(116)
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
        _set_numbers(history[source_index - 1], result_numbers[group_index])
    return history


def test_add_and_drag_allow_zero_rule_value() -> None:
    assert candidate_value(RoadType.ADD, 12, 12, 39) == 0
    assert candidate_value(RoadType.DRAG, 12, 12, 39) == 0
    assert apply_candidate(RoadType.ADD, 12, 0, 39) == 12
    assert apply_candidate(RoadType.DRAG, 12, 0, 39) == 12


def test_one_code_requires_exactly_one_highest_rule() -> None:
    decision = evaluate_one_code(_repeat({10, 20}, 4))

    assert decision.valid is False
    assert decision.highest_streak == 4
    assert decision.rules == (10, 20)
    assert decision.reason == INVALID_ONE_CODE_NOT_EXACT
    assert decision.top_rule_sets == ()


def test_one_code_eight_or_more_invalidates_without_truncation() -> None:
    decision = evaluate_one_code(_repeat({10}, 20))

    assert decision.valid is False
    assert decision.highest_streak == 8
    assert decision.reason == INVALID_ONE_CODE_MAXIMUM


def test_two_code_b_c_can_have_no_common_value_and_later_form() -> None:
    decision = evaluate_two_code([{10}, {24}, {10}, {10}, {24}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 5


def test_two_code_second_rule_may_first_form_at_f() -> None:
    decision = evaluate_two_code([{10}, {10}, {10}, {10}, {10, 24}, {10}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 6


def test_two_code_f_may_contain_first_and_second_rule_same_occurrence() -> None:
    decision = evaluate_two_code([{10}, {10}, {10}, {10}, {10, 24}, {10}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 6
    assert decision.matched_group_indexes == (0, 1, 2, 3, 4, 5)


def test_two_code_same_occurrence_two_hits_count_once() -> None:
    decision = evaluate_two_code([{10}, {24}, {10, 24}, {10}, {24}])

    assert decision.valid
    assert decision.highest_streak == 5
    assert decision.matched_group_indexes == (0, 1, 2, 3, 4)


def test_two_code_retains_all_top_pairs_before_over_two_rule_check() -> None:
    decision = evaluate_two_code(_repeat({10, 20, 30}, 5))

    assert decision.valid is False
    assert decision.highest_streak == 5
    assert decision.rules == (10, 20, 30)
    assert decision.reason == INVALID_MORE_THAN_TWO_LONGEST
    assert set(decision.top_rule_sets) == {(10, 20), (10, 30), (20, 30)}


def test_two_code_twelve_or_more_invalidates_pair_without_truncation() -> None:
    groups = [{10} if i % 2 == 0 else {24} for i in range(30)]
    decision = evaluate_two_code(groups)

    assert decision.valid is False
    assert decision.highest_streak == 12
    assert decision.reason == INVALID_TWO_CODE_MAXIMUM


def test_two_code_single_use_rule_only_valid_in_middle() -> None:
    head = evaluate_two_code([{24}, {10}, {10}, {10}, {10}])
    middle = evaluate_two_code([{10}, {24}, {10}, {10}, {10}])
    tail = evaluate_two_code([{10}, {10}, {10}, {10}, {24}])

    assert not head.valid and head.reason == INVALID_SINGLE_USE_ENDPOINT
    assert middle.valid
    assert not tail.valid and tail.reason == INVALID_SINGLE_USE_ENDPOINT


def test_two_code_never_performs_global_pair_enumeration() -> None:
    metrics = EngineMetrics()
    evaluate_two_code(
        [
            {1, 2, 3, 4, 5},
            {6, 7, 8, 9, 10},
            {1, 6},
            {1, 6},
            {1, 6},
        ],
        metrics,
    )

    assert metrics.global_pair_enumerations == 0
    assert metrics.max_active_first_states <= 5


def test_two_distinct_rules_can_predict_the_same_number() -> None:
    assert apply_candidate(RoadType.SUM, 20, 25, 39) == 5
    assert apply_candidate(RoadType.SUM, 20, 64, 39) == 5


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
        raising=False,
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
