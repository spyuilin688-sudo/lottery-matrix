from pathlib import Path
from types import SimpleNamespace

from app import worker_all


class _Repository:
    def __init__(self, status: str) -> None:
        self.status = status

    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict]:
        count = 5 if lottery == "今彩539" else 7
        return [{
            "lottery": lottery,
            "period": "115000225",
            "drawDate": "2026-09-16",
            "numbers": [str(value).zfill(2) for value in range(1, count + 1)],
            "resultStatus": self.status,
        }]


class _Client:
    def __enter__(self) -> object:
        return object()

    def __exit__(self, *_: object) -> bool:
        return False


def test_batch_worker_retries_formal_source_for_preliminary_draws(monkeypatch) -> None:
    settings = SimpleNamespace(supabase_url="https://example.test", supabase_secret_key="secret")
    repository = _Repository("preliminary")
    source = object()
    calls: list[tuple[str, dict]] = []

    monkeypatch.setattr(worker_all, "load_settings", lambda: settings)
    monkeypatch.setattr(worker_all, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(worker_all, "create_railway_ssl_context", lambda: object())
    monkeypatch.setattr(worker_all.httpx, "Client", lambda **_: _Client())
    monkeypatch.setattr(worker_all, "sync_marksix_calendar", lambda *_: {"status": "not-due"})
    monkeypatch.setattr(worker_all, "LatestDrawSource", lambda _: source)
    monkeypatch.setattr(worker_all, "wrap_source_with_tinyfish", lambda actual, *_args, **_kwargs: actual)
    monkeypatch.setattr(worker_all, "create_notification_emitter", lambda *_: None)
    monkeypatch.setattr(
        worker_all,
        "run_scheduled_worker",
        lambda lottery, now, actual_repository, actual_source, **kwargs: (
            calls.append((lottery, kwargs))
            or {"lottery": lottery, "status": "not-due"}
        ),
    )

    assert worker_all.main() == 0
    assert [lottery for lottery, _ in calls] == list(worker_all.LOTTERIES)
    assert all(kwargs.get("allow_recovery_crawl") is True for _, kwargs in calls)


def test_batch_worker_does_not_enable_recovery_for_confirmed_draws(monkeypatch) -> None:
    settings = SimpleNamespace(supabase_url="https://example.test", supabase_secret_key="secret")
    repository = _Repository("confirmed")
    source = object()
    calls: list[dict] = []

    monkeypatch.setattr(worker_all, "load_settings", lambda: settings)
    monkeypatch.setattr(worker_all, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(worker_all, "create_railway_ssl_context", lambda: object())
    monkeypatch.setattr(worker_all.httpx, "Client", lambda **_: _Client())
    monkeypatch.setattr(worker_all, "sync_marksix_calendar", lambda *_: {"status": "not-due"})
    monkeypatch.setattr(worker_all, "LatestDrawSource", lambda _: source)
    monkeypatch.setattr(worker_all, "wrap_source_with_tinyfish", lambda actual, *_args, **_kwargs: actual)
    monkeypatch.setattr(worker_all, "create_notification_emitter", lambda *_: None)
    monkeypatch.setattr(
        worker_all,
        "run_scheduled_worker",
        lambda lottery, now, actual_repository, actual_source, **kwargs: (
            calls.append(kwargs)
            or {"lottery": lottery, "status": "not-due"}
        ),
    )

    assert worker_all.main() == 0
    assert all(kwargs.get("allow_recovery_crawl") is not True for kwargs in calls)


def test_fantasy5_workflow_is_manual_backup_and_keeps_source_retry() -> None:
    workflow = (
        Path(__file__).resolve().parents[3]
        / ".github"
        / "workflows"
        / "fantasy5-crawler.yml"
    ).read_text(encoding="utf-8")

    assert "workflow_dispatch:" in workflow
    assert "schedule:" not in workflow
    assert 'cron: "33 1 * 3-11 *"' not in workflow
    assert 'cron: "33 2 * 11,12,1-3 *"' not in workflow
    assert "not-acquired" in workflow
    assert "sleep 600" in workflow
    assert "FANTASY5_MAX_ATTEMPTS" in workflow
