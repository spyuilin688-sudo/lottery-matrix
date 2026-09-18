import pytest

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


def locked_two_history(streak: int) -> list[dict]:
    chronological = []
    for index in range(1, streak + 1):
        if index == streak:
            prediction = [1, 2, 3, 4, 21]
        elif index == streak - 1:
            prediction = [5, 6, 7, 8, 22]
        else:
            prediction = [21 if index % 2 == 0 else 22, 23, 24, 25, 26]
        chronological.extend([
            draw(f"S{index}", [10, 20, 30, 35, 39]),
            draw(f"P{index}", prediction),
        ])
    chronological.append(draw("A", [10, 20, 30, 35, 39]))
    return list(reversed(chronological))


def test_normalization_wraps_each_lottery_range() -> None:
    assert normalize_matrix_number(44, 39) == 5
    assert normalize_matrix_number(54, 49) == 5
    assert normalize_matrix_number(0, 39) == 39


def test_zero_from_non_locked_reference_stays_addition_and_validation_keeps_full_draws() -> None:
    history = [draw("A", [10, 20, 25, 30, 35])]
    for index in range(4, 0, -1):
        history.extend([
            draw(f"P{index}", [1, 2, 3, 4, 20]),
            draw(f"S{index}", [10, 20, 25, 30, 35]),
        ])
    result = run_matrix_algorithm_with_history(REQUEST, history)
    zero_rules = [rule for item in rule_sets(result) for rule in item["rules"] if rule["value"] == 0]
    assert [rule["algorithmType"] for rule in zero_rules] == ["加減"]
    row = rule_sets(result)[0]["historicalValidation"][0]
    assert row["sourceSortedNumbers"] == ["10", "20", "25", "30", "35"]
    assert row["referenceSortedNumbers"] == ["10", "20", "25", "30", "35"]
    assert row["predictionNumbers"] == ["01", "02", "03", "04", "20"]


def test_locked_one_code_rejects_entire_road_at_eight_groups() -> None:
    chronological = []
    for index in range(1, 15):
        chronological.extend([
            draw(f"S{index}", [10, 20, 25, 30, 35]),
            draw(f"P{index}", [1, 2, 3, 4, 25]),
        ])
    chronological.append(draw("A", [10, 20, 25, 30, 35]))
    result = run_matrix_algorithm_with_history(REQUEST, list(reversed(chronological)))
    assert result["valid"] is False
    assert result["highestStreak"] == 8
    assert result["reason"] == "鎖定1碼連準達8次（包含8）以上，整條版路無效，不得截短"
    assert rule_sets(result) == []


def test_locked_two_codes_rejects_entire_road_at_twelve_groups() -> None:
    chronological = []
    for index in range(1, 13):
        if index == 12:
            prediction = [1, 2, 3, 4, 21]
        elif index == 11:
            prediction = [5, 6, 7, 8, 22]
        else:
            prediction = [21 if index % 2 == 0 else 22, 23, 24, 25, 26]
        chronological.extend([
            draw(f"S{index}", [10, 20, 30, 35, 39]),
            draw(f"P{index}", prediction),
        ])
    chronological.append(draw("A", [10, 20, 30, 35, 39]))

    result = run_matrix_algorithm_with_history(
        {**REQUEST, "ruleCount": 2},
        list(reversed(chronological)),
    )

    assert result["valid"] is False
    assert result["highestStreak"] == 12
    assert result["reason"] == "鎖定2碼連準達12次（包含12）以上，整條版路無效，不得截短"
    assert rule_sets(result) == []


@pytest.mark.parametrize("streak", [8, 10])
def test_locked_two_codes_do_not_output_excluded_streaks(streak: int) -> None:
    result = run_matrix_algorithm_with_history(
        {**REQUEST, "ruleCount": 2},
        locked_two_history(streak),
    )

    assert result["valid"] is False
    assert result["highestStreak"] == streak
    assert rule_sets(result) == []


def test_current_result_is_source_prediction_not_historical_validation() -> None:
    history = [draw("CURRENT_RESULT", [1, 2, 3, 4, 25]), draw("A", [10, 20, 25, 30, 35])]
    for index in range(4, 0, -1):
        history.extend([
            draw(f"P{index}", [1, 2, 3, 4, 25]),
            draw(f"S{index}", [10, 20, 25, 30, 35]),
        ])
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
    assert result["reason"] == "相同最長連準出現超過2條可延續共同值，整條版路無效，不得輸出兩兩組合"
    assert result["highestStreak"] == 3
    assert len(result["conflictingRules"]) > 2
    assert rule_sets(result) == []


def test_combine_road_keeps_full_sum_as_rule_value() -> None:
    history = [draw("A", [10, 35, 36, 37, 38])]
    for index in range(4, 0, -1):
        history.extend([
            draw(f"P{index}", [1, 2, 3, 4, 29]),
            draw(f"S{index}", [10, 30, 31, 32, 33]),
        ])
    result = run_matrix_algorithm_with_history(
        {**REQUEST, "algorithmType": "合值版路"},
        history,
    )

    combined_59 = next(
        (item for item in rule_sets(result) if item["rules"][0]["value"] == 59),
        None,
    )

    assert combined_59 is not None
    assert combined_59["rules"] == [{"algorithmType": "合值", "value": 59, "display": "59"}]
    assert combined_59["predictionNumbers"] == [24]
