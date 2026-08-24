import pytest

from app.domain.tiangong import enumerate_equal_spacing_sequences, evaluate_tiangong_candidate


def candidate(**overrides) -> dict:
    value = {
        "lottery": "今彩539", "periodRange": 50, "sourceSequence": [1, 3, 5],
        "mode": "one-stage", "hitCondition": "準2進3", "exploreDirection": "固定",
        "baseNumber": 10,
        "firstStage": {"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 5, "nextN": 2},
        "validationRows": [],
    }
    value.update(overrides)
    return value


def test_enumerates_complete_equal_spacing_sequences() -> None:
    assert [1, 25, 49] in enumerate_equal_spacing_sequences(50, "準2進3")
    assert [1, 26, 51] not in enumerate_equal_spacing_sequences(50, "準2進3")
    assert [1, 8, 15, 22] in enumerate_equal_spacing_sequences(50, "準3進4")
    with pytest.raises(ValueError, match="INVALID_PERIOD_RANGE"):
        enumerate_equal_spacing_sequences(49, "準2進3")


def test_source_spacing_and_hit_count_are_validated() -> None:
    assert evaluate_tiangong_candidate(candidate(sourceSequence=[1, 3, 6]))["reason"] == "INVALID_SOURCE_SEQUENCE"
    assert evaluate_tiangong_candidate(candidate(hitCondition="準3進4"))["reason"] == "INVALID_SOURCE_SEQUENCE"


def test_prediction_distance_is_independent_from_source_spacing() -> None:
    one = evaluate_tiangong_candidate(candidate(
        sourceSequence=[5, 12, 19],
        firstStage={"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 2, "nextN": 5},
    ))
    assert (one["valid"], one["interval"], one["predictionDistance"]) == (True, 7, 1)
    two = evaluate_tiangong_candidate(candidate(
        sourceSequence=[14, 18, 22], mode="two-stage",
        firstStage={"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 2, "nextN": 9},
        secondStage={"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 3, "nextN": 5},
    ))
    assert (two["valid"], two["interval"], two["predictionDistance"]) == (True, 4, 1)


@pytest.mark.parametrize("algorithm,value,valid", [
    ("加減", 49, True), ("加減", -49, True), ("加減", 50, False), ("加減", -50, False),
    ("合值", 1, True), ("合值", 98, True), ("合值", 0, False), ("合值", 99, False),
])
def test_rule_boundaries(algorithm: str, value: int, valid: bool) -> None:
    stage = {"startPosition": 1, "direction": "固定", "algorithmType": algorithm, "value": value, "nextN": 1}
    assert evaluate_tiangong_candidate(candidate(firstStage=stage))["valid"] is valid


def test_drag_range_position_and_two_stage_identity() -> None:
    drag = evaluate_tiangong_candidate(candidate(firstStage={"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 0, "nextN": 1}))
    assert (drag["roadType"], drag["predictionNumber"]) == ("拖牌版路", "10")
    assert evaluate_tiangong_candidate(candidate(lottery="今彩539", baseNumber=39))["predictionNumber"] == "05"
    assert evaluate_tiangong_candidate(candidate(lottery="六合彩", baseNumber=49))["predictionNumber"] == "05"
    two = evaluate_tiangong_candidate(candidate(
        mode="two-stage",
        firstStage={"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 5, "nextN": 1},
        secondStage={"startPosition": 2, "direction": "固定", "algorithmType": "合值", "value": 30, "nextN": 1},
    ))
    assert (two["predictionNumber"], two["predictedPosition"], two["roadType"], two["stageCount"]) == ("15", 2, "加減＋合值", 2)


def test_direction_and_future_period_are_enforced() -> None:
    positions = [("固定", 2, 2), ("依序遞增", 1, 3), ("依序遞減", 5, 3)]
    for direction, start, expected in positions:
        stage = {"startPosition": start, "direction": direction, "algorithmType": "加減", "value": 1, "nextN": 1}
        assert evaluate_tiangong_candidate(candidate(firstStage=stage))["predictedPosition"] == expected
    invalid = candidate(sourceSequence=[5, 12, 19], firstStage={"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 1, "nextN": 4})
    assert evaluate_tiangong_candidate(invalid)["reason"] == "PREDICTION_NOT_FUTURE"
