from app.services.artifact_builders import (
    build_explore_artifact,
    create_artifact_builders,
    tiangong_work_units,
)


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
    assert "explorePeriods" not in artifact["items"][0]
    assert artifact["items"][0]["exploreDateOffset"] == 0
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


def test_tiangong_batch_builder_runs_only_requested_work_unit() -> None:
    calls = []

    def runner(lottery: str, history: list[dict], options: dict) -> list[dict]:
        calls.append((lottery, options))
        return []

    builders = create_artifact_builders(tiangong_runner=runner)
    context = {
        "draw": {"lottery": "今彩539", "period": "123"},
        "history": [],
        "tiangongBatch": {"start": 1, "limit": 1},
    }

    result = builders["tiangong"](context)
    units = tiangong_work_units()

    assert len(calls) == 1
    assert calls[0] == ("今彩539", units[1])
    assert result["artifact"] == {
        "lottery": "今彩539", "drawPeriod": "123", "items": [], "validationById": {},
    }
    assert result["_checkpoint"] == {
        "cursorStart": 1, "cursor": 2, "total": len(units), "complete": False,
    }


def test_explore_builder_stores_each_today_road_once() -> None:
    history = [
        {"period": str(15 - index), "numbers": ["01", "02", "03", "04", "05"]}
        for index in range(15)
    ]

    def runner(unit: dict, _: list[dict]) -> dict:
        return {"results": [{
            "id": f'{unit["lockedSourceIndex"]}:{unit["lockedPosition"]}',
            "number": "01", "lockedPosition": unit["lockedPosition"],
            "predictionDistance": 1, "consecutive": "準4進5", "highestStreak": 4,
            "predictionNumbers": ["06"], "ruleCount": 1,
            "searchCondition": {"referenceOffset": -1, "referencePosition": 2},
            "ruleSets": [],
        }]}

    artifact = build_explore_artifact("今彩539", "13", history, runner)
    assert len(artifact["items"]) == 390
    assert len({item["id"] for item in artifact["items"]}) == 390
    assert {item["exploreDateOffset"] for item in artifact["items"]} == {0}
    assert {item["lockedSourceIndex"] for item in artifact["items"]} == set(range(13))
    assert all("explorePeriods" not in item for item in artifact["items"])


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
