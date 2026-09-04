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
        "artifacts": {
            "explore": explore,
            "tianyan": tianyan,
        },
    }

    artifact = create_artifact_builders()["status"](context)
    sources = artifact["statusSources"]

    assert [item["id"] for item in sources["explore"]["items"]] == ["keep-explore"]
    assert [item["id"] for item in sources["tianyan"]["items"]] == ["keep-tianyan"]
    assert sources["explore"]["items"][0]["explorePeriods"] == 13
    assert "extraValidationData" not in sources["explore"]["items"][0]
    assert "extraValidationData" not in sources["tianyan"]["items"][0]


def test_status_sources_keep_their_two_seven_or_thirteen_period_tier() -> None:
    lottery = "今彩539"
    period = "115000210"
    indices = [0, 1, 2, 6, 7, 12]
    context = {
        "draw": {"lottery": lottery, "period": period},
        "artifacts": {
            "explore": {
                "lottery": lottery,
                "drawPeriod": period,
                "items": [_explore(f"road-{index}", index) for index in indices],
            },
            "tianyan": {"lottery": lottery, "drawPeriod": period, "items": []},
        },
    }

    artifact = create_artifact_builders()["status"](context)

    assert {
        item["lockedSourceIndex"]: item["explorePeriods"]
        for item in artifact["statusSources"]["explore"]["items"]
    } == {0: 2, 1: 2, 2: 7, 6: 7, 7: 13, 12: 13}


def test_status_cards_preserve_the_source_tier_for_access_projection() -> None:
    lottery = "今彩539"
    period = "115000210"
    items = []
    for index in (0, 2, 7):
        item = _explore(f"road-{index}", index)
        item.update({
            "highestStreak": 7,
            "consecutive": "準7進8",
            "predictionNumbers": [str(6 + index)],
        })
        items.append(item)
    context = {
        "draw": {"lottery": lottery, "period": period},
        "artifacts": {
            "explore": {"lottery": lottery, "drawPeriod": period, "items": items},
            "tianyan": {"lottery": lottery, "drawPeriod": period, "items": []},
        },
    }

    cards = create_artifact_builders()["status"](context)["cards"]

    assert {
        card["result"][0]: card["roads"][0]["explorePeriods"]
        for card in cards
    } == {"06": 2, "08": 7, "13": 13}


def test_status_uses_every_canonical_result_applicable_to_full_range() -> None:
    lottery = "今彩539"
    period = "115000210"
    shared = {
        **_explore("shared-id", 0),
        "exploreRange": "標準範圍",
        "scopeClass": "STANDARD_AND_FULL",
        "referenceOffset": -1,
        "referencePosition": 2,
    }
    full = {
        **_explore("full-id", 0),
        "exploreRange": "完整範圍",
        "scopeClass": "FULL_ONLY",
    }
    context = {
        "draw": {"lottery": lottery, "period": period},
        "artifacts": {
            "explore": {
                "lottery": lottery,
                "drawPeriod": period,
                "items": [shared, full],
            },
            "tianyan": {"lottery": lottery, "drawPeriod": period, "items": []},
        },
    }

    artifact = create_artifact_builders()["status"](context)

    assert {item["id"] for item in artifact["statusSources"]["explore"]["items"]} == {
        "shared-id",
        "full-id",
    }
    assert artifact["artifactCounts"]["explore"] == 2
    compact_shared = next(
        item for item in artifact["statusSources"]["explore"]["items"]
        if item["id"] == "shared-id"
    )
    assert compact_shared["referenceOffset"] == -1
    assert compact_shared["referencePosition"] == 2
