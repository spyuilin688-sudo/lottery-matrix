from app.domain.explore import normalize_matrix_number, run_matrix_algorithm_with_history


def draw(period: str, numbers: list[int]) -> dict:
    values = [str(number).zfill(2) for number in numbers]
    return {"period": period, "drawDate": "", "numbers": values, "sortedNumbers": values, "drawOrderNumbers": values}


REQUEST = {
    "lottery": "今彩539", "numberOrder": "依號碼由小到大", "lockedPosition": 1,
    "lockedNumber": 10, "referenceOffset": 0, "referencePosition": 2,
    "predictionDistance": 1, "ruleCount": 1, "algorithmType": "加減版路",
}


def rule_sets(result: dict) -> list[dict]:
    return result.get("results") or result.get("ruleSets") or []


def test_normalization_wraps_each_lottery_range() -> None:
    assert normalize_matrix_number(44, 39) == 5
    assert normalize_matrix_number(54, 49) == 5
    assert normalize_matrix_number(0, 39) == 39


def test_zero_stays_add_subtract_when_reference_is_not_the_locked_ball() -> None:
    request = {
        **REQUEST,
        "lockedPosition": 4,
        "lockedNumber": 32,
        "referenceOffset": -1,
        "referencePosition": 1,
    }
    history = [
        draw("A", [4, 14, 27, 32, 34]),
        draw("RA", [9, 12, 20, 30, 35]),
        draw("P1", [1, 6, 18, 25, 36]),
        draw("S1", [2, 6, 22, 32, 36]),
        draw("R1", [18, 20, 25, 30, 35]),
    ]

    result = run_matrix_algorithm_with_history(request, history)
    zero_sets = [
        item for item in rule_sets(result)
        if item["rules"] == [{"algorithmType": "加減", "value": 0, "display": "+0"}]
    ]

    assert len(zero_sets) == 1
    assert zero_sets[0]["predictionNumbers"] == [9]


def test_add_subtract_suppression_applies_only_to_the_exact_source_and_position() -> None:
    history = [
        draw("A", [10, 20, 25, 30, 35]),
        draw("RA", [20, 22, 26, 32, 38]),
        draw("P1", [2, 10, 14, 20, 29]),
        draw("S1", [10, 20, 24, 31, 36]),
        draw("R1", [20, 23, 27, 33, 39]),
    ]

    exact_reference = run_matrix_algorithm_with_history({
        **REQUEST,
        "referenceOffset": 0,
        "referencePosition": 1,
    }, history)

    assert exact_reference["valid"] is False
    assert rule_sets(exact_reference) == []

    for reference in (
        {"referenceOffset": -1, "referencePosition": 1},
        {"referenceOffset": 0, "referencePosition": 2},
    ):
        result = run_matrix_algorithm_with_history({**REQUEST, **reference}, history)
        zero_sets = [
            item for item in rule_sets(result)
            if item["rules"] == [{"algorithmType": "加減", "value": 0, "display": "+0"}]
        ]

        assert len(zero_sets) == 1
        assert zero_sets[0]["predictionNumbers"] == [20]


def test_validation_keeps_full_draws() -> None:
    history = [
        draw("A", [10, 20, 25, 30, 35]), draw("P1", [1, 2, 3, 4, 25]),
        draw("S1", [10, 20, 25, 30, 35]),
    ]
    result = run_matrix_algorithm_with_history(REQUEST, history)
    row = rule_sets(result)[0]["historicalValidation"][0]
    assert row["sourceSortedNumbers"] == ["10", "20", "25", "30", "35"]
    assert row["referenceSortedNumbers"] == ["10", "20", "25", "30", "35"]
    assert row["predictionNumbers"] == ["01", "02", "03", "04", "25"]


def test_validation_stops_at_thirteen_groups() -> None:
    chronological = []
    for index in range(1, 15):
        chronological.extend([
            draw(f"S{index}", [10, 20, 25, 30, 35]),
            draw(f"P{index}", [1, 2, 3, 4, 25]),
        ])
    chronological.append(draw("A", [10, 20, 25, 30, 35]))
    result = run_matrix_algorithm_with_history(REQUEST, list(reversed(chronological)))
    assert result["highestStreak"] == 13
    assert len(rule_sets(result)[0]["historicalValidation"]) == 13


def test_current_result_is_source_prediction_not_historical_validation() -> None:
    history = [
        draw("CURRENT_RESULT", [1, 2, 3, 4, 25]), draw("A", [10, 20, 25, 30, 35]),
        draw("P1", [1, 2, 3, 4, 25]), draw("S1", [10, 20, 25, 30, 35]),
    ]
    result = run_matrix_algorithm_with_history(REQUEST, history)
    periods = [row["predictionPeriod"] for item in rule_sets(result) for row in item["historicalValidation"]]
    assert result["sourceA"]["predictionPeriod"] == "CURRENT_RESULT"
    assert "CURRENT_RESULT" not in periods


def test_missing_draw_order_is_rejected_without_sorted_fallback() -> None:
    history = [draw("A", [10, 20, 25, 30, 35]), draw("P1", [1, 2, 3, 4, 25]), draw("S1", [10, 20, 25, 30, 35])]
    history[0]["drawOrderNumbers"] = None
    request = {**REQUEST, "numberOrder": "依實際開獎順序"}
    result = run_matrix_algorithm_with_history(request, history)
    assert result["valid"] is False
    assert result["missingDrawOrderCount"] == 1


def test_drag_rules_do_not_rescue_invalid_two_code_add_subtract_road() -> None:
    history = [
        draw("A", [10, 23, 32, 33, 34]),
        draw("P3", [1, 2, 3, 11, 12]),
        draw("S3", [10, 22, 32, 33, 34]),
        draw("P2", [4, 5, 6, 11, 12]),
        draw("S2", [10, 21, 32, 33, 34]),
        draw("P1", [7, 8, 9, 11, 12]),
        draw("S1", [10, 20, 32, 33, 34]),
    ]

    result = run_matrix_algorithm_with_history({**REQUEST, "ruleCount": 2}, history)

    assert result["valid"] is False
    assert result["highestStreak"] == 3
    assert result["conflictingRules"] == [28, 29, 30]
    assert rule_sets(result) == []


def test_combine_road_keeps_full_sum_as_rule_value() -> None:
    result = run_matrix_algorithm_with_history({**REQUEST, "algorithmType": "合值版路"}, [
        draw("A", [10, 35, 36, 37, 38]),
        draw("P1", [1, 2, 3, 4, 29]),
        draw("S1", [10, 30, 31, 32, 33]),
    ])

    combined_59 = next(
        (item for item in rule_sets(result) if item["rules"][0]["value"] == 59),
        None,
    )

    assert combined_59 is not None
    assert combined_59["rules"] == [{"algorithmType": "合值", "value": 59, "display": "59"}]
    assert combined_59["predictionNumbers"] == [24]


def test_combine_road_omits_out_of_range_complements_instead_of_wrapping() -> None:
    request = {
        **REQUEST,
        "lockedPosition": 3,
        "lockedNumber": 7,
        "referenceOffset": -1,
        "referencePosition": 5,
        "algorithmType": "合值版路",
    }
    history = [
        draw("A", [1, 4, 7, 20, 30]),
        draw("RA", [2, 8, 14, 20, 26]),
        draw("P1", [32, 33, 34, 36, 39]),
        draw("S1", [1, 4, 7, 20, 30]),
        draw("R1", [2, 8, 14, 20, 35]),
    ]

    result = run_matrix_algorithm_with_history(request, history)

    assert result["valid"] is False
    assert rule_sets(result) == []


def test_combine_road_keeps_a_valid_candidate_when_its_pair_is_out_of_range() -> None:
    groups = [
        (draw("S1", [10, 11, 25, 30, 35]), draw("P1", [1, 5, 19, 28, 37])),
        (draw("S2", [10, 20, 25, 30, 35]), draw("P2", [2, 7, 15, 26, 39])),
        (draw("S3", [10, 12, 25, 30, 35]), draw("P3", [3, 8, 18, 27, 38])),
        (draw("S4", [10, 21, 25, 30, 35]), draw("P4", [3, 10, 18, 30, 38])),
        (draw("S5", [10, 13, 25, 30, 35]), draw("P5", [4, 11, 17, 25, 34])),
    ]
    history = [draw("A", [10, 35, 36, 37, 38])]
    for source, prediction in reversed(groups):
        history.extend([prediction, source])

    result = run_matrix_algorithm_with_history({
        **REQUEST,
        "referencePosition": 2,
        "ruleCount": 2,
        "algorithmType": "合值版路",
    }, history)

    assert result["valid"] is True
    assert len(rule_sets(result)) == 1
    assert rule_sets(result)[0]["rules"] == [
        {"algorithmType": "合值", "value": 30, "display": "30"},
        {"algorithmType": "合值", "value": 59, "display": "59"},
    ]
    assert rule_sets(result)[0]["predictionNumbers"] == [24]
