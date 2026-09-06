from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import httpx
import pytest
from postgrest.exceptions import APIError

from app import worker as worker_module
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.explore_batches import work_units
from app.worker import run_scheduled_worker


TAIPEI = ZoneInfo("Asia/Taipei")


def run_due_worker(
    lottery: str,
    repository: InMemoryAnalysisRepository,
    source: object,
    builders: dict | None = None,
    *,
    draw_date: str = "2026-08-24",
) -> dict:
    call_times = {
        "今彩539": (20, 33),
        "天天樂": (9, 33),
        "六合彩": (21, 33),
        "大樂透": (20, 53),
    }
    hour, minute = call_times[lottery]
    return run_scheduled_worker(
        lottery,
        datetime.fromisoformat(draw_date).replace(hour=hour, minute=minute, tzinfo=TAIPEI),
        repository,
        source,
        builders,
    )


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


class AlgorithmHistorySource(Source):
    def __init__(self, *, complete: bool = True) -> None:
        super().__init__()
        self.complete = complete

    def fetch_algorithm_history(self, lottery: str) -> list[dict]:
        self.events.append("algorithm-history")
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        rows = [
            {
                **self._draw(period, count),
                "sortedNumbers": self._draw(period, count)["numbers"],
                "drawOrderNumbers": list(reversed(self._draw(period, count)["numbers"])),
            }
            for period in range(220, 100, -1)
        ]
        if not self.complete:
            rows[40]["drawOrderNumbers"] = None
        if lottery == "今彩539":
            anchor = self._draw(96000001, count, "2007-01-01")
            rows.append({
                **anchor,
                "sortedNumbers": anchor["numbers"],
                "drawOrderNumbers": (
                    list(reversed(anchor["numbers"]))
                    if self.complete
                    else None
                ),
            })
        return rows


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


class Fantasy5ScheduledSource(Source):
    def fetch(self, lottery: str) -> dict:
        self.events.append("latest")
        return self._draw(221, 5, "2026-08-28")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.events.append("history-all" if limit is None else f"history-{limit}")
        rows = [
            self._draw(
                221 - offset,
                5,
                (datetime(2026, 8, 28) - timedelta(days=offset)).date().isoformat(),
            )
            for offset in range(self.history_count)
        ]
        return rows if limit is None else rows[:limit]


class MarkSixSundaySource(Source):
    def fetch(self, lottery: str) -> dict:
        self.events.append("latest")
        return self._draw(221, 7, "2026-08-30")


class CalendarHistorySource(Source):
    def fetch(self, lottery: str) -> dict:
        self.events.append("latest")
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        return self._draw(220, count, "2026-08-29")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.events.append("history-all" if limit is None else f"history-{limit}")
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        rows = [
            self._draw(
                220 - offset,
                count,
                (datetime(2026, 8, 29) - timedelta(days=offset)).date().isoformat(),
            )
            for offset in range(self.history_count)
        ]
        return rows if limit is None else rows[:limit]


class SourceAheadOfDatabase(Source):
    def fetch(self, lottery: str) -> dict:
        self.events.append("latest")
        return self._draw(205, 5, "2026-08-29")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.events.append("history-all" if limit is None else f"history-{limit}")
        rows = [
            self._draw(
                205 - offset,
                5,
                (datetime(2026, 8, 29) - timedelta(days=offset)).date().isoformat(),
            )
            for offset in range(36)
        ]
        return rows if limit is None else rows[:limit]


class TrackingRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.events: list[str] = []

    def cleanup_expired(self, now: datetime) -> int:
        self.events.append("cleanup")
        return super().cleanup_expired(now)


class FullHistoryReadTrackingRepository(TrackingRepository):
    def __init__(self) -> None:
        super().__init__()
        self.full_history_reads = 0

    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict]:
        if limit is None:
            self.full_history_reads += 1
        return super().list_draws(lottery, limit)


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

    result = run_due_worker("今彩539", repository, source, _builders(calls, history_lengths))

    assert result["status"] == "complete"
    assert result["analysisVersion"] == "000000220:matrix-python-v12"
    assert repository.events[0] == "cleanup"
    assert source.events == ["history-all", "latest"]
    assert calls == ["explore", "tianyan", "tiangong", "status"]
    assert history_lengths == [120, 120, 120, 120]
    assert len(repository.list_draws("今彩539", None)) == 120


def test_worker_checks_one_month_but_keeps_full_history_for_algorithms() -> None:
    repository = TrackingRepository()
    source = CalendarHistorySource(history_count=120)
    history_lengths: list[int] = []

    result = run_due_worker(
        "今彩539", repository, source, _builders([], history_lengths), draw_date="2026-08-29",
    )

    assert result["status"] == "complete"
    assert history_lengths == [120, 120, 120, 120]


def test_production_worker_repairs_actual_draw_order_before_algorithms(monkeypatch) -> None:
    repository = TrackingRepository()
    source = AlgorithmHistorySource()
    calls: list[str] = []
    monkeypatch.setattr(worker_module, "create_artifact_builders", lambda: _builders(calls))

    result = run_due_worker("今彩539", repository, source)

    assert result["status"] == "complete"
    assert source.events == ["history-all", "latest", "algorithm-history"]
    assert calls == ["explore", "tianyan", "tiangong", "status"]
    assert all(
        len(draw["drawOrderNumbers"]) == 5
        for draw in repository.list_draws("今彩539", None)
    )


def test_production_worker_stops_before_algorithms_if_draw_order_is_incomplete(monkeypatch) -> None:
    repository = TrackingRepository()
    source = AlgorithmHistorySource(complete=False)
    calls: list[str] = []
    monkeypatch.setattr(worker_module, "create_artifact_builders", lambda: _builders(calls))

    with pytest.raises(ValueError, match="DRAW_ORDER_HISTORY_INCOMPLETE"):
        run_due_worker("今彩539", repository, source)

    assert calls == []


def test_completed_scheduled_run_does_not_read_all_history_again() -> None:
    repository = FullHistoryReadTrackingRepository()
    source = CalendarHistorySource(history_count=120)
    run_due_worker("今彩539", repository, source, _builders([]), draw_date="2026-08-29")
    repository.full_history_reads = 0

    result = run_due_worker("今彩539", repository, source, _builders([]), draw_date="2026-08-29")

    assert result["status"] == "already-acquired"
    assert repository.full_history_reads == 0


def test_worker_refreshes_latest_draw_before_targeting_recent_gap_repair() -> None:
    repository = TrackingRepository()
    source = SourceAheadOfDatabase()
    for offset in range(31):
        period = 200 - offset
        if period == 198:
            continue
        repository.upsert_draw(
            source._draw(
                period,
                5,
                (datetime(2026, 8, 25) - timedelta(days=offset)).date().isoformat(),
            )
            | {"lottery": "今彩539"}
        )

    result = run_due_worker("今彩539", repository, source, _builders([]), draw_date="2026-08-29")

    assert result["status"] == "complete"
    assert repository.list_draws("今彩539", None)[0]["period"] == "000000205"
    assert ("今彩539", "000000198") in repository.draws


def test_worker_has_no_fixed_minimum_history_count() -> None:
    repository = TrackingRepository()
    source = Source(history_count=79)
    calls: list[str] = []
    history_lengths: list[int] = []

    result = run_due_worker("今彩539", repository, source, _builders(calls, history_lengths))

    assert result["status"] == "complete"
    assert repository.events == ["cleanup"]
    assert source.events == ["history-all", "latest"]
    assert calls == ["explore", "tianyan", "tiangong", "status"]
    assert history_lengths == [79, 79, 79, 79]
    assert repository.get_progress("今彩539", "000000220")["status"] == "complete"


def test_worker_stops_every_algorithm_when_missing_history_cannot_be_repaired() -> None:
    repository = TrackingRepository()
    source = Source(history_count=120)
    incomplete = [
        source._draw(period, 5)
        for period in range(220, 100, -1)
        if period not in {208, 209}
    ]
    source.fetch_history = lambda _lottery, _limit: [dict(draw) for draw in incomplete]
    calls: list[str] = []

    with pytest.raises(ValueError, match="DRAW_HISTORY_INCOMPLETE"):
        run_due_worker("今彩539", repository, source, _builders(calls))

    assert calls == []


def test_worker_cleans_expired_artifacts_before_running() -> None:
    repository = TrackingRepository()
    source = Source()
    repository.begin_run("今彩539", "old", "old-version", datetime.now(UTC).isoformat())
    repository.fail_run("今彩539", "old", "old-version", "abandoned")
    repository.save_artifact("今彩539", "old", "old-version", "explore", {"old": True})
    old_key = ("今彩539", "old", "old-version", "explore")
    repository.artifacts[old_key]["expiresAt"] = datetime.now(UTC) - timedelta(days=1)

    run_due_worker("今彩539", repository, source, _builders([]))

    assert old_key not in repository.artifacts


def test_worker_failure_does_not_replace_an_existing_completed_lottery() -> None:
    class TuesdayMarkSixSource(Source):
        def fetch(self, lottery: str) -> dict:
            self.events.append("latest")
            return self._draw(220, 7, "2026-08-25")

    repository = InMemoryAnalysisRepository()
    run_due_worker("今彩539", repository, Source(), _builders([]))
    with pytest.raises(RuntimeError, match="builder failed"):
        run_due_worker(
            "六合彩",
            repository,
            TuesdayMarkSixSource(),
            _builders([], failing="tianyan"),
            draw_date="2026-08-25",
        )
    assert repository.read_completed_artifact("今彩539", "000000220", "status") == {"kind": "status"}
    assert repository.get_progress("六合彩", "000000220")["status"] == "failed"


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

    result = run_due_worker("今彩539", repository, source, builders)

    assert result["status"] == "complete"
    assert starts == [0, 10, 20]


def test_worker_retries_failed_analysis_from_its_checkpoint(monkeypatch) -> None:
    repository = TrackingRepository()
    source = Source()
    attempts = 0
    waits: list[float] = []

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
    monkeypatch.setattr(worker_module, "sleep", waits.append, raising=False)

    result = run_due_worker("今彩539", repository, source, builders)

    assert result["status"] == "complete"
    assert attempts == 2
    assert waits == []


def test_worker_backs_off_before_retrying_transient_service_failure(monkeypatch) -> None:
    class TransientServiceError(RuntimeError):
        code = "521"

    repository = TrackingRepository()
    source = Source()
    attempts = 0
    waits: list[float] = []

    def tianyan(_: dict) -> dict:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise TransientServiceError("web server is down")
        return {"items": []}

    builders = {
        "explore": lambda _: {"items": []},
        "tianyan": tianyan,
        "tiangong": lambda _: {"items": []},
        "status": lambda _: {"items": []},
    }
    monkeypatch.setattr(worker_module, "sleep", waits.append, raising=False)

    result = run_due_worker("今彩539", repository, source, builders)

    assert result["status"] == "complete"
    assert attempts == 3
    assert waits == [15.0, 45.0]


def _postgrest_error(code: object) -> APIError:
    return APIError({
        "message": "service failure",
        "code": code,
        "hint": None,
        "details": None,
    })


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (_postgrest_error(500), True),
        (_postgrest_error("PGRST000"), True),
        (_postgrest_error("PGRST003"), True),
        (_postgrest_error("57014"), True),
        (
            httpx.HTTPStatusError(
                "service unavailable",
                request=httpx.Request("GET", "https://example.test"),
                response=httpx.Response(
                    503,
                    request=httpx.Request("GET", "https://example.test"),
                ),
            ),
            True,
        ),
        (
            httpx.HTTPStatusError(
                "unauthorized",
                request=httpx.Request("GET", "https://example.test"),
                response=httpx.Response(
                    401,
                    request=httpx.Request("GET", "https://example.test"),
                ),
            ),
            False,
        ),
        (
            httpx.ConnectError(
                "connection refused",
                request=httpx.Request("GET", "https://example.test"),
            ),
            True,
        ),
        (RuntimeError("deterministic failure"), False),
    ],
)
def test_transient_service_error_classification(error: Exception, expected: bool) -> None:
    assert worker_module._is_transient_service_error(error) is expected


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
    assert result["analysisVersion"] == "000000221:matrix-python-v12"
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


@pytest.mark.parametrize(
    ("lottery", "now"),
    [
        ("今彩539", datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI)),
        ("大樂透", datetime(2026, 8, 28, 20, 58, tzinfo=TAIPEI)),
        ("六合彩", datetime(2026, 8, 28, 21, 38, tzinfo=TAIPEI)),
    ],
)
def test_primary_scheduler_does_not_retry_source_five_minutes_later(
    lottery: str,
    now: datetime,
) -> None:
    repository = InMemoryAnalysisRepository()
    source = StaleScheduledSource()

    result = run_scheduled_worker(
        lottery,
        now,
        repository,
        source,
        _builders([]),
    )

    assert result["status"] == "not-due"
    assert source.events == []


def test_recovery_worker_can_retry_a_missing_draw_after_primary_call() -> None:
    repository = InMemoryAnalysisRepository()
    source = StaleScheduledSource()

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 39, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
        allow_recovery_crawl=True,
    )

    assert result["status"] == "not-acquired"
    assert source.events == ["history-all", "latest"]


def test_marksix_primary_scheduler_does_not_crawl_on_sunday() -> None:
    repository = InMemoryAnalysisRepository()
    source = MarkSixSundaySource()

    result = run_scheduled_worker(
        "六合彩",
        datetime(2026, 8, 30, 21, 33, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
    )

    assert result["status"] == "not-due"
    assert source.events == []


def test_marksix_sunday_recovery_accepts_the_sunday_draw() -> None:
    repository = InMemoryAnalysisRepository()
    source = MarkSixSundaySource()

    result = run_scheduled_worker(
        "六合彩",
        datetime(2026, 8, 30, 21, 43, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
        allow_recovery_crawl=True,
    )

    assert result["status"] == "complete"
    assert repository.list_draws("六合彩", 1)[0]["drawDate"] == "2026-08-30"


def test_marksix_sunday_recovery_stops_when_saturday_is_already_stored() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "六合彩",
        "period": "000000220",
        "drawDate": "2026-08-29",
        "numbers": ["01", "02", "03", "04", "05", "06", "07"],
    })
    source = MarkSixSundaySource()

    result = run_scheduled_worker(
        "六合彩",
        datetime(2026, 8, 30, 21, 43, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
        allow_recovery_crawl=True,
    )

    assert result["status"] == "complete"
    assert source.events == []


def test_fantasy5_accepts_normalized_taipei_date_for_taipei_cycle() -> None:
    repository = InMemoryAnalysisRepository()
    source = Fantasy5ScheduledSource()

    result = run_scheduled_worker(
        "天天樂",
        datetime(2026, 8, 28, 9, 33, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
    )

    assert result["status"] == "complete"
    assert repository.list_draws("天天樂", 1)[0]["drawDate"] == "2026-08-28"
    assert source.events == ["history-all", "latest"]


def test_fantasy5_stops_fetching_after_normalized_taipei_date_is_stored() -> None:
    repository = InMemoryAnalysisRepository()
    source = Fantasy5ScheduledSource()
    run_scheduled_worker(
        "天天樂",
        datetime(2026, 8, 28, 9, 33, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
    )
    source.events.clear()

    result = run_scheduled_worker(
        "天天樂",
        datetime(2026, 8, 28, 10, 3, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
    )

    assert result["status"] == "already-acquired"
    assert source.events == []


def test_scheduled_worker_catches_up_after_midnight_then_stops_after_store() -> None:
    repository = InMemoryAnalysisRepository()
    source = ScheduledSource()
    now = datetime(2026, 8, 29, 2, 17, tzinfo=TAIPEI)

    first = run_scheduled_worker(
        "今彩539", now, repository, source, _builders([]), allow_recovery_crawl=True,
    )
    second = run_scheduled_worker(
        "今彩539", now, repository, source, _builders([]), allow_recovery_crawl=True,
    )

    assert first["status"] == "complete"
    assert second["status"] == "already-acquired"
    assert second["drawPeriod"] == "000000221"
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
        datetime(2026, 8, 28, 20, 32, tzinfo=TAIPEI),
        repository,
        source,
        _builders([]),
    )

    assert result["status"] == "not-due"
    assert source.events == []


def test_cli_defaults_to_the_scheduled_worker(monkeypatch) -> None:
    settings = SimpleNamespace(supabase_url="https://example.test", supabase_secret_key="secret")
    repository = object()
    source = object()
    calls: list[tuple[str, None, object, object]] = []

    class Client:
        def __enter__(self):
            return object()

        def __exit__(self, *_: object) -> bool:
            return False

    monkeypatch.setattr(worker_module, "load_settings", lambda: settings)
    monkeypatch.setattr(worker_module, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(worker_module.httpx, "Client", lambda: Client())
    monkeypatch.setattr(worker_module, "LatestDrawSource", lambda _: source)
    monkeypatch.setattr(
        worker_module,
        "run_scheduled_worker",
        lambda lottery, now, actual_repository, actual_source: (
            calls.append((lottery, now, actual_repository, actual_source))
            or {"lottery": lottery, "status": "not-due"}
        ),
    )
    assert worker_module.main(["--lottery", "今彩539"]) == 0
    assert calls == [("今彩539", None, repository, source)]


def test_cli_rejects_the_removed_immediate_mode() -> None:
    with pytest.raises(SystemExit) as raised:
        worker_module.main(["--lottery", "今彩539", "--immediate"])

    assert raised.value.code == 2
