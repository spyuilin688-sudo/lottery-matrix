from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app import worker as worker_module
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.notification_events import (
    NotificationConfigurationError,
    NotificationDeliveryError,
)
from app.worker import ANALYSIS_VERSION, run_scheduled_worker


TAIPEI = ZoneInfo("Asia/Taipei")
LOTTERY = "今彩539"
PERIOD = "000001001"
VERSION = f"{PERIOD}:{ANALYSIS_VERSION}"
RESULT_KEY = f"lottery_result:539:{PERIOD}"
CARD_KEY = f"matrix_card:539:{PERIOD}"
STATUS_KEY = f"matrix_status:539:{PERIOD}:ACTIVE"


class NotificationSource:
    def __init__(self, history_count: int = 226) -> None:
        self.history_count = history_count
        self.events: list[str] = []

    @staticmethod
    def _draw(period: int, draw_date: datetime) -> dict:
        return {
            "period": str(period).zfill(9),
            "drawDate": draw_date.date().isoformat(),
            "numbers": ["01", "02", "03", "04", "05"],
        }

    def fetch(self, lottery: str) -> dict:
        assert lottery == LOTTERY
        self.events.append("latest")
        return self._draw(1001, datetime(2026, 8, 28))

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        assert lottery == LOTTERY
        self.events.append("history-all" if limit is None else f"history-{limit}")
        rows = [
            self._draw(1000 - offset, datetime(2026, 8, 27) - timedelta(days=offset))
            for offset in range(self.history_count)
        ]
        return rows if limit is None else rows[:limit]


def _builders(status: str = "ACTIVE", *, fail_status: bool = False) -> dict:
    def build_status(_: dict) -> dict:
        if fail_status:
            raise RuntimeError("status failed")
        return {"summary": {"status": status}}

    return {
        "explore": lambda _: {"items": [], "validationById": {}},
        "tianyan": lambda _: {"items": []},
        "tiangong": lambda _: {"items": []},
        "status": build_status,
    }


def _due_time() -> datetime:
    return datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI)


class RecordingEmitter:
    enabled = True

    def __init__(
        self,
        repository: InMemoryAnalysisRepository | None = None,
        *,
        fail_delivery: dict[str, int] | None = None,
        fail_configuration: set[str] | None = None,
    ) -> None:
        self.repository = repository
        self.fail_delivery = dict(fail_delivery or {})
        self.fail_configuration = set(fail_configuration or set())
        self.attempts: list[str] = []
        self.successful: list[str] = []
        self.status_progress: list[str | None] = []

    def emit(self, event: dict) -> dict:
        key = event["eventKey"]
        self.attempts.append(key)
        if event["eventType"] == "matrix_status" and self.repository is not None:
            progress = self.repository.get_progress(LOTTERY, PERIOD, VERSION)
            self.status_progress.append(None if progress is None else progress.get("status"))
        if key in self.fail_configuration:
            raise NotificationConfigurationError("test configuration failure")
        remaining = self.fail_delivery.get(key, 0)
        if remaining > 0:
            self.fail_delivery[key] = remaining - 1
            raise NotificationDeliveryError("test delivery failure")
        self.successful.append(key)
        return {"created": True, "eventKey": key}


class DisabledEmitter:
    enabled = False

    def emit(self, event: dict) -> dict:
        raise AssertionError(f"disabled emitter must not emit {event['eventKey']}")


def run_worker(
    repository: InMemoryAnalysisRepository,
    source: NotificationSource,
    emitter: object | None,
    *,
    status: str = "ACTIVE",
) -> dict:
    return run_scheduled_worker(
        LOTTERY,
        _due_time(),
        repository,
        source,
        _builders(status),
        notification_emitter=emitter,
    )


def test_new_draw_emits_result_card_and_status_after_complete() -> None:
    repository = InMemoryAnalysisRepository()
    emitter = RecordingEmitter(repository)

    result = run_worker(repository, NotificationSource(history_count=226), emitter)

    assert result["status"] == "complete"
    assert emitter.successful == [RESULT_KEY, CARD_KEY, STATUS_KEY]
    assert emitter.status_progress == ["complete"]


def test_dormant_status_emits_result_and_card_without_status_event() -> None:
    repository = InMemoryAnalysisRepository()
    emitter = RecordingEmitter(repository)

    result = run_worker(
        repository,
        NotificationSource(history_count=226),
        emitter,
        status="DORMANT",
    )

    assert result["status"] == "complete"
    assert emitter.successful == [RESULT_KEY, CARD_KEY]
    assert not any(key.startswith("matrix_status:") for key in emitter.attempts)


def test_card_event_waits_for_required_history_rows() -> None:
    repository = InMemoryAnalysisRepository()
    emitter = RecordingEmitter(repository)

    result = run_worker(repository, NotificationSource(history_count=120), emitter)

    assert result["status"] == "complete"
    assert RESULT_KEY in emitter.successful
    assert STATUS_KEY in emitter.successful
    assert CARD_KEY not in emitter.attempts


def test_partial_analysis_never_emits_status(monkeypatch: pytest.MonkeyPatch) -> None:
    repository = InMemoryAnalysisRepository()
    emitter = RecordingEmitter(repository)
    builders = _builders()

    def partial_explore(context: dict) -> dict:
        start = int(context["exploreBatch"]["start"])
        return {
            "artifact": {"items": [], "validationById": {}},
            "_checkpoint": {
                "cursorStart": start,
                "cursor": start + 1,
                "total": 2,
                "complete": False,
            },
        }

    builders["explore"] = partial_explore
    monkeypatch.setattr(worker_module, "MAX_CYCLES_PER_INVOCATION", 1)

    result = run_scheduled_worker(
        LOTTERY,
        _due_time(),
        repository,
        NotificationSource(history_count=120),
        builders,
        notification_emitter=emitter,
    )

    assert result["status"] == "running"
    assert RESULT_KEY in emitter.successful
    assert not any(key.startswith("matrix_status:") for key in emitter.attempts)


def test_failed_analysis_never_emits_status() -> None:
    repository = InMemoryAnalysisRepository()
    emitter = RecordingEmitter(repository)

    with pytest.raises(RuntimeError, match="status failed"):
        run_scheduled_worker(
            LOTTERY,
            _due_time(),
            repository,
            NotificationSource(history_count=120),
            _builders(fail_status=True),
            notification_emitter=emitter,
        )

    assert RESULT_KEY in emitter.successful
    assert not any(key.startswith("matrix_status:") for key in emitter.attempts)


def test_completed_period_reemits_the_same_stable_keys_on_later_invocation() -> None:
    repository = InMemoryAnalysisRepository()
    source = NotificationSource(history_count=226)
    emitter = RecordingEmitter(repository)

    first = run_worker(repository, source, emitter)
    second = run_worker(repository, source, emitter)

    assert first["status"] == "complete"
    assert second["status"] == "already-acquired"
    assert emitter.successful.count(RESULT_KEY) == 2
    assert emitter.successful.count(CARD_KEY) == 2
    assert emitter.successful.count(STATUS_KEY) == 2


def test_disabled_notification_integration_preserves_worker_behavior() -> None:
    repository = InMemoryAnalysisRepository()

    result = run_worker(repository, NotificationSource(history_count=226), DisabledEmitter())

    assert result["status"] == "complete"
    assert repository.get_progress(LOTTERY, PERIOD, VERSION)["status"] == "complete"


def test_early_transient_failure_does_not_block_analysis_and_final_retry_succeeds() -> None:
    repository = InMemoryAnalysisRepository()
    emitter = RecordingEmitter(repository, fail_delivery={RESULT_KEY: 1})

    result = run_worker(repository, NotificationSource(history_count=120), emitter)

    assert result["status"] == "complete"
    assert emitter.attempts.count(RESULT_KEY) == 2
    assert RESULT_KEY in emitter.successful
    assert STATUS_KEY in emitter.successful


def test_persistent_delivery_failure_raises_after_analysis_is_complete() -> None:
    repository = InMemoryAnalysisRepository()
    emitter = RecordingEmitter(repository, fail_delivery={RESULT_KEY: 10})

    with pytest.raises(NotificationDeliveryError, match="test delivery failure"):
        run_worker(repository, NotificationSource(history_count=120), emitter)

    assert emitter.attempts.count(RESULT_KEY) == 2
    assert repository.get_progress(LOTTERY, PERIOD, VERSION)["status"] == "complete"


def test_early_configuration_failure_is_not_swallowed() -> None:
    repository = InMemoryAnalysisRepository()
    emitter = RecordingEmitter(repository, fail_configuration={RESULT_KEY})

    with pytest.raises(NotificationConfigurationError, match="test configuration failure"):
        run_worker(repository, NotificationSource(history_count=120), emitter)

    assert repository.get_progress(LOTTERY, PERIOD, VERSION) is None
