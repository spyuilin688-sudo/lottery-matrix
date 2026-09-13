from datetime import UTC, datetime, timedelta

import httpx
import pytest
from postgrest import SyncPostgrestClient

from app.analysis_worker import run_analysis_only_worker
from app.repositories.analysis_repository import (
    ARTIFACT_KINDS,
    InMemoryAnalysisRepository,
    SupabaseAnalysisRepository,
)
from app.repositories.artifact_chunks import chunk_manifest
from app.services.analysis_pipeline import AnalysisPipeline
from app.worker import ANALYSIS_VERSION, _resume_stored_analysis


NOW = datetime.now(UTC)
PAYLOAD = {"items": [{"id": "retained-result", "number": "07"}], "validationById": {}}


def seed_complete(repository, lottery, period, draw_date, version=None):
    version = version or f"{period}:{ANALYSIS_VERSION}-sorted"
    draw = {
        "lottery": lottery, "period": period, "drawDate": draw_date,
        "numbers": [f"{number:02d}" for number in range(1, 8 if lottery == "六合彩" else 6)],
    }
    repository.upsert_draw(draw)
    repository.begin_run(lottery, period, version, (NOW - timedelta(days=10)).isoformat())
    for kind in ARTIFACT_KINDS:
        artifact = {"items": [], "validationById": {}} if kind == "tianheng" else PAYLOAD
        repository.save_artifact(lottery, period, version, kind, artifact)
    repository.save_artifact_chunk(lottery, period, version, "explore", 0, 0, 1, PAYLOAD)
    repository.save_artifact(lottery, period, version, "explore", chunk_manifest(1, 1, 1, 1))
    repository.save_explore_results(lottery, period, version, PAYLOAD)
    repository.update_progress(lottery, period, version, "status", 4, 5)
    repository.complete_run(lottery, period, version, (NOW - timedelta(days=9)).isoformat())
    return draw, version


def test_cleanup_keeps_latest_three_completed_periods_and_running_checkpoints():
    repository = InMemoryAnalysisRepository()
    # Seed older source rows first: inserting historical data after analysis
    # correctly invalidates every dependent newer run.
    failed = ("六合彩", "026089", f"026089:{ANALYSIS_VERSION}-sorted")
    seed_complete(repository, *failed[:2], "2026-08-20")
    repository.runs[failed]["status"] = "failed"
    active = ("六合彩", "026090", f"026090:{ANALYSIS_VERSION}-sorted")
    seed_complete(repository, *active[:2], "2026-08-22")
    repository.runs[active]["status"] = "running"
    for period, draw_date in [
        ("026091", "2026-08-25"), ("026092", "2026-08-27"),
        ("026093", "2026-08-29"), ("026094", "2026-09-01"),
        ("026095", "2026-09-03"),
    ]:
        seed_complete(repository, "六合彩", period, draw_date)
    # Two versions of a period must not consume two of the three visible offsets.
    seed_complete(repository, "六合彩", "026095", "2026-09-03", "previous-version")
    seed_complete(repository, "天天樂", "260901", "2026-09-01")
    # Completion time must not replace draw ordering.
    repository.runs[("六合彩", "026091", f"026091:{ANALYSIS_VERSION}-sorted")]["completedAt"] = NOW.isoformat()
    for collection in (repository.artifacts, repository.artifact_chunks, repository.explore_results):
        for record in collection.values():
            record["expiresAt"] = NOW - timedelta(seconds=1)

    # The previous unsuffixed version is not an active pointer. Its seven
    # expired records now lose the old period-wide protection as well.
    assert repository.cleanup_expired(NOW) == 28
    assert {key[:2] for key in repository.artifacts} == {
        ("六合彩", "026093"), ("六合彩", "026094"), ("六合彩", "026095"),
        ("六合彩", "026090"), ("天天樂", "260901"),
    }
    for collection in (repository.artifact_chunks, repository.explore_results):
        assert {key[:2] for key in collection} == {key[:2] for key in repository.artifacts}
    assert repository.read_completed_artifact("六合彩", "026093", "explore")["items"] == PAYLOAD["items"]
    assert repository.runs[failed]["status"] == "failed"


def test_supabase_cleanup_uses_atomic_retention_rpc_and_returns_full_count():
    calls = []
    def respond(request):
        assert request.method == "POST"
        calls.append(request.url.path)
        if request.url.path == "/rest/v1/rpc/matrix_analysis_cleanup_status":
            return httpx.Response(200, json={"cleanup_enabled": True, "cleanup_due": True})
        assert request.url.path == "/rest/v1/rpc/matrix_analysis_cleanup_expired"
        assert request.read() == ('{"p_now":"' + NOW.isoformat() + '"}').encode()
        return httpx.Response(200, json=2505)

    with httpx.Client(transport=httpx.MockTransport(respond)) as session:
        client = SyncPostgrestClient("https://example.invalid/rest/v1", http_client=session)
        assert SupabaseAnalysisRepository(client).cleanup_expired(NOW) == 2505
    assert calls == ["/rest/v1/rpc/matrix_analysis_cleanup_status", "/rest/v1/rpc/matrix_analysis_cleanup_expired"]


@pytest.mark.parametrize("status", [
    {"cleanup_enabled": True, "cleanup_due": False},
    {"cleanup_enabled": False, "cleanup_due": True},
])
def test_supabase_skips_cleanup_when_cron_is_fresh_or_rollout_is_disabled(status):
    calls = []
    def respond(request):
        calls.append(request.url.path)
        if request.url.path.endswith("matrix_analysis_cleanup_status"):
            return httpx.Response(200, json=status)
        return httpx.Response(200, json=99)
    with httpx.Client(transport=httpx.MockTransport(respond)) as session:
        client = SyncPostgrestClient("https://example.invalid/rest/v1", http_client=session)
        assert SupabaseAnalysisRepository(client).cleanup_expired(NOW) == 0
    assert calls == ["/rest/v1/rpc/matrix_analysis_cleanup_status"]


@pytest.mark.parametrize("status", [None, {}, {"cleanup_due": "false"}, {"cleanup_due": True, "last_error": "previous failure"}])
def test_supabase_missing_or_stale_status_uses_the_same_cleanup_core(status):
    calls = []
    def respond(request):
        calls.append(request.url.path)
        return httpx.Response(200, json=status if request.url.path.endswith("matrix_analysis_cleanup_status") else 7)
    with httpx.Client(transport=httpx.MockTransport(respond)) as session:
        client = SyncPostgrestClient("https://example.invalid/rest/v1", http_client=session)
        assert SupabaseAnalysisRepository(client).cleanup_expired(NOW) == 7
    assert calls == ["/rest/v1/rpc/matrix_analysis_cleanup_status", "/rest/v1/rpc/matrix_analysis_cleanup_expired"]


@pytest.mark.parametrize("failure", ["transport", "rpc"])
def test_supabase_status_failure_can_attempt_only_the_existing_locked_core(failure):
    calls = []
    def respond(request):
        calls.append(request.url.path)
        if request.url.path.endswith("matrix_analysis_cleanup_status"):
            if failure == "transport":
                raise httpx.ConnectError("temporarily unavailable", request=request)
            return httpx.Response(503, json={"code": "PGRST000", "message": "temporarily unavailable"})
        return httpx.Response(200, json=0)
    with httpx.Client(transport=httpx.MockTransport(respond)) as session:
        client = SyncPostgrestClient("https://example.invalid/rest/v1", http_client=session)
        assert SupabaseAnalysisRepository(client).cleanup_expired(NOW) == 0
    assert calls == ["/rest/v1/rpc/matrix_analysis_cleanup_status", "/rest/v1/rpc/matrix_analysis_cleanup_expired"]


def test_inmemory_recent_superseded_expired_removed_but_live_ttl_and_running_kept():
    repository = InMemoryAnalysisRepository()
    for period, date in [("101", "2026-09-10"), ("102", "2026-09-11"), ("103", "2026-09-12")]:
        seed_complete(repository, "天天樂", period, date, f"{period}:matrix-python-v15-sorted")
    _, old = seed_complete(repository, "天天樂", "103", "2026-09-12", "103:matrix-python-v13")
    _, running = seed_complete(repository, "天天樂", "103", "2026-09-12", "103:matrix-python-v16-preview")
    repository.runs[("天天樂", "103", running)]["status"] = "running"
    for collection in (repository.explore_results, repository.tianheng_results, repository.artifacts, repository.artifact_chunks):
        for row in collection.values():
            row["expiresAt"] = NOW - timedelta(days=1)
    live_key = ("天天樂", "103", old, "status")
    repository.artifacts[live_key]["expiresAt"] = NOW + timedelta(days=1)
    assert repository.cleanup_expired(NOW) == 6
    assert live_key in repository.artifacts
    assert repository.has_artifact("天天樂", "103", running, "explore")
    assert repository.active_versions[("天天樂", "103", "sorted")] == "103:matrix-python-v15-sorted"


def test_inmemory_independent_order_versions_remain_retained():
    repository = InMemoryAnalysisRepository()
    draw = {"lottery": "今彩539", "period": "103", "drawDate": "2026-09-12",
            "numbers": ["01", "02", "03", "04", "05"], "drawOrderNumbers": ["05", "04", "03", "02", "01"]}
    repository.upsert_draw(draw)
    for order in ["sorted", "draw"]:
        version = f"103:matrix-python-v15-{order}"
        repository.begin_run("今彩539", "103", version, NOW.isoformat())
        for kind in ARTIFACT_KINDS:
            repository.save_artifact("今彩539", "103", version, kind, {"items": []})
        repository.complete_run("今彩539", "103", version, NOW.isoformat())
    for artifact in repository.artifacts.values():
        artifact["expiresAt"] = NOW - timedelta(days=1)
    assert repository.cleanup_expired(NOW) == 0
    assert len(repository.active_versions) == 2


def test_inmemory_cleanup_bounds_each_table_and_retires_historical_manifest_pointer():
    repository = InMemoryAnalysisRepository()
    for period, date in [("100", "2026-09-01"), ("101", "2026-09-10"), ("102", "2026-09-11"), ("103", "2026-09-12")]:
        seed_complete(repository, "天天樂", period, date)
    version = f"100:{ANALYSIS_VERSION}-sorted"
    prefix = ("天天樂", "100", version)
    for collection in (repository.explore_results, repository.tianheng_results):
        for i in range(5001):
            collection[(*prefix, f"test-{i}")] = {"expiresAt": NOW - timedelta(days=1)}
    for i in range(1, 5002):
        repository.artifact_chunks[(*prefix, "explore", i)] = {"expiresAt": NOW - timedelta(days=1)}
    for artifact in repository.artifacts.values():
        artifact["expiresAt"] = NOW - timedelta(days=1)
    assert repository.cleanup_expired(NOW) == 12005
    assert ("天天樂", "100", "sorted") not in repository.active_versions
    assert prefix in repository.runs
    assert sum(key[:3] == prefix for key in repository.explore_results) == 2
    assert sum(key[:3] == prefix for key in repository.tianheng_results) == 1
    assert sum(key[:3] == prefix for key in repository.artifact_chunks) == 3002


def test_missing_completed_artifact_reopens_at_zero_without_stealing_lease():
    repository = InMemoryAnalysisRepository()
    draw, version = seed_complete(repository, "六合彩", "026095", "2026-09-03")
    del repository.artifacts[("六合彩", "026095", version, "explore")]
    first = repository.begin_run("六合彩", "026095", version, NOW.isoformat(), owner_id="repair-a")
    assert (first["status"], first["phase"], first["cursor"], first["total"]) == ("running", "explore", 0, 0)
    assert first["leaseAcquired"] is True
    second = repository.begin_run("六合彩", "026095", version, NOW.isoformat(), owner_id="repair-b")
    assert second["leaseAcquired"] is False
    assert second["leaseOwner"] == "repair-a"
    pipeline = AnalysisPipeline(repository, {kind: lambda context: pytest.fail("lease stolen") for kind in ARTIFACT_KINDS}, version)
    assert pipeline.run(draw, [draw])["skipped"] is True


@pytest.mark.parametrize("chunked", [False, True])
def test_completed_zero_result_artifact_is_not_reopened(chunked):
    repository = InMemoryAnalysisRepository()
    draw, version = seed_complete(repository, "六合彩", "026095", "2026-09-03")
    empty = {"items": [], "validationById": {}}
    repository.explore_results.clear()
    if chunked:
        repository.save_artifact_chunk("六合彩", "026095", version, "explore", 0, 0, 1, empty)
        empty = chunk_manifest(1, 1, 1, 0)
    repository.save_artifact("六合彩", "026095", version, "explore", empty)
    pipeline = AnalysisPipeline(repository, {kind: lambda context: pytest.fail("empty result rebuilt") for kind in ARTIFACT_KINDS}, version)
    result = pipeline.run(draw, [draw])
    assert result["status"] == "complete"
    assert result["skipped"] is True


@pytest.mark.parametrize("analysis_only", [False, True])
@pytest.mark.parametrize("artifact_state", ["missing", "empty", "present"])
def test_workers_rebuild_missing_artifacts_and_preserve_valid_results(analysis_only, artifact_state):
    repository = InMemoryAnalysisRepository()
    lottery = "天天樂" if analysis_only else "六合彩"
    period = "260905" if analysis_only else "026095"
    draw, version = seed_complete(repository, lottery, period, "2026-09-05")
    repository.explore_results.clear()
    key = (lottery, period, version, "explore")
    if artifact_state == "missing":
        repository.artifacts.clear()
        repository.artifact_chunks.clear()
    elif artifact_state == "empty":
        repository.save_artifact(lottery, period, version, "explore", {"items": [], "validationById": {}})

    built_phases = []

    def explore(context):
        built_phases.append("explore")
        assert context["exploreBatch"]["start"] == 0
        return {"artifact": PAYLOAD, "_checkpoint": {"cursorStart": 0, "cursor": 1, "total": 1, "complete": True}}

    builders = {kind: lambda context: {"items": [], "validationById": {}} for kind in ARTIFACT_KINDS}
    builders["explore"] = explore

    class Source:
        def fetch_history(self, lottery, limit):
            return [draw]

    if analysis_only:
        result = run_analysis_only_worker(lottery, repository, builders)
    else:
        result = _resume_stored_analysis(lottery, repository, Source(), draw, builders)

    if artifact_state == "missing":
        assert result is not None and result["status"] == "complete"
        assert built_phases == ["explore"]
        assert repository.artifacts[key]["payload"]["itemCount"] == 1
    else:
        assert built_phases == []
    assert repository.has_explore_results(lottery, period, version) is (artifact_state != "empty")


def complete_owned(repository, lottery, period, version):
    started = datetime.now(UTC).isoformat()
    repository.begin_run(lottery, period, version, started, owner_id="worker")
    for kind in ARTIFACT_KINDS:
        repository.save_artifact(lottery, period, version, kind, {}, owner_id="worker", run_started_at=started)
    repository.complete_run(lottery, period, version, started, owner_id="worker")
    return repository.runs[(lottery, period, version)]


def activation_draw(lottery="今彩539", period="115000220", date="2026-09-12"):
    numbers = ["01", "02", "03", "04", "05"] if lottery in {"今彩539", "天天樂"} else ["01", "02", "03", "04", "05", "06", "07"]
    return {"lottery": lottery, "period": period, "drawDate": date, "numbers": numbers,
            "drawOrderNumbers": ["02", "01", *numbers[2:]], "resultStatus": "confirmed"}


@pytest.mark.parametrize("lottery", ["今彩539", "六合彩", "大樂透"])
def test_owned_completion_activates_future_suffix_versions_independently(lottery):
    repository = InMemoryAnalysisRepository()
    draw = activation_draw(lottery)
    repository.upsert_draw(draw)
    period = draw["period"]
    complete_owned(repository, lottery, period, "v99-sorted")
    complete_owned(repository, lottery, period, "v100-draw")
    run = complete_owned(repository, lottery, period, "v101-sorted")
    assert repository.active_versions == {
        (lottery, period, "sorted"): "v101-sorted",
        (lottery, period, "draw"): "v100-draw",
    }
    assert (run["status"], run["phase"], run["leaseOwner"], run["leaseExpiresAt"], run["error"]) == (
        "complete", "complete", None, None, None,
    )
    assert run["completedAt"] == run["startedAt"]


@pytest.mark.parametrize("version", ["matrix-python-v13", "v99-unknown", "v99-sorted-extra", "v99-draw-extra"])
def test_legacy_or_unknown_suffix_completes_without_replacing_active_versions(version):
    repository = InMemoryAnalysisRepository()
    draw = activation_draw()
    repository.upsert_draw(draw)
    complete_owned(repository, draw["lottery"], draw["period"], "v99-sorted")
    run = complete_owned(repository, draw["lottery"], draw["period"], version)
    assert run["status"] == "complete"
    assert repository.active_versions == {(draw["lottery"], draw["period"], "sorted"): "v99-sorted"}


@pytest.mark.parametrize("lottery,changes", [
    ("天天樂", {}),
    ("今彩539", {"resultStatus": "preliminary"}),
    ("今彩539", {"drawOrderNumbers": None}),
    ("今彩539", {"drawOrderNumbers": "0102030405"}),
    ("今彩539", {"drawOrderNumbers": ["01", "02", "03", "04"]}),
    ("今彩539", {"drawOrderNumbers": ["01", "02", "03", "04", "06"]}),
    ("今彩539", {"numbers": ["01", "01", "03", "04", "05"], "drawOrderNumbers": ["01", "01", "03", "04", "05"]}),
    ("六合彩", {"drawOrderNumbers": ["07", "02", "03", "04", "05", "06", "01"]}),
    ("大樂透", {"drawOrderNumbers": ["01", "02", "03", "04", "05"]}),
])
def test_ineligible_draw_completion_is_atomic(lottery, changes):
    repository = InMemoryAnalysisRepository()
    draw = {**activation_draw(lottery), **changes}
    repository.upsert_draw(draw)
    complete_owned(repository, lottery, draw["period"], "v99-sorted")
    with pytest.raises(RuntimeError, match="^ANALYSIS_RUN_LEASE_LOST$"):
        complete_owned(repository, lottery, draw["period"], "v99-draw")
    run = repository.runs[(lottery, draw["period"], "v99-draw")]
    assert (run["status"], run["leaseOwner"], run["completedAt"]) == ("running", "worker", None)
    assert repository.active_versions == {(lottery, draw["period"], "sorted"): "v99-sorted"}


@pytest.mark.parametrize("sorted_changed", [False, True])
def test_source_invalidation_prunes_only_pointers_to_removed_runs(sorted_changed):
    repository = InMemoryAnalysisRepository()
    previous = activation_draw(period="115000219", date="2026-09-11")
    current = activation_draw()
    unrelated = activation_draw("六合彩")
    repository.upsert_draws([previous, current, unrelated])
    for draw in (previous, current, unrelated):
        for version in ("v99-sorted", "v99-draw"):
            complete_owned(repository, draw["lottery"], draw["period"], version)
    changes = {"numbers": ["01", "02", "03", "04", "06"]} if sorted_changed else {"drawOrderNumbers": previous["numbers"]}
    repository.upsert_draw({**previous, **changes})
    expected = {
        (draw["lottery"], draw["period"], order): f"v99-{order}"
        for draw in (previous, current, unrelated) for order in ("sorted", "draw")
        if draw["lottery"] == "六合彩" or (not sorted_changed and order == "sorted")
    }
    assert repository.active_versions == expected
    assert all((lottery, period, version) in repository.runs for (lottery, period, _), version in expected.items())


def test_upsert_draws_rollback_restores_active_versions_with_runs_and_draws():
    repository = InMemoryAnalysisRepository()
    previous = activation_draw(period="115000219", date="2026-09-11")
    current = activation_draw()
    repository.upsert_draws([previous, current])
    for version in ("v99-sorted", "v99-draw"):
        complete_owned(repository, current["lottery"], current["period"], version)
    before = {name: dict(getattr(repository, name)) for name in ("draws", "runs", "artifacts", "active_versions")}
    with pytest.raises(ValueError, match="^DRAW_PERIOD_DATE_CONFLICT$"):
        repository.upsert_draws([
            {**previous, "drawOrderNumbers": previous["numbers"]},
            {**current, "drawDate": "2026-09-13"},
        ])
    assert {name: getattr(repository, name) for name in before} == before
