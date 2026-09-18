from __future__ import annotations

import json

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.recovery_server import handle_recovery_request


class OperationalRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.health_checks = 0
        self.status_rows = []

    def health_check(self) -> None:
        self.health_checks += 1

    def list_job_statuses(self) -> list[dict]:
        return list(self.status_rows)


def test_recovery_health_identifies_the_isolated_runtime(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_SERVICE_VERSION", "recovery-test")
    repository = OperationalRepository()

    status, payload = handle_recovery_request(
        "GET",
        "/health",
        None,
        repository,
    )

    assert status == 200
    assert repository.health_checks == 1
    assert payload == {
        "status": "ok",
        "service": "matrix-railway-recovery",
        "version": "recovery-test",
        "database": {"status": "ok"},
    }


def test_recovery_runtime_does_not_serve_public_matrix_routes() -> None:
    repository = OperationalRepository()

    status, payload = handle_recovery_request(
        "GET",
        "/api/matrix/latest/%E4%BB%8A%E5%BD%A9539",
        None,
        repository,
    )

    assert (status, payload) == (404, {"error": "NOT_FOUND"})


def test_recovery_runtime_preserves_protected_recovery_contract(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    calls: list[tuple[str, str]] = []
    repository = OperationalRepository()

    status, payload = handle_recovery_request(
        "POST",
        "/jobs/recover",
        json.dumps({
            "lottery": "今彩539",
            "leaseOwner": "invocation-1",
        }, ensure_ascii=False).encode("utf-8"),
        repository,
        request_monitor_token="expected-token",
        recover_lottery=lambda lottery, owner: calls.append((lottery, owner)) or "accepted",
    )

    assert (status, payload) == (
        202,
        {"lottery": "今彩539", "status": "accepted"},
    )
    assert calls == [("今彩539", "invocation-1")]


def test_recovery_runtime_rejects_non_job_post_routes_before_delegate(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    calls: list[tuple[str, str]] = []

    status, payload = handle_recovery_request(
        "POST",
        "/api/matrix/tongxing",
        b"{}",
        OperationalRepository(),
        request_monitor_token="expected-token",
        recover_lottery=lambda lottery, owner: calls.append((lottery, owner)) or "accepted",
    )

    assert (status, payload) == (404, {"error": "NOT_FOUND"})
    assert calls == []


def test_full_fantasy5_recovery_crawls_once_then_runs_analysis() -> None:
    from app.recovery_server import run_full_lottery_recovery

    events: list[object] = []

    run_full_lottery_recovery(
        "天天樂",
        fantasy5_crawler=lambda: events.append("crawl") or {
            "lottery": "天天樂",
            "drawPeriod": "12003",
            "status": "acquired",
        },
        downstream_recovery=lambda lottery: events.append(("analysis", lottery)),
    )

    assert events == ["crawl", ("analysis", "天天樂")]


def test_full_fantasy5_recovery_skips_analysis_while_source_is_not_acquired() -> None:
    from app.recovery_server import run_full_lottery_recovery

    events: list[object] = []

    run_full_lottery_recovery(
        "天天樂",
        fantasy5_crawler=lambda: events.append("crawl") or {
            "lottery": "天天樂",
            "drawPeriod": "12002",
            "status": "not-acquired",
        },
        downstream_recovery=lambda lottery: events.append(("analysis", lottery)),
    )

    assert events == ["crawl"]


def test_full_fantasy5_recovery_analyzes_when_draw_is_already_acquired() -> None:
    from app.recovery_server import run_full_lottery_recovery

    events: list[object] = []

    run_full_lottery_recovery(
        "天天樂",
        fantasy5_crawler=lambda: events.append("crawl") or {
            "lottery": "天天樂",
            "drawPeriod": "12003",
            "status": "already-acquired",
        },
        downstream_recovery=lambda lottery: events.append(("analysis", lottery)),
    )

    assert events == ["crawl", ("analysis", "天天樂")]


def test_full_non_fantasy5_recovery_does_not_call_fantasy5_crawler() -> None:
    from app.recovery_server import run_full_lottery_recovery

    events: list[object] = []

    run_full_lottery_recovery(
        "今彩539",
        fantasy5_crawler=lambda: (_ for _ in ()).throw(
            AssertionError("non-Fantasy5 recovery must not call Fantasy5 crawler")
        ),
        downstream_recovery=lambda lottery: events.append(("recover", lottery)),
    )

    assert events == [("recover", "今彩539")]


def test_full_fantasy5_recovery_rejects_unknown_crawler_status() -> None:
    import pytest
    from app.recovery_server import run_full_lottery_recovery

    with pytest.raises(RuntimeError, match="FANTASY5_RECOVERY_INVALID_STATUS"):
        run_full_lottery_recovery(
            "天天樂",
            fantasy5_crawler=lambda: {
                "lottery": "天天樂",
                "drawPeriod": "12003",
                "status": "unexpected",
            },
            downstream_recovery=lambda _lottery: (_ for _ in ()).throw(
                AssertionError("invalid crawler status must not run analysis")
            ),
        )
