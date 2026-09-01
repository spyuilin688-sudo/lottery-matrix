from app.domain.explore_v2 import ExploreV2Session
from app.services.artifact_builders import (
    build_explore_artifact,
    create_artifact_builders,
)


def _empty_shared_response() -> dict:
    return {
        "results": [],
        "tianyanItems": [],
        "tianyanValidationById": {},
    }


def test_artifact_builder_calls_one_v2_batch_runner_per_checkpoint() -> None:
    calls: list[dict] = []

    def batch_runner(**kwargs: object) -> dict:
        calls.append(dict(kwargs))
        return {
            "artifact": {
                "lottery": "今彩539",
                "drawPeriod": "123",
                "items": [],
                "validationById": {},
                "tianyanItems": [],
                "tianyanValidationById": {},
            },
            "cursorStart": 10,
            "cursor": 12,
            "total": 130,
            "complete": False,
            "metrics": {},
        }

    builders = create_artifact_builders(explore_batch_runner=batch_runner)
    result = builders["explore"](
        {
            "draw": {"lottery": "今彩539", "period": "123"},
            "history": [{"period": "123"}],
            "exploreBatch": {"start": 10, "limit": 2},
        }
    )

    assert len(calls) == 1
    assert calls[0]["start"] == 10
    assert calls[0]["limit"] == 2
    assert result["_checkpoint"] == {
        "cursorStart": 10,
        "cursor": 12,
        "total": 130,
        "complete": False,
    }


def test_artifact_builder_reuses_one_v2_session_across_checkpoints(monkeypatch) -> None:
    history = [
        {
            "period": "123",
            "numbers": ["01", "02", "03", "04", "05"],
            "sortedNumbers": ["01", "02", "03", "04", "05"],
            "drawOrderNumbers": ["01", "02", "03", "04", "05"],
        }
    ]
    original_build = ExploreV2Session.build
    build_count = 0

    def build_once(cls, lottery: str, newest_first: list[dict]) -> ExploreV2Session:
        nonlocal build_count
        build_count += 1
        if build_count > 1:
            raise AssertionError("v2 session rebuilt between checkpoints")
        return original_build(lottery, newest_first)

    monkeypatch.setattr(ExploreV2Session, "build", classmethod(build_once))
    builders = create_artifact_builders()
    for start in (0, 1):
        builders["explore"](
            {
                "draw": {"lottery": "今彩539", "period": "123"},
                "history": list(history),
                "exploreBatch": {"start": start, "limit": 1},
            }
        )

    assert build_count == 1


def test_explore_builder_creates_canonical_detached_rows() -> None:
    history = [{"period": "123", "numbers": ["01", "02", "03", "04", "05"]}]
    calls = []

    def runner(unit: dict, _: list[dict]) -> dict:
        calls.append(unit)
        if len(calls) > 1:
            return _empty_shared_response()
        return {
            "results": [{
                "id": "raw", "number": "01", "lockedPosition": 1, "predictionDistance": 1,
                "consecutive": "準4進5", "highestStreak": 4, "predictionNumbers": ["06"],
                "algorithmType": "加減", "ruleCount": 1,
                "searchCondition": {"algorithmType": "加減", "referenceOffset": -1, "referencePosition": 2},
                "sourceA": {"baseNumber": 1}, "ruleSets": [{"rules": []}],
            }],
            "tianyanItems": [{"id": "tianyan-a", "predictionNumbers": ["06", "07"]}],
            "tianyanValidationById": {
                "tianyan-a": {"rules": [{"id": "r1"}, {"id": "r2"}]},
            },
        }

    artifact = build_explore_artifact("今彩539", "123", history, runner)
    assert len(calls) == 10
    assert len(artifact["items"]) == 1
    assert artifact["items"][0]["algorithmType"] == "加減"
    assert "explorePeriods" not in artifact["items"][0]
    assert artifact["items"][0]["exploreDateOffset"] == 0
    assert "ruleSets" not in artifact["items"][0]
    assert artifact["validationById"][artifact["items"][0]["id"]]["ruleSets"] == [{"rules": []}]
    assert artifact["tianyanItems"] == [{"id": "tianyan-a", "predictionNumbers": ["06", "07"]}]
    assert artifact["tianyanValidationById"] == {
        "tianyan-a": {"rules": [{"id": "r1"}, {"id": "r2"}]},
    }
    assert "tianyanSources" not in artifact


def test_explore_batch_builder_needs_only_start_and_limit() -> None:
    builders = create_artifact_builders(explore_runner=lambda *_: _empty_shared_response())
    context = {
        "draw": {"lottery": "今彩539", "period": "123"},
        "history": [{"period": str(index)} for index in range(13)],
        "exploreBatch": {"start": 10, "limit": 2},
    }

    result = builders["explore"](context)

    assert result["artifact"]["items"] == []
    assert result["artifact"]["tianyanItems"] == []
    assert result["artifact"]["tianyanValidationById"] == {}
    assert "tianyanSources" not in result["artifact"]
    assert result["_checkpoint"] == {
        "cursorStart": 10,
        "cursor": 12,
        "total": 130,
        "complete": False,
    }


def test_explore_builder_stores_each_today_road_once() -> None:
    history = [
        {"period": str(15 - index), "numbers": ["01", "02", "03", "04", "05"]}
        for index in range(15)
    ]

    def runner(unit: dict, _: list[dict]) -> dict:
        return {
            "results": [{
                "id": f'{unit["lockedSourceIndex"]}:{unit["lockedPosition"]}',
                "number": "01", "lockedPosition": unit["lockedPosition"],
                "predictionDistance": 1, "consecutive": "準4進5", "highestStreak": 4,
                "predictionNumbers": ["06"], "algorithmType": "加減", "ruleCount": 1,
                "searchCondition": {"algorithmType": "加減", "referenceOffset": -1, "referencePosition": 2},
                "ruleSets": [],
            }],
            "tianyanItems": [],
            "tianyanValidationById": {},
        }

    artifact = build_explore_artifact("今彩539", "13", history, runner)
    assert len(artifact["items"]) == 130
    assert len({item["id"] for item in artifact["items"]}) == 130
    assert {item["exploreDateOffset"] for item in artifact["items"]} == {0}
    assert {item["lockedSourceIndex"] for item in artifact["items"]} == set(range(13))
    assert all("explorePeriods" not in item for item in artifact["items"])


def test_one_shared_unit_can_store_add_sum_and_drag_results() -> None:
    history = [{"period": "123", "numbers": ["01", "02", "03", "04", "05"]}]
    calls = []

    def runner(unit: dict, _: list[dict]) -> dict:
        calls.append(unit)
        if len(calls) > 1:
            return _empty_shared_response()
        return {
            "results": [
                {
                    "id": algorithm_type,
                    "number": "01",
                    "lockedPosition": 1,
                    "predictionDistance": 1,
                    "consecutive": "準4進5",
                    "highestStreak": 4,
                    "predictionNumbers": ["06"],
                    "algorithmType": algorithm_type,
                    "ruleCount": 1,
                    "searchCondition": {"algorithmType": algorithm_type},
                    "ruleSets": [],
                }
                for algorithm_type in ("加減", "合值", "拖牌")
            ],
            "tianyanItems": [],
            "tianyanValidationById": {},
        }

    artifact = build_explore_artifact("今彩539", "123", history, runner)
    assert {item["algorithmType"] for item in artifact["items"]} == {"加減", "合值", "拖牌"}


def test_tianyan_builder_reads_final_results_precomputed_by_shared_explore() -> None:
    builders = create_artifact_builders()
    context = {
        "draw": {"lottery": "今彩539", "period": "123"},
        "history": [],
        "artifacts": {
            "explore": {
                "lottery": "今彩539",
                "drawPeriod": "123",
                "items": [],
                "validationById": {},
                "tianyanItems": [{"id": "t1", "predictionNumbers": ["03", "15"]}],
                "tianyanValidationById": {"t1": {"rules": [{"id": "r1"}, {"id": "r2"}]}},
            },
        },
    }

    tianyan = builders["tianyan"](context)

    assert tianyan == {
        "lottery": "今彩539",
        "drawPeriod": "123",
        "items": [{"id": "t1", "predictionNumbers": ["03", "15"]}],
        "validationById": {"t1": {"rules": [{"id": "r1"}, {"id": "r2"}]}},
    }


def test_concrete_status_builder_uses_completed_explore_artifact() -> None:
    builders = create_artifact_builders()
    context = {
        "draw": {"lottery": "今彩539", "period": "123"}, "history": [],
        "artifacts": {
            "explore": {
                "lottery": "今彩539", "drawPeriod": "123", "items": [], "validationById": {},
                "tianyanItems": [], "tianyanValidationById": {},
            },
        },
    }
    context["artifacts"]["tianyan"] = builders["tianyan"](context)
    status = builders["status"](context)
    assert status["artifactKinds"] == ["explore", "tianyan"]
    assert status["summary"]["status"] == "DORMANT"
