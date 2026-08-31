from datetime import datetime
from zoneinfo import ZoneInfo

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.worker import run_scheduled_worker


TAIPEI = ZoneInfo("Asia/Taipei")


class UnexpectedSource:
    def fetch(self, lottery: str) -> dict:
        raise AssertionError("source must not be called after the current draw is stored")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        raise AssertionError("source must not be called after the current draw is stored")


class RepairSource:
    def __init__(self) -> None:
        self.history_requests: list[int | None] = []

    def fetch(self, lottery: str) -> dict:
        raise AssertionError("latest draw is already stored")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.history_requests.append(limit)
        history = [
            _stored_draw(period, "2026-08-28" if period == 221 else "2026-08-27")
            for period in range(221, 141, -1)
        ]
        return history if limit is None else history[:limit]


class FullHistoryReadTrackingRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.full_history_reads = 0

    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict]:
        if limit is None:
            self.full_history_reads += 1
        return super().list_draws(lottery, limit)


def _stored_draw(period: int, draw_date: str) -> dict:
    return {
        "lottery": "今彩539",
        "period": str(period).zfill(9),
        "drawDate": draw_date,
        "numbers": ["01", "02", "03", "04", "05"],
    }


def _builders(calls: list[str]) -> dict:
    def build(kind: str):
        def selected(_: dict) -> dict:
            calls.append(kind)
            return {"kind": kind}
        return selected

    return {kind: build(kind) for kind in ("explore", "tianyan", "status")}


def _repository_with_history() -> InMemoryAnalysisRepository:
    repository = InMemoryAnalysisRepository()
    for offset in range(80):
        repository.upsert_draw(_stored_draw(221 - offset, "2026-08-28" if offset == 0 else "2026-08-27"))
    return repository


def test_scheduled_worker_resumes_analysis_after_current_draw_is_already_stored() -> None:
    repository = _repository_with_history()
    calls: list[str] = []

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI),
        repository,
        UnexpectedSource(),
        _builders(calls),
    )

    assert result["status"] == "complete"
    assert result["analysisVersion"] == "000000221:matrix-python-v8"
    assert calls == ["explore", "tianyan", "status"]


def test_scheduled_worker_resumes_incomplete_analysis_between_polling_windows() -> None:
    repository = _repository_with_history()
    calls: list[str] = []

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 34, tzinfo=TAIPEI),
        repository,
        UnexpectedSource(),
        _builders(calls),
    )

    assert result["status"] == "complete"
    assert result["analysisVersion"] == "000000221:matrix-python-v8"
    assert calls == ["explore", "tianyan", "status"]


def test_completed_scheduled_analysis_does_not_read_all_history_again() -> None:
    repository = FullHistoryReadTrackingRepository()
    for offset in range(80):
        repository.upsert_draw(
            _stored_draw(221 - offset, "2026-08-28" if offset == 0 else "2026-08-27")
        )
    now = datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI)
    run_scheduled_worker(
        "今彩539", now, repository, UnexpectedSource(), _builders([]),
    )
    repository.full_history_reads = 0

    result = run_scheduled_worker(
        "今彩539", now, repository, UnexpectedSource(), _builders([]),
    )

    assert result["status"] == "already-acquired"
    assert repository.full_history_reads == 0


def test_completed_analysis_backfills_missing_explore_query_results() -> None:
    repository = _repository_with_history()
    now = datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI)

    def explore(_: dict) -> dict:
        return {
            "artifact": {
                "items": [{
                    "id": "explore-1",
                    "number": "01",
                    "lockedPosition": 1,
                    "predictionDistance": 1,
                    "consecutive": "準4進5",
                    "highestStreak": 4,
                    "predictionNumbers": ["02"],
                    "algorithmType": "加減",
                    "numberOrder": "依號碼由小到大排序",
                    "ruleCount": 1,
                    "lockedSourceIndex": 0,
                    "lockedSourcePeriod": "000000221",
                }],
                "validationById": {"explore-1": {"itemId": "explore-1"}},
            },
            "_checkpoint": {"cursor": 1, "total": 1, "complete": True},
        }

    builders = {
        "explore": explore,
        "tianyan": lambda _: {"items": []},
        "status": lambda _: {"items": []},
    }
    run_scheduled_worker(
        "今彩539", now, repository, UnexpectedSource(), builders,
    )
    assert repository.explore_results

    repository.explore_results.clear()

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 34, tzinfo=TAIPEI),
        repository,
        UnexpectedSource(),
        _builders([]),
    )

    assert result == {"lottery": "今彩539", "status": "not-due"}
    assert repository.explore_results


def test_scheduled_worker_repairs_history_before_resuming_any_algorithm() -> None:
    repository = _repository_with_history()
    repository.draws.pop(("今彩539", "000000208"))
    repository.draws.pop(("今彩539", "000000209"))
    source = RepairSource()
    calls: list[str] = []

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 34, tzinfo=TAIPEI),
        repository,
        source,
        _builders(calls),
    )

    assert result["status"] == "complete"
    assert source.history_requests == [14]
    assert calls == ["explore", "tianyan", "status"]
