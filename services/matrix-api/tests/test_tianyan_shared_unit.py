from app.domain.tianyan_artifact import build_tianyan_unit_artifact


def _draw(period: str, values: list[int]) -> dict:
    numbers = [str(value).zfill(2) for value in values]
    return {
        "period": period,
        "numbers": numbers,
        "sortedNumbers": numbers,
        "drawOrderNumbers": numbers,
    }


def _coordinate(
    *,
    position: int,
    value: int,
    hits: list[bool],
    a_base: int,
) -> dict:
    groups = []
    for index, hit in enumerate(hits):
        source = _draw(f"S{index + 1}", [7, 11, 15, 20, 25])
        reference = _draw(f"R{position}-{index + 1}", [1, 2, 3, 4, 5])
        prediction = _draw(f"P{index + 1}", [3, 8, 15, 22, 30])
        groups.append({
            "group": chr(66 + index),
            "source": source,
            "reference": reference,
            "prediction": prediction,
            "baseNumber": position,
            "lockedBaseNumber": 7,
            "candidateMap": {f"加減:{value}": [3]} if hit else {},
        })
    return {
        "referenceOffset": -1,
        "referencePosition": position,
        "algorithmTypes": ["加減"],
        "aReference": _draw(f"A-R{position}", [1, 2, 3, 4, 5]),
        "aBaseNumber": a_base,
        "groups": groups,
    }


def _prepared() -> dict:
    return {
        "lottery": "今彩539",
        "numberOrder": "依號碼由小到大排序",
        "lockedPosition": 1,
        "lockedNumber": 7,
        "lockedSourceIndex": 0,
        "lockedSourcePeriod": "A",
        "predictionDistance": 1,
        "exploreDateOffset": 0,
        "source": _draw("A", [7, 11, 15, 20, 25]),
        "coordinates": [
            _coordinate(
                position=1,
                value=0,
                a_base=3,
                hits=[True, True, True, False, False, False, True],
            ),
            _coordinate(
                position=2,
                value=5,
                a_base=10,
                hits=[False, False, False, True, True, True, True],
            ),
        ],
    }


def test_shared_unit_builds_final_tianyan_without_persisting_candidate_sources() -> None:
    artifact = build_tianyan_unit_artifact(_prepared())

    assert len(artifact["items"]) == 1
    item = artifact["items"][0]
    assert item["consecutive"] == "準7進8"
    assert item["predictionNumbers"] == ["03", "15"]
    assert "tianyanSources" not in artifact


def test_shared_unit_saves_expandable_validation_instead_of_requiring_recalculation() -> None:
    artifact = build_tianyan_unit_artifact(_prepared())
    item = artifact["items"][0]
    validation = artifact["validationById"][item["id"]]

    assert validation["sourceA"]["sourcePeriod"] == "A"
    assert len(validation["rules"]) == 2
    assert validation["groupCount"] == 7
    assert validation["minimumIndependentHits"] == 3
    assert validation["rule1Only"] == 3
    assert validation["rule2Only"] == 3
    assert validation["bothHit"] == 1
    assert len(validation["historicalValidation"]) == 7

    first = validation["historicalValidation"][0]
    assert first["sourcePeriod"] == "S1"
    assert first["sourceNumbers"] == [7, 11, 15, 20, 25]
    assert first["predictionPeriod"] == "P1"
    assert first["predictionNumbers"] == [3, 8, 15, 22, 30]
    assert first["hitType"] in {"rule1Only", "rule2Only", "bothHit"}
    assert first["rule1"]["validationPeriod"] == "R1-1"
    assert first["rule1"]["validationPosition"] == 1
    assert first["rule1"]["algorithmType"] == "加減"
    assert first["rule1"]["ruleValue"] == 0
    assert "calculationResult" in first["rule1"]
    assert "hit" in first["rule1"]
