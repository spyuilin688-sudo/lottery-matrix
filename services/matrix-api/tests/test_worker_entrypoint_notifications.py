from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import worker, worker_all
from app.services.notification_events import (
    NotificationConfigurationError,
    NotificationEventEmitter,
)


class ClientContext:
    def __init__(self) -> None:
        self.client = object()

    def __enter__(self) -> object:
        return self.client

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


def _settings(url: str = "", token: str = "") -> SimpleNamespace:
    return SimpleNamespace(
        supabase_url="https://supabase.invalid",
        supabase_secret_key="service-key",
        notification_ingest_url=url,
        notification_ingest_token=token,
    )


def _stub_shared_dependencies(monkeypatch: pytest.MonkeyPatch, module: object) -> tuple[object, object]:
    repository = object()
    source = object()
    monkeypatch.setattr(module, "create_supabase_repository", lambda url, key: repository)
    monkeypatch.setattr(module.httpx, "Client", lambda *args, **kwargs: ClientContext())
    monkeypatch.setattr(module, "LatestDrawSource", lambda client: source)
    return repository, source


def test_single_worker_passes_enabled_emitter_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    repository, source = _stub_shared_dependencies(monkeypatch, worker)
    monkeypatch.setattr(
        worker,
        "load_settings",
        lambda: _settings("https://example.invalid/functions/v1/notification-ingest", "token"),
    )
    captured: dict = {}

    def run_one(lottery, now, actual_repository, actual_source, *, notification_emitter):
        captured.update(
            lottery=lottery,
            repository=actual_repository,
            source=actual_source,
            emitter=notification_emitter,
        )
        return {"lottery": lottery, "status": "not-due"}

    monkeypatch.setattr(worker, "run_scheduled_worker", run_one)

    assert worker.main(["--lottery", "今彩539", "--scheduled"]) == 0
    assert captured["lottery"] == "今彩539"
    assert captured["repository"] is repository
    assert captured["source"] is source
    assert isinstance(captured["emitter"], NotificationEventEmitter)
    assert captured["emitter"].enabled is True


def test_single_worker_omits_emitter_argument_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_shared_dependencies(monkeypatch, worker)
    monkeypatch.setattr(worker, "load_settings", lambda: _settings())
    calls: list[str] = []

    def legacy_run(lottery, now, repository, source):
        calls.append(lottery)
        return {"lottery": lottery, "status": "not-due"}

    monkeypatch.setattr(worker, "run_scheduled_worker", legacy_run)

    assert worker.main(["--lottery", "今彩539", "--scheduled"]) == 0
    assert calls == ["今彩539"]


def test_single_worker_rejects_partial_notification_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_shared_dependencies(monkeypatch, worker)
    monkeypatch.setattr(
        worker,
        "load_settings",
        lambda: _settings("https://example.invalid/functions/v1/notification-ingest", ""),
    )
    monkeypatch.setattr(
        worker,
        "run_scheduled_worker",
        lambda *args, **kwargs: pytest.fail("worker must not run with partial notification config"),
    )

    with pytest.raises(NotificationConfigurationError):
        worker.main(["--lottery", "今彩539", "--scheduled"])


def test_worker_all_reuses_one_enabled_emitter_for_all_lotteries(monkeypatch: pytest.MonkeyPatch) -> None:
    repository, source = _stub_shared_dependencies(monkeypatch, worker_all)
    monkeypatch.setattr(worker_all, "create_railway_ssl_context", lambda: object())
    monkeypatch.setattr(
        worker_all,
        "load_settings",
        lambda: _settings("https://example.invalid/functions/v1/notification-ingest", "token"),
    )
    calls: list[tuple[str, object]] = []

    def run_one(lottery, now, actual_repository, actual_source, *, notification_emitter):
        assert actual_repository is repository
        assert actual_source is source
        calls.append((lottery, notification_emitter))
        return {"lottery": lottery, "status": "not-due"}

    monkeypatch.setattr(worker_all, "run_scheduled_worker", run_one)

    assert worker_all.main() == 0
    assert [lottery for lottery, _ in calls] == list(worker_all.LOTTERIES)
    emitters = [emitter for _, emitter in calls]
    assert len({id(emitter) for emitter in emitters}) == 1
    assert isinstance(emitters[0], NotificationEventEmitter)
    assert emitters[0].enabled is True


def test_worker_all_omits_emitter_argument_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_shared_dependencies(monkeypatch, worker_all)
    monkeypatch.setattr(worker_all, "create_railway_ssl_context", lambda: object())
    monkeypatch.setattr(worker_all, "load_settings", lambda: _settings())
    calls: list[str] = []

    def legacy_run(lottery, now, repository, source):
        calls.append(lottery)
        return {"lottery": lottery, "status": "not-due"}

    monkeypatch.setattr(worker_all, "run_scheduled_worker", legacy_run)

    assert worker_all.main() == 0
    assert calls == list(worker_all.LOTTERIES)


def test_worker_all_rejects_partial_notification_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_shared_dependencies(monkeypatch, worker_all)
    monkeypatch.setattr(worker_all, "create_railway_ssl_context", lambda: object())
    monkeypatch.setattr(worker_all, "load_settings", lambda: _settings("", "token"))
    monkeypatch.setattr(
        worker_all,
        "run_scheduled_worker",
        lambda *args, **kwargs: pytest.fail("batch worker must not run with partial notification config"),
    )

    with pytest.raises(NotificationConfigurationError):
        worker_all.main()

@pytest.mark.parametrize('module,args', [(worker_all, None), (worker, ['--lottery','六合彩','--scheduled'])])
def test_official_calendar_sync_precedes_the_worker_even_when_no_draw_is_due(monkeypatch, module, args):
    repository, source = _stub_shared_dependencies(monkeypatch, module)
    monkeypatch.setattr(module, 'load_settings', lambda: _settings())
    if module is worker_all:
        monkeypatch.setattr(module, 'create_railway_ssl_context', lambda: object())
    calls = []
    def sync(actual_repository, client):
        assert actual_repository is repository
        calls.append('calendar')
        return {'status':'unavailable'}
    monkeypatch.setattr(module, 'sync_marksix_calendar', sync, raising=False)
    monkeypatch.setattr(module, 'run_scheduled_worker', lambda lottery, *_: calls.append(lottery) or {'lottery':lottery,'status':'not-due'})
    assert (module.main() if args is None else module.main(args)) == 0
    assert calls[0] == 'calendar'
    assert '六合彩' in calls[1:]
