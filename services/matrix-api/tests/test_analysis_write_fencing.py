import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from postgrest import SyncPostgrestClient

from app.repositories.analysis_repository import InMemoryAnalysisRepository, SupabaseAnalysisRepository
from app.repositories.artifact_chunks import encode_chunk_payload
from app.services.analysis_pipeline import AnalysisPipeline
from app.worker import _restore_stage_results
from app.analysis_worker import _restore_completed_explore_results, _restore_completed_tianheng_results


LOTTERY = "今彩539"
PERIOD = "115000220"
VERSION = f"{PERIOD}:matrix-python-v14-sorted"
KEY = (LOTTERY, PERIOD, VERSION)
DRAW = {"lottery": LOTTERY, "period": PERIOD, "drawDate": "2026-09-12", "numbers": ["01", "02", "03", "04", "05"]}
PREVIOUS = {**DRAW, "period": "115000219", "drawDate": "2026-09-11"}


def result_payload(marker="06"):
    return {"items": [{
        "id": "road-1", "number": marker, "lockedPosition": 1,
        "firstNumber": marker, "firstLockedPosition": 1,
        "secondNumber": "02", "secondLockedPosition": 2,
        "predictionDistance": 1, "consecutive": "連2", "highestStreak": 2,
        "predictionNumbers": [marker], "algorithmType": "加減",
        "numberOrder": "依號碼由小到大排序", "ruleCount": 1,
        "exploreRange": "標準範圍", "lockedSourceIndex": 0,
        "lockedSourcePeriod": PERIOD,
    }], "validationById": {"road-1": {"marker": marker}}}


def write(repository, target, marker="06", **fence):
    payload = result_payload(marker)
    if target == "artifact":
        repository.save_artifact(*KEY, "explore", payload, **fence)
    elif target == "chunk":
        repository.save_artifact_chunk(*KEY, "explore", 0, 0, 1, payload, **fence)
    else:
        getattr(repository, f"save_{target}_results")(*KEY, payload, **fence)


def test_history_replacement_between_lease_check_and_chunk_write_cannot_mix_generations():
    def explore(context):
        start = context["exploreBatch"]["start"]
        marker = context["history"][-1]["numbers"][-1]
        return {
            "artifact": {"items": [{"id": str(start), "number": marker}], "validationById": {}},
            "_checkpoint": {"cursorStart": start, "cursor": start + 1, "total": 2, "complete": start == 1},
        }

    builders = {kind: lambda context: {"items": []} for kind in ("explore", "tianheng", "tianyan", "tiangong", "status")}
    builders["explore"] = explore

    class HistoryReplacingRepository(InMemoryAnalysisRepository):
        replacement = None

        def save_artifact_chunk(self, *args, **kwargs):
            if self.replacement is None:
                self.upsert_draw({**PREVIOUS, "numbers": ["01", "02", "03", "04", "06"]})
                self.replacement = AnalysisPipeline(self, builders, VERSION, explore_batch_size=1)
                progress = self.replacement.run(DRAW, self.list_draws(LOTTERY))
                assert progress["cursor"] == 1
            return super().save_artifact_chunk(*args, **kwargs)

    repository = HistoryReplacingRepository()
    repository.upsert_draws([PREVIOUS, DRAW])
    pipeline = AnalysisPipeline(repository, builders, VERSION, explore_batch_size=1)
    with pytest.raises(RuntimeError, match="ANALYSIS_RUN_LEASE_LOST"):
        pipeline.run(DRAW, repository.list_draws(LOTTERY))

    completed = repository.replacement.run(DRAW, repository.list_draws(LOTTERY))
    assert completed["status"] == "complete"
    assert [item["number"] for item in repository.read_artifact(*KEY, "explore")["items"]] == ["06", "06"]


@pytest.mark.parametrize("target", ["artifact", "chunk", "explore", "tianheng"])
@pytest.mark.parametrize("rejection", ["owner", "generation", "expired", "complete", "missing_owner"])
def test_child_writes_reject_stale_or_unowned_work_without_changing_replacement(target, rejection):
    repository = InMemoryAnalysisRepository()
    started = datetime.now(UTC).isoformat()
    repository.begin_run(*KEY, started, owner_id="replacement")
    fence = {"owner_id": "replacement", "run_started_at": started}
    write(repository, target, **fence)
    if rejection == "owner":
        fence["owner_id"] = "old-worker"
    elif rejection == "generation":
        fence["run_started_at"] = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    elif rejection == "expired":
        repository.runs[KEY]["leaseExpiresAt"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    elif rejection == "complete":
        repository.runs[KEY]["status"] = "complete"
    else:
        fence = {}
    with pytest.raises(RuntimeError, match="ANALYSIS_RUN_LEASE_LOST"):
        write(repository, target, "05", **fence)
    if target == "artifact":
        assert repository.read_artifact(*KEY, "explore")["items"][0]["number"] == "06"
    elif target == "chunk":
        assert repository.materialize_artifact(*KEY, "explore", 1)["items"][0]["number"] == "06"
    else:
        assert next(iter(getattr(repository, f"{target}_results").values()))["item"]["number"] == "06"


@pytest.mark.parametrize("target,table", [("artifact", "matrix_analysis_artifacts"), ("chunk", "matrix_analysis_artifact_chunks"), ("explore", "matrix_explore_results"), ("tianheng", "matrix_tianheng_results")])
def test_supabase_child_writes_send_identity_to_atomic_rpc_and_surface_lease_loss(target, table):
    requests = []

    def transport(request):
        requests.append((request.url.path, json.loads(request.content)))
        return httpx.Response(200, json=False)

    client = SyncPostgrestClient("https://example.test/rest/v1", http_client=httpx.Client(transport=httpx.MockTransport(transport)))
    repository = SupabaseAnalysisRepository(client)
    with pytest.raises(RuntimeError, match="ANALYSIS_RUN_LEASE_LOST"):
        write(repository, target, owner_id="old-worker", run_started_at="2026-09-12T00:00:00+00:00")
    path, body = requests[0]
    assert path == "/rest/v1/rpc/matrix_analysis_write_owned"
    assert body | {"p_records": []} == {
        "p_lottery": LOTTERY, "p_draw_period": PERIOD, "p_analysis_version": VERSION,
        "p_owner_id": "old-worker", "p_started_at": "2026-09-12T00:00:00+00:00",
        "p_target": table, "p_records": [],
    }
    assert len(body["p_records"]) == 1
    client.session.close()


def seed_completed(repository, marker):
    repository.begin_run(*KEY, datetime.now(UTC).isoformat())
    for kind in ("explore", "tianheng", "tianyan", "tiangong", "status"):
        repository.save_artifact(*KEY, kind, result_payload(marker))
    repository.complete_run(*KEY, datetime.now(UTC).isoformat())


@pytest.mark.parametrize("entrypoint", ["scheduled", "analysis-only"])
@pytest.mark.parametrize("kind", ["explore", "tianheng"])
def test_completed_result_restore_rejects_artifact_from_replaced_generation(entrypoint, kind):
    class ReplacingCompletedRepository(InMemoryAnalysisRepository):
        replace_on_read = True

        def read_artifact(self, *args):
            artifact = super().read_artifact(*args)
            if self.replace_on_read and args[-1] == kind:
                self.replace_on_read = False
                self.upsert_draw({**PREVIOUS, "numbers": ["01", "02", "03", "04", "06"]})
                seed_completed(self, "06")
            return artifact

    repository = ReplacingCompletedRepository()
    repository.upsert_draws([PREVIOUS, DRAW])
    seed_completed(repository, "05")
    restore = _restore_stage_results if entrypoint == "scheduled" else {
        "explore": _restore_completed_explore_results,
        "tianheng": _restore_completed_tianheng_results,
    }[kind]
    with pytest.raises(RuntimeError, match="ANALYSIS_RUN_LEASE_LOST"):
        restore(repository, *KEY)
    assert getattr(repository, f"{kind}_results") == {}
    restore(repository, *KEY)
    assert repository.get_progress(*KEY)["status"] == "complete"
    assert next(iter(getattr(repository, f"{kind}_results").values()))["item"]["number"] == "06"


def test_completed_restore_rejects_unknown_kind_and_missing_artifact():
    repository = InMemoryAnalysisRepository()
    seed_completed(repository, "06")
    with pytest.raises(ValueError, match="UNKNOWN_RESULT_KIND"):
        repository.restore_completed_results(*KEY, "status")
    del repository.artifacts[(*KEY, "explore")]
    with pytest.raises(RuntimeError, match="ANALYSIS_REQUIRED_ARTIFACT_MISSING"):
        repository.restore_completed_results(*KEY, "explore")


@pytest.mark.parametrize("kind", ["explore", "tianheng"])
@pytest.mark.parametrize("accepted", [False, True])
def test_supabase_restore_captures_generation_before_materializing_saved_chunks(kind, accepted):
    requests = []
    chunk_cursors = []
    started_at = "2026-09-12T00:00:00+00:00"
    payload = result_payload("06")

    def respond(request):
        path = request.url.path.removeprefix("/rest/v1/")
        requests.append((path, json.loads(request.content) if request.content else None))
        if path == "matrix_analysis_runs":
            return httpx.Response(200, json=[{
                "lottery": LOTTERY, "draw_period": PERIOD, "analysis_version": VERSION,
                "phase": "complete", "cursor": 1, "total": 1, "status": "complete",
                "started_at": started_at, "completed_at": started_at, "error": None,
                "lease_owner": None, "lease_expires_at": None,
            }])
        if path == "matrix_analysis_artifacts":
            return httpx.Response(200, json=[{"payload": {"storage": "chunks", "total": 1}}])
        if path == "matrix_analysis_artifact_chunks":
            cursor = request.url.params.get("chunk_index")
            chunk_cursors.append(cursor)
            chunks = [{
                "chunk_index": 0, "cursor_start": 0, "cursor_end": 1,
                "payload": encode_chunk_payload(payload),
            }]
            if cursor is not None:
                chunks = [chunk for chunk in chunks if chunk["chunk_index"] > int(cursor.removeprefix("gt."))]
            return httpx.Response(200, json=chunks)
        if path == f"matrix_{kind}_results":
            return httpx.Response(200, json=[], headers={"content-range": "*/0"})
        assert path == "rpc/matrix_analysis_restore_results"
        return httpx.Response(200, json=accepted)

    with httpx.Client(transport=httpx.MockTransport(respond)) as session:
        repository = SupabaseAnalysisRepository(SyncPostgrestClient("https://example.test/rest/v1", http_client=session))
        if accepted:
            repository.restore_completed_results(*KEY, kind)
        else:
            with pytest.raises(RuntimeError, match="ANALYSIS_RUN_LEASE_LOST"):
                repository.restore_completed_results(*KEY, kind)
    assert [path for path, _ in requests] == [
        "matrix_analysis_runs", "matrix_analysis_artifacts", "matrix_analysis_artifact_chunks",
        "matrix_analysis_artifact_chunks", f"matrix_{kind}_results", "rpc/matrix_analysis_restore_results",
    ]
    assert chunk_cursors == [None, "gt.0"]
    body = requests[-1][1]
    assert body | {"p_records": []} == {
        "p_lottery": LOTTERY, "p_draw_period": PERIOD, "p_analysis_version": VERSION,
        "p_started_at": started_at, "p_kind": kind, "p_records": [],
    }
    assert body["p_records"][0]["item"]["number"] == "06"


@pytest.mark.parametrize("response_data", [True, False, None, 1, "true", [True], {"accepted": True}])
@pytest.mark.parametrize("owner_id", ["worker", None])
def test_completion_uses_one_atomic_rpc_and_requires_literal_true(response_data, owner_id):
    requests = []
    completed_at = "2026-09-12T01:02:03+00:00"

    def respond(request):
        assert request.method == "POST"
        requests.append((request.method, request.url.path, json.loads(request.content)))
        return httpx.Response(200, content=json.dumps(response_data), headers={"content-type": "application/json"})

    with httpx.Client(transport=httpx.MockTransport(respond)) as session:
        repository = SupabaseAnalysisRepository(SyncPostgrestClient("https://example.test/rest/v1", http_client=session))
        if response_data is True:
            repository.complete_run(*KEY, completed_at, owner_id=owner_id)
        else:
            with pytest.raises(RuntimeError, match="^ANALYSIS_RUN_LEASE_LOST$"):
                repository.complete_run(*KEY, completed_at, owner_id=owner_id)
    assert requests == [("POST", "/rest/v1/rpc/matrix_analysis_complete_owned", {
        "p_lottery": LOTTERY, "p_draw_period": PERIOD, "p_analysis_version": VERSION,
        "p_owner_id": owner_id, "p_completed_at": completed_at,
    })]


@pytest.mark.parametrize("rejection", ["stale_owner", "expired", "expiry_boundary", "missing_owner", "blank_owner", "failed", "complete", "missing_run"])
def test_owned_completion_rejection_preserves_run_and_active_version(rejection, monkeypatch):
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(DRAW)
    seed_completed(repository, "05")
    replacement_key = (LOTTERY, PERIOD, f"{PERIOD}:future-sorted")
    started = datetime.now(UTC).isoformat()
    repository.begin_run(*replacement_key, started, owner_id="worker")
    for kind in ("explore", "tianheng", "tianyan", "tiangong", "status"):
        repository.save_artifact(*replacement_key, kind, {}, owner_id="worker", run_started_at=started)
    owner = "worker"
    if rejection == "stale_owner":
        owner = "old-worker"
    elif rejection in {"expired", "expiry_boundary"}:
        now = datetime.now(UTC)
        if rejection == "expiry_boundary":
            class FrozenDateTime(datetime):
                @classmethod
                def now(cls, tz=None):
                    return now

            monkeypatch.setattr("app.repositories.analysis_repository.datetime", FrozenDateTime)
        repository.runs[replacement_key]["leaseExpiresAt"] = (
            now - timedelta(seconds=1 if rejection == "expired" else 0)
        ).isoformat()
    elif rejection == "missing_owner":
        owner = None
    elif rejection == "blank_owner":
        owner = " "
        repository.runs[replacement_key]["leaseOwner"] = owner
    elif rejection == "missing_run":
        del repository.runs[replacement_key]
    else:
        repository.runs[replacement_key]["status"] = rejection
    before = {key: dict(run) for key, run in repository.runs.items()}
    with pytest.raises(RuntimeError, match="^ANALYSIS_RUN_LEASE_LOST$"):
        repository.complete_run(*replacement_key, started, owner_id=owner)
    assert repository.runs == before
    assert repository.active_versions == {(LOTTERY, PERIOD, "sorted"): VERSION}


@pytest.mark.parametrize("missing_kind", ["explore", "tianheng", "tianyan", "tiangong", "status"])
def test_owned_completion_missing_artifacts_preserves_running_owner_and_previous_activation(missing_kind):
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(DRAW)
    seed_completed(repository, "05")
    key = (LOTTERY, PERIOD, "future-sorted")
    started = datetime.now(UTC).isoformat()
    repository.begin_run(*key, started, owner_id="worker")
    for kind in ("explore", "tianheng", "tianyan", "tiangong", "status"):
        if kind != missing_kind:
            repository.save_artifact(*key, kind, {}, owner_id="worker", run_started_at=started)
    before = dict(repository.runs[key])
    with pytest.raises(ValueError, match="^ANALYSIS_ARTIFACTS_INCOMPLETE$"):
        repository.complete_run(*key, started, owner_id="worker")
    assert repository.runs[key] == before
    assert repository.active_versions == {(LOTTERY, PERIOD, "sorted"): VERSION}
    with pytest.raises(RuntimeError, match="^ANALYSIS_RUN_LEASE_LOST$"):
        repository.complete_run(*key, started, owner_id="stale-worker")
