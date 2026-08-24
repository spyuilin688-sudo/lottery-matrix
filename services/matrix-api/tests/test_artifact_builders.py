from app.services.artifact_builders import build_explore_artifact, create_artifact_builders


def test_explore_builder_creates_canonical_detached_rows() -> None:
    history = [{"period": "123", "numbers": ["01", "02", "03", "04", "05"]}]
    calls = []

    def runner(unit: dict, _: list[dict]) -> dict:
        calls.append(unit)
        if len(calls) > 1:
            return {"results": []}
        return {"results": [{
            "id": "raw", "number": "01", "lockedPosition": 1, "predictionDistance": 1,
            "consecutive": "準4進5", "highestStreak": 4, "predictionNumbers": ["06"],
            "ruleCount": 1, "searchCondition": {"referenceOffset": -1, "referencePosition": 2},
            "sourceA": {"baseNumber": 1}, "ruleSets": [{"rules": []}],
        }]}

    artifact = build_explore_artifact("今彩539", "123", history, runner)
    assert len(calls) == 30
    assert len(artifact["items"]) == 1
    assert "ruleSets" not in artifact["items"][0]
    assert artifact["validationById"][artifact["items"][0]["id"]]["ruleSets"] == [{"rules": []}]


def test_explore_batch_builder_needs_only_start_and_limit() -> None:
    builders = create_artifact_builders(explore_runner=lambda *_: {"results": []})
    context = {
        "draw": {"lottery": "今彩539", "period": "123"},
        "history": [{"period": str(index)} for index in range(13)],
        "exploreBatch": {"start": 10, "limit": 2},
    }

    result = builders["explore"](context)

    assert result["artifact"]["items"] == []
    assert result["_checkpoint"] == {"cursor": 12, "total": 390, "complete": False}


def test_concrete_status_builder_uses_completed_explore_artifact() -> None:
    builders = create_artifact_builders(tiangong_runner=lambda *_: [])
    context = {
        "draw": {"lottery": "今彩539", "period": "123"}, "history": [],
        "artifacts": {"explore": {"lottery": "今彩539", "drawPeriod": "123", "items": [], "validationById": {}}},
    }
    context["artifacts"]["tianyan"] = builders["tianyan"](context)
    context["artifacts"]["tiangong"] = builders["tiangong"](context)
    status = builders["status"](context)
    assert status["artifactKinds"] == ["explore", "tianyan", "tiangong"]
    assert status["summary"]["status"] == "DORMANT"
