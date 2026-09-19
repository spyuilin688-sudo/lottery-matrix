from datetime import UTC, datetime, timedelta

from app import worker
from app.repositories.analysis_repository import (
    ARTIFACT_KINDS,
    LEGACY_V14_ARTIFACT_KINDS,
    InMemoryAnalysisRepository,
    required_artifact_kinds,
)
from app.services.analysis_pipeline import AnalysisPipeline, PHASES


DRAW = {
    "lottery": "今彩539",
    "period": "114001",
    "numbers": ["01", "02", "03", "04", "05"],
}
VERSION = "114001:matrix-python-v15-sorted"


def empty_artifact():
    return {
        "lottery": "今彩539",
        "drawPeriod": "114001",
        "items": [],
        "validationById": {},
    }


def locked_artifact(kind, identifier, third="03"):
    item = {
        "id": identifier,
        "firstNumber": "01",
        "firstLockedPosition": 1,
        "secondNumber": "02",
        "secondLockedPosition": 2,
        "predictionDistance": 3,
        "consecutive": "準5進6",
        "highestStreak": 5,
        "predictionNumbers": ["23"],
        "algorithmType": "拖牌",
        "numberOrder": "依號碼由小到大排序",
        "ruleCount": 1,
        "exploreRange": "標準範圍",
        "lockedSourceIndex": 0,
        "lockedSourcePeriod": "114001",
        "referenceOffset": 0,
        "referencePosition": 1,
    }
    if kind == "tianshu":
        item.update({
            "kind": "tianshu",
            "thirdNumber": third,
            "thirdLockedPosition": 3,
        })
    return {
        **empty_artifact(),
        "kind": kind,
        "items": [item],
        "validationById": {identifier: {
            "itemId": identifier,
            "sourceA": {
                "lockedPositions": [1, 2, 3] if kind == "tianshu" else [1, 2],
                "lockedNumbers": ["01", "02", third] if kind == "tianshu" else ["01", "02"],
            },
        }},
    }


def builders(calls):
    def complete(kind, payload=None):
        def build(context):
            start = context[f"{kind}Batch"]["start"]
            calls.append((kind, start))
            return {"artifact": payload or empty_artifact(), "_checkpoint": {
                "cursorStart": start, "cursor": start + 1, "total": 1, "complete": True,
            }}
        return build

    def tianshu(context):
        start = context["tianshuBatch"]["start"]
        calls.append(("tianshu", start))
        return {"artifact": locked_artifact("tianshu", f"ts_{start}"), "_checkpoint": {
            "cursorStart": start, "cursor": start + 1, "total": 2, "complete": start == 1,
        }}

    return {
        "explore": complete("explore"),
        "tianheng": complete("tianheng", locked_artifact("tianheng", "th_0")),
        "tianshu": tianshu,
        "tianyan": lambda _context: empty_artifact(),
        "tiangong": lambda _context: empty_artifact(),
        "status": lambda _context: empty_artifact(),
    }


def test_tianshu_is_an_independent_batched_phase_and_resumes():
    assert PHASES == ("explore", "tianheng", "tianshu", "tianyan", "tiangong", "status")
    assert ARTIFACT_KINDS == set(PHASES)
    repository = InMemoryAnalysisRepository()
    calls = []

    first_pipeline = AnalysisPipeline(repository, builders(calls), VERSION, explore_batch_size=1)
    first = first_pipeline.run(DRAW, [])

    assert (first["status"], first["phase"], first["cursor"], first["total"]) == (
        "running", "tianshu", 1, 2,
    )
    assert repository.has_tianheng_results("今彩539", "114001", VERSION, 1)
    assert repository.has_tianshu_results("今彩539", "114001", VERSION, 1)
    first_pipeline.repository.fail_run(
        "今彩539", "114001", VERSION, "interrupted", owner_id=first_pipeline.owner_id,
    )

    resumed = AnalysisPipeline(repository, builders(calls), VERSION, explore_batch_size=1)
    result = resumed.run(DRAW, [])

    assert result["status"] == "complete"
    assert calls == [
        ("explore", 0), ("tianheng", 0), ("tianshu", 0), ("tianshu", 1),
    ]
    assert [
        item["id"] for item in repository.read_artifact(
            "今彩539", "114001", VERSION, "tianshu",
        )["items"]
    ] == ["ts_0", "ts_1"]
    assert repository.has_tianshu_results("今彩539", "114001", VERSION, 2)


def test_tianshu_normalization_restore_and_cleanup_are_independent():
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(DRAW)
    repository.begin_run("今彩539", "114001", VERSION, datetime.now(UTC).isoformat())
    tianshu = locked_artifact("tianshu", "ts_first", "03")
    second = locked_artifact("tianshu", "ts_second", "04")
    tianshu["items"].extend(second["items"])
    tianshu["validationById"].update(second["validationById"])
    for kind in ARTIFACT_KINDS:
        payload = tianshu if kind == "tianshu" else (
            locked_artifact("tianheng", "th_only") if kind == "tianheng" else empty_artifact()
        )
        repository.save_artifact("今彩539", "114001", VERSION, kind, payload)
    repository.complete_run("今彩539", "114001", VERSION, datetime.now(UTC).isoformat())
    repository.save_tianheng_results(
        "今彩539", "114001", VERSION, locked_artifact("tianheng", "th_only"),
    )
    repository.save_tianshu_results(
        "今彩539", "114001", VERSION, locked_artifact("tianshu", "ts_first"),
    )

    repository.restore_completed_results("今彩539", "114001", VERSION, "tianshu")

    assert repository.has_tianheng_results("今彩539", "114001", VERSION, 1)
    assert repository.has_tianshu_results("今彩539", "114001", VERSION, 2)
    row = repository.tianshu_results[("今彩539", "114001", VERSION, "ts_second")]
    assert row["third_number"] == "04"
    assert row["third_locked_position"] == 3
    assert row["item"]["thirdNumber"] == "04"
    assert row["validation"]["sourceA"]["lockedNumbers"] == ["01", "02", "04"]

    for record in repository.tianshu_results.values():
        record["expiresAt"] = datetime.now(UTC) - timedelta(seconds=1)
    assert repository.cleanup_expired(datetime.now(UTC)) == 0
    # Completed active results stay retained while the version is active.
    assert repository.has_tianshu_results("今彩539", "114001", VERSION, 2)


def test_worker_version_and_restore_include_tianshu():
    assert worker.ANALYSIS_VERSION == "matrix-python-v15"
    repository = InMemoryAnalysisRepository()
    calls = []
    repository.has_explore_results = lambda *_args: True
    repository.restore_completed_results = lambda *args: calls.append(args[-1])

    worker._restore_stage_results(repository, "今彩539", "114001", VERSION)

    assert calls == ["tianheng", "tianshu"]


def test_expired_unretained_tianshu_results_are_cleaned_independently():
    repository = InMemoryAnalysisRepository()
    repository.save_tianshu_results(
        "今彩539", "114001", VERSION, locked_artifact("tianshu", "ts_expired"),
    )
    for record in repository.tianshu_results.values():
        record["expiresAt"] = datetime.now(UTC) - timedelta(seconds=1)

    assert repository.cleanup_expired(datetime.now(UTC)) == 1
    assert not repository.has_tianshu_results("今彩539", "114001", VERSION)


def test_artifact_completeness_versions_are_parsed_exactly():
    assert required_artifact_kinds("114001:matrix-python-v13-sorted") == frozenset(LEGACY_V14_ARTIFACT_KINDS)
    assert required_artifact_kinds("114001:matrix-python-v14-draw") == frozenset(LEGACY_V14_ARTIFACT_KINDS)
    assert required_artifact_kinds("114001:matrix-python-v15-sorted") == frozenset(ARTIFACT_KINDS)
    assert required_artifact_kinds("114001:matrix-python-v140-sorted") == frozenset(ARTIFACT_KINDS)
