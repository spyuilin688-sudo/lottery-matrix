import app.domain.explore_v2 as legacy


def test_one_code_requires_exactly_one_longest_rule() -> None:
    """準4+ 是鎖定1碼；同座標兩個同長最高值不得拆成兩筆結果。"""
    decision = legacy.evaluate_one_code(
        [
            {10, 20},
            {10, 20},
            {10, 20},
            {10, 20},
        ]
    )

    assert decision.valid is False
    assert decision.highest_streak == 4
    assert decision.rules == (10, 20)
    assert decision.rule_sets == ()


def test_different_reference_coordinates_are_independent_roads(monkeypatch: object) -> None:
    """不同 referenceOffset/position 是不同版路，不得跨座標合併成 >2 值後整批淘汰。"""
    emitted: list[tuple[object, ...]] = []

    def record(*args: object, **_kwargs: object) -> None:
        emitted.append(args)

    monkeypatch.setattr(legacy, "_append_final_results", record)

    pending = []
    for position, rule in ((1, 7), (2, 17), (3, 26)):
        pending.append(
            legacy.PendingExploreV2Result(
                reference_cell=legacy.VerificationCell(
                    occurrence_index=position,
                    period=f"P{position:03d}",
                    relative_offset=-position,
                    position=position,
                    number=10 + position,
                    scope_class=legacy.ScopeClass.STANDARD_AND_FULL,
                ),
                road=legacy.RoadType.ADD,
                rule_count=1,
                decision=legacy.StreakDecision(
                    valid=True,
                    highest_streak=4,
                    rules=(rule,),
                    matched_group_indexes=(0, 1, 2, 3),
                    rule_sets=((rule,),),
                ),
                groups=(),
                explore_range="完整範圍",
            )
        )

    legacy._append_aggregated_results(
        {"items": [], "validationById": {}},
        object(),
        object(),
        pending,
    )

    assert len(emitted) == 3
