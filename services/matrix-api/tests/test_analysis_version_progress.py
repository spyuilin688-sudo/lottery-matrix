from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.repositories.analysis_repository import (
    ARTIFACT_KINDS,
    InMemoryAnalysisRepository,
    SupabaseAnalysisRepository,
)
from app.services.analysis_pipeline import AnalysisPipeline
from app.worker import ANALYSIS_VERSION, run_scheduled_worker


TAIPEI = ZoneInfo("Asia/Taipei")
LOTTERY = "今彩539"
PERIOD = "000000221"
CURRENT_VERSION = f"{PERIOD}:matrix-python-v8"
LEGACY_VERSION = f"{PERIOD}:matrix-python-v7"


class FakeResponse:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class RecordingQuery:
    def __init__(self, client: "RecordingSupabaseClient") -> None:
        self.client = client

    def select(self, _: str) -> "RecordingQuery":
        return self

    def eq(self, column: str, value: Any) -> "RecordingQuery":
        self.client.filters.append((column, value))
        return self

    def order(self, _: str, desc: bool = False) -> "RecordingQuery":
        return self

    def limit(self, _: int) -> "RecordingQuery":
        return self

    def execute(self) -> FakeResponse:
        return FakeResponse(self.client.rows)


class RecordingSupabaseClient:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.filters: list[tuple[str, Any]] = []

    def table(self, _: str) -> RecordingQuery:
        return RecordingQuery(self)


class UnexpectedSource:
    def fetch(self, lottery: str) -> dict[str, Any]:
        raise AssertionError(f"source must not be called for {lottery}")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict[str, Any]]:
        raise AssertionError(f"source history must not be called for {lottery} ({limit})")


def _draw(period: int, draw_date: str) -> dict[str, Any]:
    return {
        "lottery": LOTTERY,
        "period": str(period).zfill(9),
        "drawDate": draw_date,
        "numbers": ["01", "02", "03", "04", "05"],
    }


def _complete_run(
    repository: InMemoryAnalysisRepository,
    version: str,
    started_at: str,
    completed_at: str,
) -> None:
    repository.begin_run(LOTTERY, PERIOD, version, started_at)
    for kind in ARTIFACT_KINDS:
        repository.save_artifact(LOTTERY, PERIOD, version, kind, {"kind": kind})
    repository.complete_run(LOTTERY, PERIOD, version, completed_at)


def test_worker_uses_matrix_python_v8() -> None:
    assert ANALYSIS_VERSION == "matrix-python-v8"


def test_progress_lookup_can_be_scoped_to_one_analysis_version() -> None:
    repository = InMemoryAnalysisRepository()
    repository.begin_run(LOTTERY, PERIOD, CURRENT_VERSION, "2026-08-29T09:00:00+00:00")
    _complete_run(
        repository,
        LEGACY_VERSION,
        "2099-01-01T00:00:00+00:00",
        "2099-01-01T00:01:00+00:00",
    )

    progress = repository.get_progress(LOTTERY, PERIOD, CURRENT_VERSION)

    assert progress is not None
    assert progress["analysisVersion"] == CURRENT_VERSION
    assert progress["status"] == "running"


def test_supabase_progress_lookup_filters_by_analysis_version() -> None:
    row = {
        "lottery": LOTTERY,
        "draw_period": PERIOD,
        "analysis_version": CURRENT_VERSION,
        "phase": "tiangong",
        "cursor": 100,
        "total": 5174,
        "status": "running",
        "started_at": "2026-08-29T09:00:00+00:00",
        "completed_at": None,
        "error": None,
    }
    client = RecordingSupabaseClient([row])
    repository = SupabaseAnalysisRepository(client)

    progress = repository.get_progress(LOTTERY, PERIOD, CURRENT_VERSION)

    assert progress is not None
    assert progress["analysisVersion"] == CURRENT_VERSION
    assert client.filters == [
        ("lottery", LOTTERY),
        ("draw_period", PERIOD),
        ("analysis_version", CURRENT_VERSION),
    ]


def test_pipeline_returns_current_version_progress_when_legacy_run_is_newer() -> None:
    repository = InMemoryAnalysisRepository()
    _complete_run(
        repository,
        LEGACY_VERSION,
        "2099-01-01T00:00:00+00:00",
        "2099-01-01T00:01:00+00:00",
    )

    def explore(_: dict[str, Any]) -> dict[str, Any]:
        return {
            "artifact": {"items": [], "validationById": {}},
            "_checkpoint": {
                "cursorStart": 0,
                "cursor": 1,
                "total": 2,
                "complete": False,
            },
        }

    pipeline = AnalysisPipeline(
        repository,
        {
            "explore": explore,
            "tianyan": lambda _: {},
            "tiangong": lambda _: {},
            "status": lambda _: {},
        },
        CURRENT_VERSION,
    )

    result = pipeline.run(_draw(221, "2026-08-28"), [])

    assert result["analysisVersion"] == CURRENT_VERSION
    assert result["status"] == "running"
    assert result["cursor"] == 1
    assert result["total"] == 2


def test_scheduled_worker_does_not_resume_when_current_version_is_complete() -> None:
    repository = InMemoryAnalysisRepository()
    for offset in range(80):
        repository.upsert_draw(
            _draw(221 - offset, "2026-08-28" if offset == 0 else "2026-08-27")
        )
    _complete_run(
        repository,
        CURRENT_VERSION,
        "2026-08-29T09:00:00+00:00",
        "2026-08-29T09:01:00+00:00",
    )
    repository.begin_run(
        LOTTERY,
        PERIOD,
        LEGACY_VERSION,
        "2099-01-01T00:00:00+00:00",
    )

    result = run_scheduled_worker(
        LOTTERY,
        datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI),
        repository,
        UnexpectedSource(),
    )

    assert result == {
        "lottery": LOTTERY,
        "drawPeriod": PERIOD,
        "status": "already-acquired",
    }
