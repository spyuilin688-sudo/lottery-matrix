from app.services.artifact_builders import create_artifact_builders


def _explore(identifier: str, source_index: int, date_offset: int = 0) -> dict:
    return {
        "id": identifier,
        "number": "01",
        "lockedPosition": 1,
        "predictionDistance": 1,
        "consecutive": "準5進6",
        "highestStreak": 5,
        "predictionNumbers": ["06"],
        "algorithmType": "加減",
        "numberOrder": "依號碼由小到大排序",
        "explorePeriods": 13,
        "exploreDateOffset": date_offset,
        "ruleCount": 1,
        "lockedSourceIndex": source_index,
        "extraValidationData": "must-not-be-copied",
    }


def _tianyan(identifier: str, source_index: int, date_offset: int = 0) -> dict:
    return {
        "id": identifier,
        "number": "01",
        "lockedPosition": 1,
        "predictionDistance": 1,
        "consecutive": "準5進6",
        "highestStreak": 5,
        "predictionNumbers": ["06", "07"],
        "numberOrder": "依號碼由小到大排序",
        "explorePeriods": 13,
        "exploreDateOffset": date_offset,
        "lockedSourceIndex": source_index,
        "extraValidationData": "must-not-be-copied",
    }


def test_status_artifact_embeds_only_compact_status_eligible_sources() -> None:
    lottery = "今彩539"
    period = "115000210"
    explore = {
        "lottery": lottery,
        "drawPeriod": period,
        "items": [_explore("keep-explore", 12), _explore("old-explore", 13), _explore("offset-explore", 0, 1)],
    }
    tianyan = {
        "lottery": lottery,
        "drawPeriod": period,
        "items": [_tianyan("keep-tianyan", 12), _tianyan("old-tianyan", 13), _tianyan("offset-tianyan", 0, 1)],
    }
    context = {
        "draw": {"lottery": lottery, "period": period},
        "artifacts": {"explore": explore, "tianyan": tianyan, "tiangong": {"items": []}},
    }

    artifact = create_artifact_builders()["status"](context)
    sources = artifact["statusSources"]

    assert [item["id"] for item in sources["explore"]["items"]] == ["keep-explore"]
    assert [item["id"] for item in sources["tianyan"]["items"]] == ["keep-tianyan"]
    assert "extraValidationData" not in sources["explore"]["items"][0]
    assert "extraValidationData" not in sources["tianyan"]["items"][0]
