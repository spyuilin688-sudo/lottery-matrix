from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.worker import run_scheduled_worker


TAIPEI = ZoneInfo("Asia/Taipei")
JOB_NAME = "matrix-539-refresh-v2"


class Source:
    def __init__(self, draw_date: str = "2026-08-28") -> None:
        self.draw_date = draw_date

    @staticmethod
    def _numbers() -> list[str]:
        return ["01", "02", "03", "04", "05"]

    def fetch(self, lottery: str) -> dict:
        return {
            "period": "000000221",
            "drawDate": self.draw_date,
            "numbers": self._numbers(),
        }

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        rows = [
            {
                "period": str(period).zfill(9),
                "drawDate": f"2026-08-{((period - 1) % 28) + 1:02d}",
                "numbers": self._numbers(),
            }
            for period in range(220, 100, -1)
        ]
        return rows if limit is None else rows[:limit]


class JobTrackingRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.job_events: list[dict] = []

    def start_job(self, job_name: str, lottery: str, started_at: str) -> None:
        self.job_events.append({
            "action": "start",
            "jobName": job_name,
            "lottery": lottery,
            "startedAt": started_at,
        })

    def finish_job(self, job_name: str, status: str, finished_at: str, error: str | None = None) -> None:
        self.job_events.append({
            "action": "finish",
            "jobName": job_name,
            "status": status,
            "finishedAt": finished_at,
            "error": error,
        })


class TelemetryFailingRepository(JobTrackingRepository):
    def __init__(self, fail_on: str) -> None:
        super().__init__()
        self.fail_on = fail_on

    def start_job(self, job_name: str, lottery: str, started_at: str) -> None:
        super().start_job(job_name, lottery, started_at)
        if self.fail_on == "start":
            raise RuntimeError("start telemetry failed")

    def finish_job(self, job_name: str, status: str, finished_at: str, error: str | None = None) -> None:
        super().finish_job(job_name, status, finished_at, error)
        if self.fail_on == "finish":
            raise RuntimeError("finish telemetry failed")


def _builders(failing: bool = False) -> dict:
    def build(kind: str):
        def selected(_: dict) -> dict:
            if failing and kind == "tianyan":
                raise RuntimeError("builder failed")
            return {"items": []}
        return selected

    return {kind: build(kind) for kind in ("explore", "tianyan", "tiangong", "status")}


def _run_due_worker(
    repository: InMemoryAnalysisRepository,
    source: Source,
    builders: dict | None = None,
) -> dict:
    return run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI),
        repository,
        source,
        builders,
    )


def test_due_scheduled_worker_records_running_then_success() -> None:
    repository = JobTrackingRepository()

    result = _run_due_worker(repository, Source(), _builders())

    assert result["status"] == "complete"
    assert [(event["action"], event.get("status")) for event in repository.job_events] == [
        ("start", None),
        ("finish", "success"),
    ]
    assert repository.job_events[0]["jobName"] == JOB_NAME
    assert repository.job_events[0]["lottery"] == "今彩539"
    assert repository.job_events[1]["error"] is None


def test_due_scheduled_worker_records_failed_and_preserves_original_error() -> None:
    repository = JobTrackingRepository()

    with pytest.raises(RuntimeError, match="builder failed"):
        _run_due_worker(repository, Source(), _builders(failing=True))

    assert [(event["action"], event.get("status")) for event in repository.job_events] == [
        ("start", None),
        ("finish", "failed"),
    ]
    assert repository.job_events[1]["error"] == "builder failed"


@pytest.mark.parametrize("fail_on", ["start", "finish"])
def test_due_scheduled_worker_ignores_telemetry_failures(fail_on: str) -> None:
    repository = TelemetryFailingRepository(fail_on)

    assert _run_due_worker(repository, Source(), _builders())["status"] == "complete"


def test_due_scheduled_worker_preserves_builder_error_when_failure_status_write_fails() -> None:
    repository = TelemetryFailingRepository("finish")

    with pytest.raises(RuntimeError, match="builder failed"):
        _run_due_worker(repository, Source(), _builders(failing=True))


def test_due_scheduled_worker_records_one_execution() -> None:
    repository = JobTrackingRepository()

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI),
        repository,
        Source(),
        _builders(),
    )

    assert result["status"] == "complete"
    assert [event["action"] for event in repository.job_events] == ["start", "finish"]
    assert repository.job_events[1]["status"] == "success"


def test_not_acquired_finishes_invocation_as_success() -> None:
    repository = JobTrackingRepository()
    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI),
        repository,
        Source(draw_date="2026-08-27"),
        _builders(),
    )
    assert result["status"] == "not-acquired"
    assert repository.job_events[-1]["status"] == "success"


def test_running_analysis_checkpoint_finishes_invocation_as_success(monkeypatch) -> None:
    monkeypatch.setattr("app.worker.MAX_CYCLES_PER_INVOCATION", 1)
    repository = JobTrackingRepository()

    def explore(context: dict) -> dict:
        start = context["exploreBatch"]["start"]
        return {
            "artifact": {"items": [], "validationById": {}},
            "_checkpoint": {
                "cursorStart": start,
                "cursor": start + 10,
                "total": 20,
                "complete": False,
            },
        }

    builders = {
        "explore": explore,
        "tianyan": lambda _: {"items": []},
        "tiangong": lambda _: {"items": []},
        "status": lambda _: {"items": []},
    }
    result = _run_due_worker(repository, Source(), builders)
    assert result["status"] == "running"
    assert repository.job_events[-1]["status"] == "success"


def test_resumed_analysis_does_not_overwrite_job_status() -> None:
    repository = JobTrackingRepository()
    repository.upsert_draw({
        "lottery": "今彩539",
        "period": "000000221",
        "drawDate": "2026-08-28",
        "numbers": ["01", "02", "03", "04", "05"],
    })
    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI),
        repository,
        Source(),
        _builders(),
    )
    assert result["status"] == "complete"
    assert repository.job_events == []


def test_out_of_schedule_call_does_not_overwrite_job_status() -> None:
    repository = JobTrackingRepository()

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 34, tzinfo=TAIPEI),
        repository,
        Source(),
        _builders(),
    )

    assert result == {"lottery": "今彩539", "status": "not-due"}
    assert repository.job_events == []
