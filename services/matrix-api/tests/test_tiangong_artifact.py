from copy import deepcopy

from app.domain.tiangong_artifact import build_tiangong_artifact


def _candidate(**overrides: object) -> dict:
    value = {
        "lottery": "今彩539", "periodRange": 80, "sourceSequence": [1, 3, 5],
        "mode": "one-stage", "hitCondition": "準2進3", "exploreDirection": "固定",
        "baseNumber": 10,
        "firstStage": {"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 5, "nextN": 1},
        "validationRows": [],
    }
    value.update(overrides)
    return value


def test_deduplicates_exact_results_but_retains_different_road_identities() -> None:
    exact = _candidate()
    artifact = build_tiangong_artifact("今彩539", "114000123", [], lambda *_: [
        exact, deepcopy(exact),
        _candidate(firstStage={"startPosition": 1, "direction": "固定", "algorithmType": "合值", "value": 25, "nextN": 1}),
    ])
    assert len(artifact["items"]) == 2
    assert {item["predictionNumber"] for item in artifact["items"]} == {"15"}
    assert {item["roadType"] for item in artifact["items"]} == {"加減版路", "合值版路"}


def test_sorts_rows_and_keeps_validation_detached() -> None:
    evidence = [{"role": "prediction", "group": "A"}]
    artifact = build_tiangong_artifact("今彩539", "114000123", [], lambda *_: [
        _candidate(sourceSequence=[1, 5, 9]),
        _candidate(sourceSequence=[1, 2, 3], firstStage={"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 6, "nextN": 2}),
        _candidate(sourceSequence=[1, 2, 3], validationRows=evidence),
    ])
    assert [(item["interval"], item["predictionDistance"]) for item in artifact["items"]] == [(1, 1), (1, 2), (4, 1)]
    first = artifact["items"][0]
    assert "validationRows" not in first
    assert artifact["validationById"][first["id"]]["validationRows"] == evidence
