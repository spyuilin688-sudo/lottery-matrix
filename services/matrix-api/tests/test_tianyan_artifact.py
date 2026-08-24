from copy import deepcopy

from app.domain.tianyan_artifact import build_tianyan_artifact


def _row(identifier: str, prediction: str, position: int, algorithm_type: str) -> dict:
    return {
        "id": identifier, "number": "07", "lockedPosition": 1, "predictionDistance": 1,
        "consecutive": "準9進10", "highestStreak": 9, "predictionNumbers": [prediction],
        "algorithmType": algorithm_type, "numberOrder": "依號碼由小到大排序",
        "explorePeriods": 13, "exploreDateOffset": 0, "ruleCount": 1,
        "referenceOffset": -1, "referencePosition": position,
    }


def _validation(identifier: str, position: int, algorithm_type: str, hits: list[bool]) -> dict:
    return {
        "itemId": identifier, "sourceA": {"baseNumber": 3 if position == 1 else 10},
        "ruleSets": [{
            "rules": [{
                "id": f"{identifier}-rule", "referenceOffset": -1,
                "referencePosition": position, "algorithmType": algorithm_type,
                "value": 13 if algorithm_type == "合值" else 0,
            }],
            "predictionNumbers": [3] if position == 1 else [15],
            "historicalValidation": [{
                "group": f"g{index + 1}", "sourcePeriod": str(100 - index),
                "predictionPeriod": str(101 - index), "predictionNumbers": [],
                "baseNumber": position, "success": success,
            } for index, success in enumerate(hits)],
        }],
    }


def _source_artifact() -> dict:
    first_hits = [True, True, True, False, False, False, True, True, True]
    second_hits = [False, False, False, True, True, True, True, True, True]
    return {
        "lottery": "今彩539", "drawPeriod": "114000123",
        "items": [
            _row("a", "03", 1, "加減"), _row("a-duplicate", "03", 1, "加減"),
            _row("b", "15", 2, "合值"), _row("c", "03", 3, "加減"),
        ],
        "validationById": {
            "a": _validation("a", 1, "加減", first_hits),
            "a-duplicate": _validation("a-duplicate", 1, "加減", first_hits),
            "b": _validation("b", 2, "合值", second_hits),
            "c": _validation("c", 3, "加減", second_hits),
        },
    }


def test_builds_composite_rows_deduplicates_pairs_and_detaches_validation() -> None:
    artifact = build_tianyan_artifact("今彩539", "114000123", _source_artifact())
    assert len(artifact["items"]) == 2
    assert artifact["items"][0]["roadType"] == "複合"
    assert artifact["items"][0]["hitCondition"] == "準5+（鎖定2碼）"
    assert artifact["items"][0]["consecutive"] == "準9進10"
    assert "historicalValidation" not in str(artifact["items"])
    validations = [artifact["validationById"][item["id"]] for item in artifact["items"]]
    assert validations[0]["rules"] != validations[1]["rules"]


def test_only_combines_rules_from_the_same_locked_source_condition() -> None:
    source = _source_artifact()
    source["items"] = [deepcopy(source["items"][0]), deepcopy(source["items"][2])]
    source["items"][0].update({"lockedSourceIndex": 0, "lockedSourcePeriod": "114000123"})
    source["items"][1].update({"lockedSourceIndex": 1, "lockedSourcePeriod": "114000122"})
    source["validationById"] = {item["id"]: source["validationById"][item["id"]] for item in source["items"]}
    assert build_tianyan_artifact("今彩539", "114000123", source)["items"] == []
