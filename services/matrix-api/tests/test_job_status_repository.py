from typing import Any

import httpx
from postgrest import SyncPostgrestClient

from app.repositories.analysis_repository import InMemoryAnalysisRepository, SupabaseAnalysisRepository


class FakeResponse:
    def __init__(self, data: list[dict[str, Any]] | None = None) -> None:
        self.data = data or []


class FakeQuery:
    def __init__(self, client: "FakeClient", table: str) -> None:
        self.client = client
        self.table = table
        self.operation = ""
        self.record: dict[str, Any] | None = None
        self.on_conflict: str | None = None
        self.filters: list[tuple[str, Any]] = []

    def upsert(self, record: dict[str, Any], **kwargs: Any) -> "FakeQuery":
        self.operation = "upsert"
        self.record = record
        self.on_conflict = kwargs.get("on_conflict")
        return self

    def update(self, record: dict[str, Any]) -> "FakeQuery":
        self.operation = "update"
        self.record = record
        return self

    def eq(self, column: str, value: Any) -> "FakeQuery":
        self.filters.append((column, value))
        return self

    def execute(self) -> FakeResponse:
        self.client.executions.append({
            "table": self.table,
            "operation": self.operation,
            "record": self.record,
            "onConflict": self.on_conflict,
            "filters": list(self.filters),
        })
        return FakeResponse()


class FakeClient:
    def __init__(self) -> None:
        self.executions: list[dict[str, Any]] = []

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)


def test_in_memory_job_status_keeps_latest_transition() -> None:
    repository = InMemoryAnalysisRepository()

    repository.start_job("matrix-539-refresh-v2", "今彩539", "2026-08-29T01:00:00+00:00")
    repository.finish_job(
        "matrix-539-refresh-v2",
        "success",
        "2026-08-29T01:01:00+00:00",
        source_period="003118",
        database_period="003117",
        written_period="003118",
    )

    row = repository.list_job_statuses()[0]
    assert row["job"] == {
        "jobName": "matrix-539-refresh-v2",
        "lottery": "今彩539",
        "status": "success",
        "startedAt": "2026-08-29T01:00:00+00:00",
        "finishedAt": "2026-08-29T01:01:00+00:00",
        "error": None,
        "sourcePeriod": "003118",
        "databasePeriod": "003117",
        "writtenPeriod": "003118",
        "updatedAt": "2026-08-29T01:01:00+00:00",
    }


def test_job_status_projection_hides_raw_errors_and_unreliable_timestamps() -> None:
    repository = InMemoryAnalysisRepository()
    repository.start_job("matrix-539-refresh-v2", "今彩539", "2026-08-29T01:00:00+00:00")
    repository.finish_job(
        "matrix-539-refresh-v2",
        "failed",
        "2026-08-29T01:01:00+00:00",
        "password=raw-worker-secret",
    )
    repository.upsert_draw({
        "lottery": "今彩539",
        "period": "003117",
        "drawDate": "2026-08-28",
        "numbers": ["01", "07", "11", "20", "39"],
    })
    repository.runs[("今彩539", "003117", "v3")] = {
        "lottery": "今彩539",
        "drawPeriod": "003117",
        "analysisVersion": "v3",
        "phase": "status",
        "cursor": 1,
        "total": 1,
        "status": "failed",
        "startedAt": "2026-08-29T01:00:00+00:00",
        "completedAt": None,
        "error": "database raw analysis error",
    }

    item = repository.list_job_statuses()[0]

    assert item["job"]["error"] == "WORKER_FAILED"
    assert item["latestAnalysis"]["error"] == "ANALYSIS_FAILED"
    assert "updatedAt" not in item["latestDraw"]
    assert "updatedAt" not in item["latestAnalysis"]
    assert "raw-worker-secret" not in str(item)
    assert "database raw analysis error" not in str(item)


def test_job_status_uses_canonical_draw_postgrest_order() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=[])

    base_url = "https://example.supabase.co/rest/v1"
    http_client = httpx.Client(
        base_url=base_url,
        transport=httpx.MockTransport(handler),
    )
    with SyncPostgrestClient(base_url, http_client=http_client) as client:
        SupabaseAnalysisRepository(client).list_job_statuses()

    draw_requests = [
        request for request in requests
        if request.url.path.endswith("/lottery_draws")
    ]
    assert len(draw_requests) == 4
    assert all(
        request.url.params["order"] == "draw_date.desc.nullslast,period.desc"
        for request in draw_requests
    )
    assert all(request.url.params["limit"] == "1" for request in draw_requests)


def test_supabase_job_status_projection_hides_raw_rows_and_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/system_job_status"):
            return httpx.Response(200, json=[{
                "job_name": "matrix-539-refresh-v2",
                "lottery": "今彩539",
                "status": "failed",
                "started_at": "2026-08-29T01:00:00+00:00",
                "finished_at": "2026-08-29T01:01:00+00:00",
                "error": "password=raw-worker-secret",
                "source_period": "003118",
                "database_period": "003117",
                "written_period": None,
                "updated_at": "2026-08-29T01:01:00+00:00",
                "extra": "raw-job-row-secret",
            }])
        if request.url.path.endswith("/lottery_draws"):
            return httpx.Response(200, json=[{
                "period": "003117",
                "draw_date": "2026-08-28",
                "updated_at": "unreliable-draw-timestamp",
                "extra": "raw-draw-row-secret",
            }])
        if request.url.path.endswith("/matrix_analysis_runs"):
            return httpx.Response(200, json=[{
                "draw_period": "003117",
                "status": "failed",
                "phase": "status",
                "started_at": "2026-08-29T01:00:00+00:00",
                "completed_at": None,
                "error": "database raw analysis error",
                "updated_at": "unreliable-analysis-timestamp",
                "extra": "raw-analysis-row-secret",
            }])
        return httpx.Response(404, json={"error": "NOT_FOUND"})

    base_url = "https://example.supabase.co/rest/v1"
    http_client = httpx.Client(
        base_url=base_url,
        transport=httpx.MockTransport(handler),
    )
    with SyncPostgrestClient(base_url, http_client=http_client) as client:
        items = SupabaseAnalysisRepository(client).list_job_statuses()

    assert items[0] == {
        "lottery": "今彩539",
        "jobName": "matrix-539-refresh-v2",
        "job": {
            "jobName": "matrix-539-refresh-v2",
            "lottery": "今彩539",
            "status": "failed",
            "startedAt": "2026-08-29T01:00:00+00:00",
            "finishedAt": "2026-08-29T01:01:00+00:00",
            "error": "WORKER_FAILED",
            "sourcePeriod": "003118",
            "databasePeriod": "003117",
            "writtenPeriod": None,
            "updatedAt": "2026-08-29T01:01:00+00:00",
        },
        "latestDraw": {
            "period": "003117",
            "drawDate": "2026-08-28",
        },
        "latestAnalysis": {
            "drawPeriod": "003117",
            "status": "failed",
            "phase": "status",
            "startedAt": "2026-08-29T01:00:00+00:00",
            "completedAt": None,
            "error": "ANALYSIS_FAILED",
        },
    }
    serialized = str(items)
    assert "raw-worker-secret" not in serialized
    assert "raw-job-row-secret" not in serialized
    assert "raw-draw-row-secret" not in serialized
    assert "database raw analysis error" not in serialized
    assert "raw-analysis-row-secret" not in serialized
    assert "unreliable-draw-timestamp" not in serialized
    assert "unreliable-analysis-timestamp" not in serialized


def test_supabase_job_status_start_and_finish_use_primary_key() -> None:
    client = FakeClient()
    repository = SupabaseAnalysisRepository(client)

    repository.start_job("matrix-539-refresh-v2", "今彩539", "2026-08-29T01:00:00+00:00")
    repository.finish_job(
        "matrix-539-refresh-v2",
        "failed",
        "2026-08-29T01:01:00+00:00",
        "builder failed",
        source_period="003118",
        database_period="003117",
        written_period=None,
    )

    assert client.executions == [
        {
            "table": "system_job_status",
            "operation": "upsert",
            "record": {
                "job_name": "matrix-539-refresh-v2",
                "lottery": "今彩539",
                "status": "running",
                "started_at": "2026-08-29T01:00:00+00:00",
                "finished_at": None,
                "error": None,
                "source_period": None,
                "database_period": None,
                "written_period": None,
                "updated_at": "2026-08-29T01:00:00+00:00",
            },
            "onConflict": "job_name",
            "filters": [],
        },
        {
            "table": "system_job_status",
            "operation": "update",
            "record": {
                "status": "failed",
                "finished_at": "2026-08-29T01:01:00+00:00",
                "error": "builder failed",
                "source_period": "003118",
                "database_period": "003117",
                "written_period": None,
                "updated_at": "2026-08-29T01:01:00+00:00",
            },
            "onConflict": None,
            "filters": [("job_name", "matrix-539-refresh-v2")],
        },
    ]
