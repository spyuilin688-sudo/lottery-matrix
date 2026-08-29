from datetime import UTC, datetime

import pytest

from app.api_server import handle_api_request
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.worker import run_worker


class TrackingRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.health_error: Exception | None = None
        self.job_statuses: list[dict] = []
        self.job_events: list[tuple] = []

    def health_check(self) -> None:
        if self.health_error is not None:
            raise self.health_error

    def list_job_statuses(self) -> list[dict]:
        return list(self.job_statuses)

    def start_job(self, job_name: str, lottery: str, started_at: str) -> None:
        self.job_events.append(("start", job_name, lottery, started_at))

    def finish_job(self, job_name: str, status: str, finished_at: str, error: str | None = None) -> None:
        self.job_events.append(("finish", job_name, status, finished_at, error))


class Source:
    @staticmethod
    def _draw(period: int) -> dict:
        return {
            "period": str(period).zfill(9),
            "drawDate": "2026-08-29",
            "numbers": ["01", "02", "03", "04", "05"],
        }

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        return [self._draw(period) for period in range(120, 100, -1)]

    def fetch(self, lottery: str) -> dict:
        return self._draw(121)


def _builders(failing: bool = False) -> dict:
    def explore(_: dict) -> dict:
        if failing:
            raise RuntimeError("calculation failed")
        return {"items": []}

    return {
        "explore": explore,
        "tianyan": lambda _: {"items": []},
        "tiangong": lambda _: {"items": []},
        "status": lambda _: {"items": []},
    }


def test_health_checks_database_and_returns_service_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    repository = TrackingRepository()
    monkeypatch.setenv("MATRIX_SERVICE_VERSION", "test-version")

    status, payload = handle_api_request("GET", "/health", None, repository)

    assert status == 200
    assert payload == {
        "status": "ok",
        "service": "matrix-railway-api",
        "version": "test-version",
        "database": {"status": "ok"},
    }


def test_health_returns_503_when_database_check_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    repository = TrackingRepository()
    repository.health_error = RuntimeError("database offline")
    monkeypatch.setenv("MATRIX_SERVICE_VERSION", "test-version")

    status, payload = handle_api_request("GET", "/health", None, repository)

    assert status == 503
    assert payload["status"] == "error"
    assert payload["database"] == {"status": "error"}


def test_jobs_status_exposes_repository_job_rows() -> None:
    repository = TrackingRepository()
    repository.job_statuses = [{"jobName": "matrix-539-refresh-v2", "status": "success"}]

    status, payload = handle_api_request("GET", "/jobs/status", None, repository)

    assert status == 200
    assert payload == {"items": repository.job_statuses}


def test_worker_records_successful_job_without_reintroducing_history_limit() -> None:
    repository = TrackingRepository()

    result = run_worker("今彩539", repository, Source(), _builders())

    assert result["status"] == "complete"
    assert repository.job_events[0][0:3] == ("start", "matrix-539-refresh-v2", "今彩539")
    assert repository.job_events[-1][0:3] == ("finish", "matrix-539-refresh-v2", "success")


def test_worker_records_failed_job_and_rethrows_original_error() -> None:
    repository = TrackingRepository()

    with pytest.raises(RuntimeError, match="calculation failed"):
        run_worker("今彩539", repository, Source(), _builders(failing=True))

    assert repository.job_events[0][0:3] == ("start", "matrix-539-refresh-v2", "今彩539")
    assert repository.job_events[-1][0:3] == ("finish", "matrix-539-refresh-v2", "failed")
    assert "calculation failed" in str(repository.job_events[-1][-1])
