from app.domain.tianyan import evaluate_tianyan_candidate


def candidate(hit_pairs: list[tuple[bool, bool]]) -> dict:
    return {
        "lottery": "今彩539",
        "rules": [
            {"id": "r1", "referenceOffset": -1, "referencePosition": 1, "algorithmType": "加減", "value": 0, "currentBaseNumber": 3},
            {"id": "r2", "referenceOffset": -1, "referencePosition": 2, "algorithmType": "加減", "value": 5, "currentBaseNumber": 10},
        ],
        "groups": [
            {
                "id": f"g{index + 1}", "sourcePeriod": str(100 + index),
                "predictionPeriod": str(101 + index), "predictionNumbers": [],
                "rule1": {"baseNumber": 1, "predictionNumber": 1, "hit": left},
                "rule2": {"baseNumber": 2, "predictionNumber": 2, "hit": right},
            }
            for index, (left, right) in enumerate(hit_pairs)
        ],
    }


def test_both_hit_is_not_independent_contribution() -> None:
    assert evaluate_tianyan_candidate(candidate([(True, True)] * 6))["valid"] is False


def test_requires_ceil_thirty_percent_for_each_rule() -> None:
    value = candidate([(True, False)] * 2 + [(False, True)] * 2 + [(True, True)] * 6)
    result = evaluate_tianyan_candidate(value)
    assert result["minimumIndependentHits"] == 3
    assert result["valid"] is False


def test_rejects_uncovered_group_and_same_rule_identity() -> None:
    uncovered = candidate([(True, False), (False, True), (False, False)])
    assert evaluate_tianyan_candidate(uncovered)["reason"] == "UNCOVERED_GROUP"
    same = candidate([(True, False), (False, True), (True, False), (False, True)])
    same["rules"][1]["referencePosition"] = 1
    assert evaluate_tianyan_candidate(same)["reason"] == "SAME_POSITION_AND_ALGORITHM"


def test_stops_at_first_both_miss_and_ignores_older_groups() -> None:
    hits = (
        [(True, False)] * 3
        + [(False, True)] * 3
        + [(True, True)]
        + [(False, False)]
        + [(True, False)] * 5
    )

    result = evaluate_tianyan_candidate(candidate(hits))

    assert result["valid"] is True
    assert result["groupCount"] == 7
    assert len(result["groups"]) == 7
    assert result["minimumIndependentHits"] == 3
    assert result["rule1Only"] == 3
    assert result["rule2Only"] == 3
    assert result["bothHit"] == 1


def test_retains_two_rules_when_prediction_is_the_same() -> None:
    value = candidate([(True, False), (False, True), (True, False), (False, True)])
    value["rules"][1].update({"algorithmType": "合值", "value": 13, "currentBaseNumber": 10})
    result = evaluate_tianyan_candidate(value)
    assert result["valid"] is True
    assert result["predictionNumbers"] == ["03"]
    assert len(result["rules"]) == 2


def test_rejects_more_than_two_predictions_and_caps_groups_at_thirty() -> None:
    value = candidate([(True, False), (False, True), (True, False), (False, True)])
    value["rules"][0]["currentPredictionNumbers"] = [3, 4]
    value["rules"][1]["currentPredictionNumbers"] = [15]
    assert evaluate_tianyan_candidate(value)["reason"] == "TOO_MANY_PREDICTIONS"
    hits = [(index % 2 == 0, index % 2 != 0) for index in range(31)]
    assert evaluate_tianyan_candidate(candidate(hits))["groupCount"] == 30
