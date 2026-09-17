from contextlib import nullcontext
from types import SimpleNamespace

from app import analysis_worker, worker_all


def test_batch_worker_recomputes_only_after_new_analysis(monkeypatch) -> None:
    settings = SimpleNamespace(
        supabase_url="https://example.test",
        supabase_secret_key="service-secret",
    )
    repository = object()
    source = object()
    recomputed: list[tuple[str, str, str]] = []

    class Client:
        def __enter__(self):
            return self

        def __exit__(self, *_: object) -> bool:
            return False

    monkeypatch.setattr(worker_all, "load_settings", lambda: settings)
    monkeypatch.setattr(worker_all, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(worker_all, "create_railway_ssl_context", lambda: object())
    monkeypatch.setattr(worker_all.httpx, "Client", lambda **_: Client())
    monkeypatch.setattr(worker_all, "sync_marksix_calendar", lambda *_: {"status": "not-due"})
    monkeypatch.setattr(worker_all, "LatestDrawSource", lambda _: source)
    monkeypatch.setattr(worker_all, "wrap_source_with_tinyfish", lambda value, *_args, **_kwargs: value)
    monkeypatch.setattr(worker_all, "create_notification_emitter", lambda *_: None)
    monkeypatch.setattr(worker_all, "_needs_formal_source_retry", lambda *_: False)
    monkeypatch.setattr(
        worker_all,
        "run_scheduled_worker",
        lambda lottery, *_args, **_kwargs: {
            "lottery": lottery,
            "drawPeriod": f"period-{lottery}",
            "status": "complete",
        },
    )
    monkeypatch.setattr(
        worker_all,
        "recompute_custom_matrix_status",
        lambda _client, url, key, lottery: recomputed.append((url, key, lottery)) or {
            "lottery": lottery,
            "updated": 1,
        },
    )

    assert worker_all.main() == 0
    assert recomputed == [
        ("https://example.test", "service-secret", "今彩539"),
        ("https://example.test", "service-secret", "六合彩"),
        ("https://example.test", "service-secret", "大樂透"),
    ]


def test_batch_worker_does_not_recompute_already_analyzed_draws(monkeypatch) -> None:
    settings = SimpleNamespace(
        supabase_url="https://example.test",
        supabase_secret_key="service-secret",
    )
    repository = object()
    source = object()
    recomputed: list[str] = []

    class Client:
        def __enter__(self):
            return self

        def __exit__(self, *_: object) -> bool:
            return False

    monkeypatch.setattr(worker_all, "load_settings", lambda: settings)
    monkeypatch.setattr(worker_all, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(worker_all, "create_railway_ssl_context", lambda: object())
    monkeypatch.setattr(worker_all.httpx, "Client", lambda **_: Client())
    monkeypatch.setattr(worker_all, "sync_marksix_calendar", lambda *_: {"status": "not-due"})
    monkeypatch.setattr(worker_all, "LatestDrawSource", lambda _: source)
    monkeypatch.setattr(worker_all, "wrap_source_with_tinyfish", lambda value, *_args, **_kwargs: value)
    monkeypatch.setattr(worker_all, "create_notification_emitter", lambda *_: None)
    monkeypatch.setattr(worker_all, "_needs_formal_source_retry", lambda *_: False)
    monkeypatch.setattr(
        worker_all,
        "run_scheduled_worker",
        lambda lottery, *_args, **_kwargs: {
            "lottery": lottery,
            "drawPeriod": f"period-{lottery}",
            "status": "complete",
            "skipped": True,
        },
    )
    monkeypatch.setattr(
        worker_all,
        "recompute_custom_matrix_status",
        lambda _client, _url, _key, lottery: recomputed.append(lottery),
    )

    assert worker_all.main() == 0
    assert recomputed == []


def fantasy_repository(latest_period: str):
    return SimpleNamespace(list_draws=lambda _lottery, _limit: [{"period": latest_period}])


def test_fantasy5_cli_recomputes_only_after_complete_latest_analysis(monkeypatch) -> None:
    settings = SimpleNamespace(
        supabase_url="https://example.test",
        supabase_secret_key="service-secret",
    )
    repository = fantasy_repository("11999")
    recomputed: list[tuple[str, str, str]] = []

    monkeypatch.setattr(analysis_worker, "load_settings", lambda: settings)
    monkeypatch.setattr(analysis_worker, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(analysis_worker, "notification_emitter_context", lambda _settings: nullcontext(None))
    monkeypatch.setattr(
        analysis_worker,
        "run_analysis_only_worker",
        lambda lottery, actual_repository: {
            "lottery": lottery,
            "drawPeriod": "11999",
            "status": "complete",
        },
    )
    monkeypatch.setattr(
        analysis_worker,
        "recompute_custom_matrix_status_once",
        lambda url, key, lottery: recomputed.append((url, key, lottery)) or {
            "lottery": lottery,
            "updated": 1,
        },
    )

    assert analysis_worker.main(["--lottery", "天天樂"]) == 0
    assert recomputed == [("https://example.test", "service-secret", "天天樂")]


def test_fantasy5_cli_does_not_recompute_completed_historical_gap(monkeypatch) -> None:
    settings = SimpleNamespace(
        supabase_url="https://example.test",
        supabase_secret_key="service-secret",
    )
    repository = fantasy_repository("12000")
    recomputed: list[str] = []

    monkeypatch.setattr(analysis_worker, "load_settings", lambda: settings)
    monkeypatch.setattr(analysis_worker, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(analysis_worker, "notification_emitter_context", lambda _settings: nullcontext(None))
    monkeypatch.setattr(
        analysis_worker,
        "run_analysis_only_worker",
        lambda lottery, actual_repository: {
            "lottery": lottery,
            "drawPeriod": "11999",
            "status": "complete",
        },
    )
    monkeypatch.setattr(
        analysis_worker,
        "recompute_custom_matrix_status_once",
        lambda _url, _key, lottery: recomputed.append(lottery),
    )

    assert analysis_worker.main(["--lottery", "天天樂"]) == 0
    assert recomputed == []


def test_fantasy5_cli_does_not_recompute_already_analyzed_draw(monkeypatch) -> None:
    settings = SimpleNamespace(
        supabase_url="https://example.test",
        supabase_secret_key="service-secret",
    )
    repository = fantasy_repository("11999")
    recomputed: list[str] = []

    monkeypatch.setattr(analysis_worker, "load_settings", lambda: settings)
    monkeypatch.setattr(analysis_worker, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(analysis_worker, "notification_emitter_context", lambda _settings: nullcontext(None))
    monkeypatch.setattr(
        analysis_worker,
        "run_analysis_only_worker",
        lambda lottery, actual_repository: {
            "lottery": lottery,
            "drawPeriod": "11999",
            "status": "already-analyzed",
        },
    )
    monkeypatch.setattr(
        analysis_worker,
        "recompute_custom_matrix_status_once",
        lambda _url, _key, lottery: recomputed.append(lottery),
    )

    assert analysis_worker.main(["--lottery", "天天樂"]) == 0
    assert recomputed == []
