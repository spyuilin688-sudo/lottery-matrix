from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.worker import run_scheduled_worker, run_worker


TAIPEI = ZoneInfo("Asia/Taipei")


class Source:
    def __init__(self, history_count: int = 120) -> None:
        self.history_count = history_count
        self.events: list[str] = []

    @staticmethod
    def _draw(period: int, count: int, draw_date: str | None = None) -> dict:
        return {
            "period": str(period).zfill(9),
            "drawDate": draw_date or f"2026-08-{((period - 1) % 28) + 1:02d}",
            "numbers": [str(value).zfill(2) for value in range(1, count + 1)],
        }

    def fetch(self, lottery: str) -> dict:
        self.events.append("latest")
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        return self._draw(220, count)

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.events.append("history-all" if limit is None else f"history-{limit}")
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        rows = [self._draw(period, count) for period in range(220, 220 - self.history_count, -1)]
        return rows if limit is None else rows[:limit]


class ScheduledSource(Source):
    def fetch(self, lottery: str) -> dict:
        self.events.append("latest")
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        return self._draw(221, count, "2026-08-28")


class StaleScheduledSource(Source):
    def fetch(self, lottery: str) -> dict:
        self.events.append("latest")
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        return self._draw(220, count, "2026-08-27")


class TrackingRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.events: list[str] = []

    def cleanup_expired(self, now: datetime) -> int:
        self.events.append("cleanup")
        return super().cleanup_expired(now)


def _builders(calls: list[str], history_lengths: list[int] | None = None, failing: str | None = None) -> dict:
    def build(kind: str):
        def selected(context: dict) -> dict:
            calls.append(kind)
            if history_lengths is not None:
                history_lengths.append(len(context["history"]))
            if kind == failing:
                raise RuntimeError("builder failed")
            return {"kind": kind}
        return selected
    return {kind: build(kind) for kind in ("explore", "tianyan", "tiangong", "status")}


def test_worker_backfills_and_analyzes_complete_history() -> None:
    repository = TrackingRepository()
    source = Source(history_count=120)
    calls: list[str] = []
    history_lengths: list[int] = []

    result = run_worker("今彩539", repository, source, _builders(calls, history_lengths))

    assert result["status"] == "complete"
    assert result["analysisVersion"] == "000000220:matrix-python-v6"
    assert repository.events[0] == "cleanup"
    assert source.events == ["history-all", "latest"]
    assert calls == ["explore", "tianyan", "tiangong", "status"]
    assert history_lengths == [120, 120, 120, 120]
    assert len(repository.list_draws("今彩539", None)) == 120


def test_worker_has_no_fixed_minimum_history_count() -> None:
    repository = TrackingRepository()
    source = Source(history_count=79)
    calls: list[str] = []
    history_lengths: list[int] = []

    result = run_worker("今彩539", repository, source, _builders(calls, history_lengths))

    assert result["status"] == "complete"
    assert repository.events == ["cleanup"]
    assert source.events == ["history-all", "latest"]
    assert calls == ["explore", "tianyan", "tiangong", "status"]
    assert history_lengths == [79, 79, 79, 79]
    assert repository.get_progress("今彩539", "000000220")["status"] == "complete"


def test_worker_cleans_expired_artifacts_before_running() -> None:
    repository = TrackingRepository()
    source = Source()
    repository.begin_run("今彩539", "old", "old-version", datetime.now(UTC).isoformat())
    repository.save_artifact("今彩539", "old", "old-version", "explore", {"old": True})
    old_key = ("今彩539", "old", "old-version", "explore")
    repository.artifacts[old_key]["expiresAt"] = datetime.now(UTC) - timedelta(days=1)

    run_worker("今彩539", repository, source, _builders([]))

    assert old_key not in repository.artifacts


def test_worker_failure_does_not_replace_an_existing_completed_lottery() -> None:
    repository = InMemoryAnalysisRepository()
    run_worker("今彩539", repository, Source(), _builders([]))
    with pytest.raises(RuntimeError, match="builder failed"):
        run_worker("大樂透", repository, Source(), _builders([], failing="tianyan"))
    assert repository.read_completed_artifact("今彩539", "000000220", "status") == {"kind": "status"}
    assert repository.get_progress("大樂透", "000000220")["status"] == "failed"


def test_worker_finishes_all_checkpoint_batches_in_one_invocation() -> None:
    repository = TrackingRepository()
    source = Source()
    starts: list[int] = []

    def explore(context: dict) -> dict:
        start = context["exploreBatch"]["start"]
        stop = min(25, start + context["exploreBatch"]["limit"])
        starts.append(start)
        return {
            "artifact": {"items": list(range(start, stop)), "validationById": {}},
            "_checkpoint": {
                "cursorStart": start,
                "cursor": stop,
                "total": 25,
                "complete": stop == 25,
            },
        }

    builders = {
        "explore": explore,
        "tianyan": lambda context: {"source": context["artifacts"]["explore"]["items"]},
        "tiangong": lambda _: {"items": []},
        "status": lambda context: {"source": context["artifacts"]["tianyan"]["source"]},
    }

    result = run_worker("今彩539", repository, source, builders)

    assert result["status"] == "complete"
    assert starts == [0, 10, 20]


def test_worker_retries_failed_analysis_from_its_checkpoint() -> None:
    repository = TrackingRepository()
    source = Source()
    attempts = 0

    def tianyan(_: dict) -> dict:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("temporary calculation failure")
        return {"items": []}

    builders = {
        "explore": lambda _: {"items": []},
        "tianyan": tianyan,
        "tiangong": lambda _: {"items": []},
        "status": lambda _: {"items": []},
    }

    result = run_worker("今彩539", repository, source, builders)

    assert result["status"] == "complete"
    assert attempts == 2


def test_scheduled_worker_resumes_when_current_draw_is_stored_without_analysis() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "今彩539",
        "period": "000000221",
        "drawDate": "2026-08-28",
        "numbers": ["01", "02", "03", "04", "05"],
    })
    repository.upsert_draw({
        "lottery": "今彩539",
        "period": "999999999",
        "drawDate": None,
        "numbers": ["06", "07", "08", "09", "10"],
    })
    source = ScheduledSource()

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
    )

    assert result["status"] == "complete"
    assert result["analysisVersion"] == "000000221:matrix-python-v6"
    assert source.events == []


def test_scheduled_worker_calls_source_when_draw_is_due_and_not_acquired() -> None:
    repository = InMemoryAnalysisRepository()
    source = ScheduledSource()

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
    )

    assert result["status"] == "complete"
    assert source.events == ["history-all", "latest"]


def test_scheduled_worker_does_not_analyze_stale_draw() -> None:
    repository = InMemoryAnalysisRepository()
    source = StaleScheduledSource()
    calls: list[str] = []

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI),
        repository,
        source,
        _builders(calls),
    )

    assert result["status"] == "not-acquired"
    assert source.events == ["history-all", "latest"]
    assert calls == []


def test_scheduled_worker_does_nothing_outside_call_schedule() -> None:
    repository = InMemoryAnalysisRepository()
    source = ScheduledSource()

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 34, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
    )

    assert result["status"] == "not-due"
    assert source.events == []
