from datetime import UTC, datetime, timedelta
from inspect import signature
from types import SimpleNamespace

import pytest

from app import analysis_worker, worker
from app.repositories.analysis_repository import (
    ARTIFACT_KINDS,
    InMemoryAnalysisRepository,
    SupabaseAnalysisRepository,
)
from app.services import artifact_builders
from app.services.analysis_pipeline import AnalysisPipeline, PHASES, PHASE_DEPENDENCIES


DRAW = {
    "lottery": "今彩539", "period": "114001",
    "numbers": ["01", "02", "03", "04", "05"],
}
VERSION = "114001:matrix-python-v14-sorted"


def empty_artifact():
    return {"lottery": "今彩539", "drawPeriod": "114001", "items": [], "validationById": {}}


def tianheng_artifact(identifier="th_test"):
    item = {
        "id": identifier, "firstNumber": "05", "firstLockedPosition": 1,
        "secondNumber": "18", "secondLockedPosition": 4,
        "predictionDistance": 3, "consecutive": "準5進6", "highestStreak": 5,
        "predictionNumbers": ["23"], "algorithmType": "拖牌",
        "numberOrder": "依號碼由小到大排序", "ruleCount": 1,
        "exploreRange": "標準範圍", "lockedSourceIndex": 0,
        "lockedSourcePeriod": "114001", "referenceOffset": 0, "referencePosition": 1,
    }
    return {
        **empty_artifact(), "items": [item],
        "validationById": {identifier: {"itemId": identifier}},
    }


def two_tianheng_artifacts():
    first = tianheng_artifact("th_first")
    second = tianheng_artifact("th_second")
    return {
        **empty_artifact(),
        "items": first["items"] + second["items"],
        "validationById": first["validationById"] | second["validationById"],
    }


def explore_artifact():
    return {
        **empty_artifact(),
        "items": [{
            "id": "ex_test", "number": "05", "lockedPosition": 1,
            "predictionDistance": 3, "consecutive": "準5進6", "highestStreak": 5,
            "predictionNumbers": ["23"], "algorithmType": "拖牌",
            "numberOrder": "依號碼由小到大排序", "ruleCount": 1,
            "exploreRange": "完整範圍", "lockedSourceIndex": 0,
            "lockedSourcePeriod": "114001", "exploreDateOffset": 0,
        }],
        "validationById": {"ex_test": {"itemId": "ex_test"}},
    }


def builders(calls=None):
    calls = calls if calls is not None else []

    def explore(context):
        calls.append(("explore", context["exploreBatch"]["start"]))
        return {"artifact": explore_artifact(), "_checkpoint": {
            "cursorStart": 0, "cursor": 1, "total": 1, "complete": True,
        }}

    def tianheng(context):
        start = context["tianhengBatch"]["start"]
        assert context["tianhengBatch"]["limit"] == 1
        calls.append(("tianheng", start))
        return {"artifact": tianheng_artifact(f"th_{start}"), "_checkpoint": {
            "cursorStart": start, "cursor": start + 1,
            "total": 2, "complete": start == 1,
        }}

    def tianyan(context):
        calls.append(("tianyan", None))
        assert context["artifacts"]["explore"]["items"][0]["id"] == "ex_test"
        return empty_artifact()

    def tiangong(context):
        calls.append(("tiangong", None))
        return empty_artifact()

    def status(context):
        calls.append(("status", None))
        return artifact_builders._status_artifact(
            context["artifacts"]["explore"], context["artifacts"]["tianyan"],
        )

    return {"explore": explore, "tianheng": tianheng, "tianyan": tianyan,
            "tiangong": tiangong, "status": status}


def test_tianheng_is_required_immediately_after_explore():
    assert "tianheng" in ARTIFACT_KINDS
    assert PHASES == ("explore", "tianheng", "tianyan", "tiangong", "status")


def test_pipeline_checkpoints_and_resumes_tianheng_without_rerunning_explore():
    repository = InMemoryAnalysisRepository()
    calls = []
    pipeline = AnalysisPipeline(repository, builders(calls), VERSION, explore_batch_size=1)
    first = pipeline.run(DRAW, [])
    assert (first["status"], first["phase"], first["cursor"], first["total"]) == (
        "running", "tianheng", 1, 2,
    )
    assert not repository.has_artifact("今彩539", "114001", VERSION, "tianheng")
    assert repository.has_tianheng_results("今彩539", "114001", VERSION)
    assert calls == [("explore", 0), ("tianheng", 0)]
    # Simulate a worker interruption; a new owner must continue from the stored cursor.
    repository.fail_run("今彩539", "114001", VERSION, "interrupted", owner_id=pipeline.owner_id)
    resumed = AnalysisPipeline(repository, builders(calls), VERSION, explore_batch_size=1)
    result = resumed.run(DRAW, [])
    assert result["status"] == "complete"
    assert calls == [("explore", 0), ("tianheng", 0), ("tianheng", 1),
                     ("tianyan", None), ("tiangong", None), ("status", None)]
    artifact = repository.read_artifact("今彩539", "114001", VERSION, "tianheng")
    assert [item["id"] for item in artifact["items"]] == ["th_0", "th_1"]
    assert set(artifact["validationById"]) == {"th_0", "th_1"}
    assert len(repository.read_artifact_chunks("今彩539", "114001", VERSION, "tianheng")) == 2
    status = repository.read_artifact("今彩539", "114001", VERSION, "status")
    assert status["artifactKinds"] == ["explore", "tianyan"]
    assert set(status["statusSources"]) == {"explore", "tianyan"}
    assert status["artifactCounts"] == {"explore": 1, "tianyan": 0}
    assert resumed.run(DRAW, [])["skipped"] is True


def test_tianheng_normalization_failure_replays_chunk_before_advancing(monkeypatch):
    repository = InMemoryAnalysisRepository()
    pipeline = AnalysisPipeline(repository, builders(), VERSION, explore_batch_size=1)
    original = repository.save_tianheng_results

    def fail_save(*args):
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(repository, "save_tianheng_results", fail_save)
    with pytest.raises(RuntimeError, match="storage unavailable"):
        pipeline.run(DRAW, [])
    monkeypatch.setattr(repository, "save_tianheng_results", original)
    pipeline.run(DRAW, [])
    result = pipeline.run(DRAW, [])
    assert result["status"] == "complete"
    assert len(repository.tianheng_results) == 2
    assert len(repository.read_artifact_chunks("今彩539", "114001", VERSION, "tianheng")) == 2


def test_status_builder_does_not_accept_tianheng():
    assert tuple(signature(artifact_builders._status_artifact).parameters) == ("explore", "tianyan")
    assert PHASE_DEPENDENCIES["status"] == ("explore", "tianyan")


def test_tianheng_builder_reuses_explore_session_and_preserves_checkpoint(monkeypatch):
    sessions = []

    def explore_batch(**kwargs):
        sessions.append(kwargs["session"])
        return {"artifact": empty_artifact(), "cursorStart": 0, "cursor": 1,
                "total": 1, "complete": True}

    def tianheng_batch(lottery, history, start, limit, *, session):
        assert (lottery, start, limit) == ("今彩539", 3, 2)
        assert all(context.explore is explore
                   for context, explore in zip(session.contexts, sessions[-1].contexts, strict=True))
        return {"artifact": tianheng_artifact(), "cursorStart": 3, "cursor": 5,
                "total": 6, "complete": False}

    monkeypatch.setattr(artifact_builders, "run_explore_batch", explore_batch)
    monkeypatch.setattr(artifact_builders, "run_tianheng_batch", tianheng_batch, raising=False)
    built = artifact_builders.create_artifact_builders(explore_batch_runner=explore_batch)
    history = [{**DRAW, "period": str(114001 - index),
                "sortedNumbers": DRAW["numbers"], "drawOrderNumbers": DRAW["numbers"]}
               for index in range(13)]
    context = {"draw": {**DRAW, "period": "114002"}, "history": history,
               "artifacts": {}, "exploreBatch": {"start": 0, "limit": 1},
               "tianhengBatch": {"start": 3, "limit": 2}}
    built["explore"](context)
    result = built["tianheng"](context)
    assert result["artifact"]["drawPeriod"] == "114002"
    assert result["_checkpoint"] == {"cursorStart": 3, "cursor": 5, "total": 6, "complete": False}
    built["explore"](context)
    assert sessions[0] is sessions[1]


class ResultClient:
    """Local storage double for the external PostgREST query boundary."""

    def __init__(self):
        self.rows = {}
        self.batch_sizes = []

    def table(self, name):
        assert name == "matrix_tianheng_results"
        client = self

        class Query:
            def __init__(self):
                self.filters = {}
                self.values = None
                self.count_requested = False

            def upsert(self, values, *, on_conflict):
                assert on_conflict == "lottery,draw_period,analysis_version,item_id"
                self.values = values
                return self

            def select(self, columns, *, count=None):
                assert columns == "item_id"
                assert count in (None, "exact")
                self.count_requested = count == "exact"
                return self

            def eq(self, column, value):
                self.filters[column] = value
                return self

            def range(self, start, end):
                assert (start, end) == (0, 0)
                return self

            def execute(self):
                if self.values is not None:
                    client.batch_sizes.append(len(self.values))
                    for row in self.values:
                        key = tuple(row[key] for key in (
                            "lottery", "draw_period", "analysis_version", "item_id",
                        ))
                        client.rows[key] = row
                    return SimpleNamespace(data=[])
                matching = [row for row in client.rows.values()
                    if all(row[key] == value for key, value in self.filters.items())]
                return SimpleNamespace(
                    data=matching[:1],
                    count=len(matching) if self.count_requested else None,
                )

        return Query()


@pytest.mark.parametrize("backend", ["memory", "supabase"])
def test_normalized_tianheng_records_keep_both_locks_and_upsert_idempotently(backend):
    client = ResultClient()
    repository = InMemoryAnalysisRepository() if backend == "memory" else SupabaseAnalysisRepository(client)
    assert not repository.has_tianheng_results("今彩539", "114001", VERSION)
    repository.save_tianheng_results("今彩539", "114001", VERSION, empty_artifact())
    assert not repository.has_tianheng_results("今彩539", "114001", VERSION)
    payload = tianheng_artifact()
    repository.save_tianheng_results("今彩539", "114001", VERSION, payload)
    repository.save_tianheng_results("今彩539", "114001", VERSION, payload)
    rows = repository.tianheng_results if backend == "memory" else client.rows
    assert len(rows) == 1
    row = rows[("今彩539", "114001", VERSION, "th_test")]
    assert {key: row[key] for key in (
        "first_number", "first_locked_position", "second_number", "second_locked_position",
        "prediction_distance", "consecutive", "highest_streak", "prediction_numbers",
        "algorithm_type", "number_order", "rule_count", "explore_range",
        "locked_source_index", "locked_source_period", "reference_offset", "reference_position",
    )} == {
        "first_number": "05", "first_locked_position": 1,
        "second_number": "18", "second_locked_position": 4,
        "prediction_distance": 3, "consecutive": "準5進6", "highest_streak": 5,
        "prediction_numbers": ["23"], "algorithm_type": "拖牌",
        "number_order": "依號碼由小到大排序", "rule_count": 1,
        "explore_range": "標準範圍", "locked_source_index": 0,
        "locked_source_period": "114001", "reference_offset": 0, "reference_position": 1,
    }
    assert "exploreRange" not in row["item"]
    assert row["item"]["firstNumber"] == "05"
    assert row["item"]["secondNumber"] == "18"
    assert row["validation"] == {"itemId": "th_test"}
    assert datetime.fromisoformat(row["expires_at"]) > datetime.now(UTC)
    assert repository.has_tianheng_results("今彩539", "114001", VERSION)
    assert not repository.has_tianheng_results("今彩539", "114002", VERSION)
    assert not repository.has_tianheng_results("今彩539", "114001", "old-version")
    assert not repository.has_tianheng_results("天天樂", "114001", VERSION)


def test_supabase_tianheng_upserts_are_bounded_batches():
    client = ResultClient()
    repository = SupabaseAnalysisRepository(client)
    payload = empty_artifact()
    for index in range(201):
        artifact = tianheng_artifact(f"th_{index}")
        payload["items"].extend(artifact["items"])
        payload["validationById"].update(artifact["validationById"])
    repository.save_tianheng_results("今彩539", "114001", VERSION, payload)
    assert client.batch_sizes == [100, 100, 1]
    assert len(client.rows) == 201


def test_expired_unretained_tianheng_results_are_cleaned_up():
    repository = InMemoryAnalysisRepository()
    repository.save_tianheng_results("今彩539", "114001", VERSION, tianheng_artifact())
    assert repository.cleanup_expired(datetime.now(UTC) + timedelta(days=4)) == 1
    assert not repository.has_tianheng_results("今彩539", "114001", VERSION)


@pytest.mark.parametrize("entrypoint", ["scheduled", "analysis-only"])
@pytest.mark.parametrize("existing", ["neither", "explore", "tianheng", "partial-tianheng"])
def test_completed_workers_restore_each_missing_normalized_result_set(monkeypatch, entrypoint, existing):
    repository = InMemoryAnalysisRepository()
    lottery = "天天樂" if entrypoint == "analysis-only" else "今彩539"
    draw = {**DRAW, "lottery": lottery}
    repository.upsert_draw(draw)
    repository.begin_run(lottery, "114001", VERSION, datetime.now(UTC).isoformat())
    for kind in ("explore", "tianheng", "tianyan", "tiangong", "status"):
        payload = explore_artifact() if kind == "explore" else (
            two_tianheng_artifacts() if kind == "tianheng" and existing == "partial-tianheng" else
            tianheng_artifact() if kind == "tianheng" else empty_artifact()
        )
        repository.save_artifact(lottery, "114001", VERSION, kind, payload)
    repository.complete_run(lottery, "114001", VERSION, datetime.now(UTC).isoformat())
    if existing == "explore":
        repository.save_explore_results(lottery, "114001", VERSION, explore_artifact())
    elif existing == "tianheng":
        repository.save_tianheng_results(lottery, "114001", VERSION, tianheng_artifact())
    elif existing == "partial-tianheng":
        repository.save_tianheng_results(
            lottery, "114001", VERSION, tianheng_artifact("th_first"),
        )

    def no_reanalysis(*args, **kwargs):
        pytest.fail("completed sorted runs must repair from artifacts without reanalysis")

    monkeypatch.setattr(worker, "_run_analysis", no_reanalysis)
    monkeypatch.setattr(analysis_worker, "_run_analysis", no_reanalysis)
    monkeypatch.setattr(analysis_worker, "publish_current_card", lambda *args: None)
    if entrypoint == "scheduled":
        assert worker._resume_stored_analysis(lottery, repository, None, draw, {}) is None
    else:
        result = analysis_worker.run_analysis_only_worker(lottery, repository)
        assert result["status"] == "already-analyzed"
        assert result["analysisVersion"] == VERSION
    assert repository.has_explore_results(lottery, "114001", VERSION)
    assert repository.has_tianheng_results(lottery, "114001", VERSION)
    if existing == "partial-tianheng":
        assert {
            key[3] for key in repository.tianheng_results
            if key[:3] == (lottery, "114001", VERSION)
        } == {"th_first", "th_second"}
