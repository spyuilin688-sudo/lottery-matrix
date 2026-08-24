from datetime import UTC, datetime, timedelta

import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.worker import run_worker


class Source:
    def __init__(self, history_count: int = 80) -> None:
        self.history_count = history_count
        self.events: list[str] = []

    @staticmethod
    def _draw(period: int, count: int) -> dict:
        return {
            "period": str(period).zfill(9),
            "drawDate": f"2026-08-{((period - 1) % 28) + 1:02d}",
            "numbers": [str(value).zfill(2) for value in range(1, count + 1)],
        }

    def fetch(self, lottery: str) -> dict:
        self.events.append("latest")
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        return self._draw(180, count)

    def fetch_history(self, lottery: str, limit: int) -> list[dict]:
        self.events.append("history")
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        return [self._draw(period, count) for period in range(180, 180 - min(limit, self.history_count), -1)]


class TrackingRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.events: list[str] = []

    def cleanup_expired(self, now: datetime) -> int:
        self.events.append("cleanup")
        return super().cleanup_expired(now)


def _builders(calls: list[str], failing: str | None = None) -> dict:
    def build(kind: str):
        def selected(_: dict) -> dict:
            calls.append(kind)
            if kind == failing:
                raise RuntimeError("builder failed")
            return {"kind": kind}
        return selected
    return {kind: build(kind) for kind in ("explore", "tianyan", "tiangong", "status")}


def test_worker_backfills_history_refreshes_latest_and_publishes_four_artifacts_in_order() -> None:
    repository = TrackingRepository()
    source = Source()
    calls: list[str] = []

    result = run_worker("今彩539", repository, source, _builders(calls))

    assert result["status"] == "complete"
    assert repository.events[0] == "cleanup"
    assert source.events == ["history", "latest"]
    assert calls == ["explore", "tianyan", "tiangong", "status"]
    assert len(repository.list_draws("今彩539", 80)) == 80


def test_worker_rejects_analysis_when_history_is_under_80_draws() -> None:
    repository = TrackingRepository()
    source = Source(history_count=79)
    calls: list[str] = []

    with pytest.raises(ValueError, match="DRAW_HISTORY_INCOMPLETE"):
        run_worker("今彩539", repository, source, _builders(calls))

    assert repository.events == ["cleanup"]
    assert source.events == ["history"]
    assert calls == []
    assert repository.get_progress("今彩539", "000000180") is None


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
    assert repository.read_completed_artifact("今彩539", "000000180", "status") == {"kind": "status"}
    assert repository.get_progress("大樂透", "000000180")["status"] == "failed"
