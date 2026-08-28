from typing import Any

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
    repository.finish_job("matrix-539-refresh-v2", "success", "2026-08-29T01:01:00+00:00")

    row = repository.list_job_statuses()[0]
    assert row["job"] == {
        "jobName": "matrix-539-refresh-v2",
        "lottery": "今彩539",
        "status": "success",
        "startedAt": "2026-08-29T01:00:00+00:00",
        "finishedAt": "2026-08-29T01:01:00+00:00",
        "error": None,
        "updatedAt": "2026-08-29T01:01:00+00:00",
    }


def test_supabase_job_status_start_and_finish_use_primary_key() -> None:
    client = FakeClient()
    repository = SupabaseAnalysisRepository(client)

    repository.start_job("matrix-539-refresh-v2", "今彩539", "2026-08-29T01:00:00+00:00")
    repository.finish_job(
        "matrix-539-refresh-v2",
        "failed",
        "2026-08-29T01:01:00+00:00",
        "builder failed",
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
            },
            "onConflict": None,
            "filters": [("job_name", "matrix-539-refresh-v2")],
        },
    ]
