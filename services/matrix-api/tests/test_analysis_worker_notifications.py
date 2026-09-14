from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from app import analysis_worker
from app.analysis_worker import run_analysis_only_worker
from app.repositories.analysis_repository import ARTIFACT_KINDS, InMemoryAnalysisRepository
from app.services.notification_events import (
    NotificationConfigurationError,
    NotificationDeliveryError,
)
from app.worker import ANALYSIS_VERSION


LOTTERY = "天天樂"
PERIOD = "11988"
VERSION = f"{PERIOD}:{ANALYSIS_VERSION}-sorted"
RESULT_KEY = f"lottery_result:fantasy5:{PERIOD}"
CARD_KEY = f"matrix_card:fantasy5:{PERIOD}"
STATUS_KEY = f"matrix_status:fantasy5:{PERIOD}"


def _draw(period: int, offset: int) -> dict:
    draw_date = (datetime(2026, 9, 2) - timedelta(days=offset)).date().isoformat()
    return {
        "lottery": LOTTERY,
        "period": str(period),
        "drawDate": draw_date,
        "numbers": ["03", "06", "23", "29", "35"],
        "sortedNumbers": ["03", "06", "23", "29", "35"],
        "drawOrderNumbers": None,
    }


def _repository(history_count: int = 227) -> InMemoryAnalysisRepository:
    repository = InMemoryAnalysisRepository()
    for offset in range(history_count):
        repository.upsert_draw(_draw(11988 - offset, offset))
    return repository


def _builders(status: str = "ACTIVE") -> dict:
    return {
        "explore": lambda _: {"items": [], "validationById": {}},
        "tianheng": lambda _: {"items": [], "validationById": {}},
        "tianyan": lambda _: {"items": []},
        "tiangong": lambda _: {"items": []},
        "status": lambda _: {"summary": {"status": status}},
    }


def _complete_analysis(repository: InMemoryAnalysisRepository, status: str = "ACTIVE") -> None:
    repository.begin_run(LOTTERY, PERIOD, VERSION, "2026-09-04T01:00:00+00:00")
    repository.save_artifact(LOTTERY, PERIOD, VERSION, "explore", {"items": []})
    repository.save_artifact(
        LOTTERY,
        PERIOD,
        VERSION,
        "tianheng",
        {"items": [], "validationById": {}},
    )
    repository.save_artifact(LOTTERY, PERIOD, VERSION, "tianyan", {"items": []})
    repository.save_artifact(LOTTERY, PERIOD, VERSION, "tiangong", {"items": []})
    repository.save_artifact(
        LOTTERY,
        PERIOD,
        VERSION,
        "status",
        {"summary": {"status": status}},
    )
    repository.complete_run(
        LOTTERY,
        PERIOD,
        VERSION,
        "2026-09-04T01:10:00+00:00",
    )


class RecordingEmitter:
    enabled = True

    def __init__(
        self,
        *,
        fail_delivery: dict[str, int] | None = None,
        fail_configuration: set[str] | None = None,
    ) -> None:
        self.fail_delivery = dict(fail_delivery or {})
        self.fail_configuration = set(fail_configuration or set())
        self.attempts: list[str] = []
        self.successful: list[str] = []

    def emit(self, event: dict) -> dict:
        key = event["eventKey"]
        self.attempts.append(key)
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


def test_analysis_only_worker_waits_for_card_publication_despite_complete_history() -> None:
    repository = _repository()
    emitter = RecordingEmitter()

    result = run_analysis_only_worker(
        LOTTERY,
        repository,
        _builders(),
        notification_emitter=emitter,
    )

    assert result["status"] == "complete"
    assert emitter.successful == [RESULT_KEY, STATUS_KEY]


def test_analysis_only_worker_dormant_status_has_no_status_event() -> None:
    repository = _repository()
    emitter = RecordingEmitter()

    result = run_analysis_only_worker(
        LOTTERY,
        repository,
        _builders("DORMANT"),
        notification_emitter=emitter,
    )

    assert result["status"] == "complete"
    assert emitter.successful == [RESULT_KEY]
    assert not any(key.startswith("matrix_status:") for key in emitter.attempts)


def test_analysis_only_worker_card_waits_for_required_history() -> None:
    repository = _repository(history_count=80)
    emitter = RecordingEmitter()

    result = run_analysis_only_worker(
        LOTTERY,
        repository,
        _builders(),
        notification_emitter=emitter,
    )

    assert result["status"] == "complete"
    assert RESULT_KEY in emitter.successful
    assert STATUS_KEY in emitter.successful
    assert CARD_KEY not in emitter.attempts


def test_analysis_only_worker_reemits_stable_keys_for_completed_period() -> None:
    repository = _repository()
    _complete_analysis(repository)
    emitter = RecordingEmitter()

    result = run_analysis_only_worker(
        LOTTERY,
        repository,
        _builders(),
        notification_emitter=emitter,
    )

    assert result["status"] == "already-analyzed"
    assert emitter.successful == [RESULT_KEY, STATUS_KEY]


def test_already_analyzed_path_does_not_load_complete_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = _repository()
    _complete_analysis(repository)
    original_list_draws = repository.list_draws

    def reject_complete_history(lottery: str, limit: int | None = None) -> list[dict]:
        if limit is None:
            raise AssertionError("already-analyzed must not load complete history")
        return original_list_draws(lottery, limit)

    monkeypatch.setattr(repository, "list_draws", reject_complete_history)

    result = run_analysis_only_worker(
        LOTTERY,
        repository,
        _builders(),
        notification_emitter=RecordingEmitter(),
    )

    assert result["status"] == "already-analyzed"


def test_analysis_only_worker_early_transient_failure_does_not_block_analysis() -> None:
    repository = _repository(history_count=80)
    emitter = RecordingEmitter(fail_delivery={RESULT_KEY: 1})

    result = run_analysis_only_worker(
        LOTTERY,
        repository,
        _builders(),
        notification_emitter=emitter,
    )

    assert result["status"] == "complete"
    assert emitter.attempts.count(RESULT_KEY) == 2
    assert RESULT_KEY in emitter.successful
    assert STATUS_KEY in emitter.successful


def test_analysis_only_worker_persistent_delivery_failure_retries_via_railway() -> None:
    repository = _repository(history_count=80)
    emitter = RecordingEmitter(fail_delivery={RESULT_KEY: 10})

    with pytest.raises(NotificationDeliveryError, match="test delivery failure"):
        run_analysis_only_worker(
            LOTTERY,
            repository,
            _builders(),
            notification_emitter=emitter,
        )

    assert emitter.attempts.count(RESULT_KEY) == 3
    assert repository.get_progress(LOTTERY, PERIOD, VERSION)["status"] == "complete"


def test_analysis_only_worker_configuration_failure_is_not_swallowed() -> None:
    repository = _repository(history_count=80)
    emitter = RecordingEmitter(fail_configuration={RESULT_KEY})

    with pytest.raises(NotificationConfigurationError, match="test configuration failure"):
        run_analysis_only_worker(
            LOTTERY,
            repository,
            _builders(),
            notification_emitter=emitter,
        )

    assert repository.get_progress(LOTTERY, PERIOD, VERSION) is None


def test_disabled_notifications_preserve_analysis_only_behavior() -> None:
    repository = _repository(history_count=80)

    result = run_analysis_only_worker(
        LOTTERY,
        repository,
        _builders(),
        notification_emitter=DisabledEmitter(),
    )

    assert result["status"] == "complete"
    assert repository.get_progress(LOTTERY, PERIOD, VERSION)["status"] == "complete"


def test_analysis_worker_cli_passes_emitter_when_fully_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = _repository(history_count=80)
    emitter = RecordingEmitter()
    captured: list[tuple[str, object, object | None]] = []

    class EmitterContext:
        def __enter__(self) -> RecordingEmitter:
            return emitter

        def __exit__(self, *_: object) -> bool:
            return False

    monkeypatch.setattr(
        analysis_worker,
        "load_settings",
        lambda: SimpleNamespace(
            supabase_url="https://example.test",
            supabase_secret_key="secret",
            notification_ingest_url="https://example.test/functions/v1/notification-ingest",
            notification_ingest_token="ingest-token",
        ),
    )
    monkeypatch.setattr(analysis_worker, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(
        analysis_worker,
        "notification_emitter_context",
        lambda _settings: EmitterContext(),
        raising=False,
    )

    def fake_run(lottery: str, actual_repository: object, **kwargs: object) -> dict:
        captured.append((lottery, actual_repository, kwargs.get("notification_emitter")))
        return {"lottery": lottery, "drawPeriod": PERIOD, "status": "already-analyzed"}

    monkeypatch.setattr(analysis_worker, "run_analysis_only_worker", fake_run)

    assert analysis_worker.main(["--lottery", LOTTERY]) == 0
    assert captured == [(LOTTERY, repository, emitter)]


def test_analysis_worker_cli_rejects_partial_notification_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = _repository(history_count=80)
    calls: list[str] = []
    monkeypatch.setattr(
        analysis_worker,
        "load_settings",
        lambda: SimpleNamespace(
            supabase_url="https://example.test",
            supabase_secret_key="secret",
            notification_ingest_url="https://example.test/functions/v1/notification-ingest",
            notification_ingest_token="",
        ),
    )
    monkeypatch.setattr(analysis_worker, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(
        analysis_worker,
        "run_analysis_only_worker",
        lambda *_args, **_kwargs: calls.append("called") or {},
    )

    with pytest.raises(
        NotificationConfigurationError,
        match="NOTIFICATION_INGEST_CONFIGURATION_INCOMPLETE",
    ):
        analysis_worker.main(["--lottery", LOTTERY])
    assert calls == []


def test_analysis_worker_source_boundary_still_has_no_http_client_symbols() -> None:
    from pathlib import Path

    source = Path(__file__).resolve().parents[1] / "app" / "analysis_worker.py"
    text = source.read_text(encoding="utf-8")

    assert "httpx" not in text
    assert "LatestDrawSource" not in text
    assert "DrawRefreshService" not in text
