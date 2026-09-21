from __future__ import annotations

import json
from datetime import date
from threading import Event

from app.primary_worker import PrimaryCoordinator
from app.recovery_server import handle_recovery_request
from app.repositories.analysis_repository import InMemoryAnalysisRepository


def test_primary_coordinator_deduplicates_a_running_group() -> None:
    entered = Event()
    release = Event()
    calls: list[tuple[str, date, tuple[str, ...]]] = []

    def run(group: str, cycle_date: date, lotteries: tuple[str, ...]) -> None:
        calls.append((group, cycle_date, lotteries))
        entered.set()
        release.wait(1)

    coordinator = PrimaryCoordinator(run)
    assert coordinator.enqueue("evening", date(2026, 9, 21), ("今彩539",)) == "accepted"
    assert entered.wait(1)
    assert coordinator.enqueue("evening", date(2026, 9, 21), ("今彩539",)) == "already-running"
    release.set()
    assert coordinator.wait("evening", 1)
    assert calls == [("evening", date(2026, 9, 21), ("今彩539",))]


def test_primary_job_is_authenticated_and_validated(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    calls: list[tuple[str, date, tuple[str, ...]]] = []
    body = json.dumps({
        "group": "evening",
        "cycleDate": "2026-09-21",
        "lotteries": ["今彩539", "六合彩"],
    }, ensure_ascii=False).encode()

    status, payload = handle_recovery_request(
        "POST",
        "/jobs/primary",
        body,
        InMemoryAnalysisRepository(),
        request_monitor_token="expected-token",
        run_primary=lambda group, cycle, lotteries: calls.append(
            (group, cycle, lotteries)
        ) or "accepted",
    )

    assert (status, payload) == (202, {"group": "evening", "status": "accepted"})
    assert calls == [("evening", date(2026, 9, 21), ("今彩539", "六合彩"))]


def test_primary_job_rejects_group_lottery_mismatch(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    status, payload = handle_recovery_request(
        "POST",
        "/jobs/primary",
        json.dumps({
            "group": "fantasy5",
            "cycleDate": "2026-09-21",
            "lotteries": ["今彩539"],
        }, ensure_ascii=False).encode(),
        InMemoryAnalysisRepository(),
        request_monitor_token="expected-token",
        run_primary=lambda *_: "accepted",
    )
    assert (status, payload) == (400, {"error": "PRIMARY_LOTTERIES_INVALID"})


def test_primary_job_requires_worker_token(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    status, payload = handle_recovery_request(
        "POST",
        "/jobs/primary",
        b'{}',
        InMemoryAnalysisRepository(),
        request_monitor_token="wrong-token",
        run_primary=lambda *_: "accepted",
    )
    assert (status, payload) == (403, {"error": "FORBIDDEN"})
