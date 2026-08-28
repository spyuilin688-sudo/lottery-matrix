from app.services.artifact_builders import (
    build_explore_artifact,
    build_explore_artifact_chunk,
    create_artifact_builders,
    tiangong_work_units,
)
from app.services.explore_batches import work_units


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
    assert len(artifact["items"]) == 3
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


def test_explore_builder_keeps_each_result_on_its_exact_target_boundary() -> None:
    history = [
        {"period": str(15 - index), "numbers": ["01", "02", "03", "04", "05"]}
        for index in range(15)
    ]

    def runner(unit: dict, _: list[dict]) -> dict:
        return {"results": [
            {
                "id": f'{unit["lockedSourceIndex"]}:{unit["lockedPosition"]}:{distance}',
                "number": "01", "lockedPosition": unit["lockedPosition"],
                "predictionDistance": distance, "consecutive": "準4進5", "highestStreak": 4,
                "predictionNumbers": ["06"], "ruleCount": 1,
                "searchCondition": {"referenceOffset": -1, "referencePosition": 2},
                "ruleSets": [],
            }
            for distance in range(unit["minPredictionDistance"], unit["maxPredictionDistance"] + 1)
        ]}

    artifact = build_explore_artifact("今彩539", "13", history, runner)
    counts = {
        date_offset: {
            period: sum(
                item["exploreDateOffset"] == date_offset
                and item["explorePeriods"] == period
                for item in artifact["items"]
            )
            for period in (2, 7, 13)
        }
        for date_offset in (0, 1, 2)
    }

    assert counts == {
        0: {2: 60, 7: 210, 13: 390},
        1: {2: 60, 7: 210, 13: 390},
        2: {2: 60, 7: 210, 13: 390},
    }


def test_group_runner_maps_newest_first_distance_before_attaching_date_dimensions() -> None:
    history = []
    for index in range(12):
        values = sorted(set([
            10,
            11 + index % 7,
            18 + (index * 2) % 7,
            25 + (index * 3) % 7,
            32 + (index * 4) % 8,
        ]))
        while len(values) < 5:
            candidate = 11
            while candidate in values:
                candidate += 1
            values.append(candidate)
            values.sort()
        numbers = [str(value).zfill(2) for value in values]
        history.append({
            "period": f"N{index}",
            "drawDate": "",
            "numbers": numbers,
            "sortedNumbers": numbers,
            "drawOrderNumbers": numbers,
        })

    units = work_units("今彩539", len(history), 5)
    unit_index = next(index for index, unit in enumerate(units) if (
        unit["numberOrder"] == "依號碼由小到大排序"
        and unit["algorithmType"] == "拖牌"
        and unit["lockedSourceIndex"] == 2
        and unit["lockedPosition"] == 1
    ))
    artifact = build_explore_artifact_chunk(
        "今彩539", "N0", history, unit_index, 1,
    )["artifact"]

    assert len(artifact["items"]) == 16
    expected = {
        1: {"dateOffset": 2, "periods": {2, 7, 13}, "predictionPeriod": "N1"},
        2: {"dateOffset": 1, "periods": {2, 7, 13}, "predictionPeriod": "N0"},
        3: {"dateOffset": 0, "periods": {7, 13}, "predictionPeriod": None},
    }
    for distance, row in expected.items():
        items = [item for item in artifact["items"] if item["predictionDistance"] == distance]
        assert {item["exploreDateOffset"] for item in items} == {row["dateOffset"]}
        assert {item["explorePeriods"] for item in items} == row["periods"]
        assert {
            artifact["validationById"][item["id"]]["sourceA"]["predictionPeriod"]
            for item in items
        } == {row["predictionPeriod"]}


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
