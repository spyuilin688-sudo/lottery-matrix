from collections.abc import Iterable

import app.domain.explore_v2 as explore_v2
from app.domain.explore_v2 import RoadType, run_explore_v2_batch


def _draw(period: str, ordered: Iterable[int]) -> dict[str, object]:
    values = [int(number) for number in ordered]
    strings = [str(number).zfill(2) for number in values]
    return {
        "lottery": "今彩539",
        "period": period,
        "numbers": strings,
        "sortedNumbers": sorted(strings),
        "drawOrderNumbers": list(reversed(strings)),
    }


def _base_history(count: int = 116) -> list[dict[str, object]]:
    return [_draw(f"P{index:03d}", [1, 6, 12, 28, 37]) for index in range(count)]


def _set_sorted(draw: dict[str, object], numbers: Iterable[int]) -> None:
    strings = [str(number).zfill(2) for number in numbers]
    draw["numbers"] = strings
    draw["sortedNumbers"] = sorted(strings)
    draw["drawOrderNumbers"] = list(reversed(strings))


def _full_only_one_code_history() -> list[dict[str, object]]:
    history = _base_history()
    _set_sorted(history[0], [10, 20, 25, 30, 35])
    _set_sorted(history[8], [1, 20, 25, 30, 35])
    result_numbers = (
        [1, 6, 12, 25, 37],
        [2, 7, 13, 25, 38],
        [3, 8, 14, 25, 39],
        [4, 9, 15, 25, 36],
        [5, 11, 16, 25, 35],
    )
    for group_index, source_index in enumerate((20, 40, 60, 80, 100)):
        _set_sorted(history[source_index], [10, 20, 25, 30, 35])
        _set_sorted(history[source_index + 8], [1, 20, 25, 30, 35])
        _set_sorted(history[source_index - 1], result_numbers[group_index])
    return history


def _same_prediction_two_code_history() -> list[dict[str, object]]:
    history = _base_history()
    _set_sorted(history[0], [10, 20, 25, 30, 35])
    group_specs = (
        (20, [5, 11, 16, 27, 38]),
        (25, [1, 8, 18, 29, 39]),
        (20, [5, 12, 17, 28, 37]),
        (25, [2, 9, 19, 30, 39]),
        (20, [5, 13, 21, 31, 36]),
    )
    for (base, result_numbers), source_index in zip(
        group_specs,
        (20, 40, 60, 80, 100),
        strict=True,
    ):
        _set_sorted(history[source_index], [10, base, 30, 34, 38])
        _set_sorted(history[source_index - 1], result_numbers)
    return history


def _constant_invalid_history() -> list[dict[str, object]]:
    return [_draw(f"P{index:03d}", [10, 20, 25, 30, 35]) for index in range(40)]


def _matching_items(
    result: dict[str, object],
    *,
    explore_range: str,
    algorithm_type: str,
    rule_count: int,
    reference_offset: int | None = None,
    reference_position: int | None = None,
) -> list[dict[str, object]]:
    items = result["artifact"]["items"]  # type: ignore[index]
    return [
        item
        for item in items
        if item["exploreRange"] == explore_range
        and item["algorithmType"] == algorithm_type
        and item["ruleCount"] == rule_count
        and (reference_offset is None or item.get("referenceOffset") == reference_offset)
        and (reference_position is None or item.get("referencePosition") == reference_position)
    ]


def test_standard_and_full_decide_final_results_independently(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(
            position=1,
            rule_sets=((7,),),
            explore_range="標準範圍",
        ),
        _cross_reference_pending(
            position=2,
            rule_sets=((17,),),
            explore_range="標準範圍",
        ),
        _cross_reference_pending(
            position=3,
            rule_sets=((26,),),
            explore_range="完整範圍",
        ),
    ]

    emitted = _flush_cross_reference_results(monkeypatch, pending)

    assert len(emitted) == 3
    assert sorted(args[-1] for args in emitted) == [
        "完整範圍",
        "標準範圍",
        "標準範圍",
    ]


def test_two_rules_predicting_one_number_emit_one_number() -> None:
    context = explore_v2.ExploreV2Context.build(
        "今彩539",
        explore_v2.SORTED_ORDER,
        _base_history(20),
    )
    unit = context.source_units()[0]
    reference_cell = explore_v2.VerificationCell(
        occurrence_index=0,
        period="P000",
        relative_offset=0,
        position=2,
        number=20,
        scope_class=explore_v2.ScopeClass.STANDARD_AND_FULL,
    )
    decision = explore_v2.StreakDecision(
        valid=True,
        highest_streak=5,
        rules=(25, 64),
        matched_group_indexes=tuple(range(5)),
        rule_sets=((25, 64),),
    )
    artifact: dict[str, object] = {"items": [], "validationById": {}}

    explore_v2._append_final_results(  # type: ignore[attr-defined]
        artifact,
        context,
        unit,
        reference_cell,
        RoadType.SUM,
        2,
        decision,
        (),
        "標準範圍",
    )

    items = artifact["items"]
    assert isinstance(items, list)
    assert len(items) == 1
    item = items[0]
    assert isinstance(item, dict)
    assert item["predictionNumbers"] == ["05"]
    validation_by_id = artifact["validationById"]
    assert isinstance(validation_by_id, dict)
    validation = validation_by_id[item["id"]]
    assert validation["ruleSets"][0]["rules"] == [
        {"value": 25, "display": "25", "algorithmType": "合值"},
        {"value": 64, "display": "64", "algorithmType": "合值"},
    ]


def test_invalid_and_intermediate_candidates_never_enter_final_artifact() -> None:
    result = run_explore_v2_batch("今彩539", _constant_invalid_history(), 0, 1)

    assert result["artifact"]["items"] == []
    assert result["artifact"]["validationById"] == {}


def test_drag_only_batch_never_builds_range_cells() -> None:
    result = run_explore_v2_batch(
        "今彩539",
        _constant_invalid_history(),
        0,
        1,
        road_types=(RoadType.DRAG,),
    )

    assert result["metrics"]["rangeCellBuilds"] == 0
    assert result["metrics"]["candidateBuilds"] == 0
    assert result["metrics"]["dragCandidateBuilds"] > 0


def test_batch_output_is_deterministic_and_range_specific() -> None:
    history = _full_only_one_code_history()

    first = run_explore_v2_batch("今彩539", history, 0, 1)
    second = run_explore_v2_batch("今彩539", history, 0, 1)

    assert first["artifact"] == second["artifact"]
    ids = [item["id"] for item in first["artifact"]["items"]]
    assert len(ids) == len(set(ids))
    assert all(item["exploreRange"] in {"標準範圍", "完整範圍"} for item in first["artifact"]["items"])


def test_checkpoint_shape_uses_global_thirteen_source_batch() -> None:
    result = run_explore_v2_batch("今彩539", _base_history(30), 10, 2)

    assert result["cursorStart"] == 10
    assert result["cursor"] == 12
    assert result["total"] == 130
    assert result["complete"] is False


def test_v2_runner_preserves_tianyan_builder_on_shared_candidates(monkeypatch: object) -> None:
    prepared_calls: list[dict[str, object]] = []

    def fake_tianyan(prepared: dict[str, object]) -> dict[str, object]:
        prepared_calls.append(prepared)
        return {
            "items": [{"id": "tianyan-from-v2"}],
            "validationById": {"tianyan-from-v2": {"rules": []}},
        }

    monkeypatch.setattr(explore_v2, "build_tianyan_unit_artifact", fake_tianyan)  # type: ignore[attr-defined]

    result = run_explore_v2_batch("今彩539", _full_only_one_code_history(), 0, 1)

    assert len(prepared_calls) == 1
    coordinates = prepared_calls[0]["coordinates"]
    assert any(coordinate["algorithmTypes"] == ["加減", "合值"] for coordinate in coordinates)
    assert any(coordinate["algorithmTypes"] == ["拖牌"] for coordinate in coordinates)
    assert result["artifact"]["tianyanItems"] == [{"id": "tianyan-from-v2"}]
    assert result["artifact"]["tianyanValidationById"] == {
        "tianyan-from-v2": {"rules": []}
    }



def _cross_reference_pending(
    *,
    position: int,
    rule_sets: tuple[tuple[int, ...], ...],
    highest_streak: int = 4,
    rule_count: int = 1,
    explore_range: str = "完整範圍",
) -> explore_v2.PendingExploreV2Result:
    rules = tuple(sorted({rule for rule_set in rule_sets for rule in rule_set}))
    return explore_v2.PendingExploreV2Result(
        reference_cell=explore_v2.VerificationCell(
            occurrence_index=position,
            period=f"P{position:03d}",
            relative_offset=-position,
            position=position,
            number=10 + position,
            scope_class=explore_v2.ScopeClass.STANDARD_AND_FULL,
        ),
        road=RoadType.ADD,
        rule_count=rule_count,
        decision=explore_v2.StreakDecision(
            valid=True,
            highest_streak=highest_streak,
            rules=rules,
            matched_group_indexes=tuple(range(highest_streak)),
            rule_sets=rule_sets,
        ),
        groups=(),
        explore_range=explore_range,
    )


def _flush_cross_reference_results(
    monkeypatch: object,
    pending: list[explore_v2.PendingExploreV2Result],
) -> list[tuple[object, ...]]:
    emitted: list[tuple[object, ...]] = []

    def record(*args: object, **_kwargs: object) -> None:
        emitted.append(args)

    monkeypatch.setattr(explore_v2, "_append_final_results", record)  # type: ignore[attr-defined]
    explore_v2._append_aggregated_results(  # type: ignore[attr-defined]
        {"items": [], "validationById": {}},
        object(),
        object(),
        pending,
    )
    return emitted


def test_cross_reference_three_distinct_one_code_rules_are_rejected(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(position=1, rule_sets=((7,),)),
        _cross_reference_pending(position=2, rule_sets=((17,),)),
        _cross_reference_pending(position=3, rule_sets=((26,),)),
    ]

    assert _flush_cross_reference_results(monkeypatch, pending) == []


def test_cross_reference_exactly_two_distinct_rules_are_preserved(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(position=1, rule_sets=((7,),)),
        _cross_reference_pending(position=2, rule_sets=((17,),)),
    ]

    assert len(_flush_cross_reference_results(monkeypatch, pending)) == 2


def test_cross_reference_duplicate_rules_count_once(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(position=1, rule_sets=((7,),)),
        _cross_reference_pending(position=2, rule_sets=((7,),)),
        _cross_reference_pending(position=3, rule_sets=((17,),)),
    ]

    assert len(_flush_cross_reference_results(monkeypatch, pending)) == 3


def test_cross_reference_different_streaks_are_not_combined(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(position=1, rule_sets=((7,),), highest_streak=4),
        _cross_reference_pending(position=2, rule_sets=((17,),), highest_streak=4),
        _cross_reference_pending(position=3, rule_sets=((26,),), highest_streak=5),
    ]

    assert len(_flush_cross_reference_results(monkeypatch, pending)) == 3


def test_cross_reference_two_code_union_over_two_rules_is_rejected(
    monkeypatch: object,
) -> None:
    pending = [
        _cross_reference_pending(
            position=1,
            rule_sets=((10, 20),),
            highest_streak=5,
            rule_count=2,
        ),
        _cross_reference_pending(
            position=2,
            rule_sets=((10, 30),),
            highest_streak=5,
            rule_count=2,
        ),
    ]

    assert _flush_cross_reference_results(monkeypatch, pending) == []
