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


def test_zero_is_drag_and_validation_keeps_full_draws() -> None:
    history = [
        draw("A", [10, 20, 25, 30, 35]), draw("P1", [1, 2, 3, 4, 20]),
        draw("S1", [10, 20, 25, 30, 35]),
    ]
    result = run_matrix_algorithm_with_history(REQUEST, history)
    zero_rules = [rule for item in rule_sets(result) for rule in item["rules"] if rule["value"] == 0]
    assert [rule["algorithmType"] for rule in zero_rules] == ["拖牌"]
    row = rule_sets(result)[0]["historicalValidation"][0]
    assert row["sourceSortedNumbers"] == ["10", "20", "25", "30", "35"]
    assert row["referenceSortedNumbers"] == ["10", "20", "25", "30", "35"]
    assert row["predictionNumbers"] == ["01", "02", "03", "04", "20"]


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
