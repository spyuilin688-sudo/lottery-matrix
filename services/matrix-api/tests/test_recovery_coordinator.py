from __future__ import annotations

from threading import Event, enumerate as active_threads
from time import sleep

from app.recovery import RecoveryCoordinator


def test_recovery_coordinator_deduplicates_a_running_lottery() -> None:
    started = Event()
    release = Event()
    calls: list[str] = []

    def runner(lottery: str) -> None:
        calls.append(lottery)
        started.set()
        release.wait(1)

    coordinator = RecoveryCoordinator(runner)

    assert coordinator.enqueue("天天樂") == "accepted"
    assert started.wait(1)
    worker_thread = next(
        thread for thread in active_threads()
        if thread.name == 'matrix-recovery-天天樂'
    )
    assert worker_thread.daemon is False
    assert coordinator.enqueue("天天樂") == "already-running"
    release.set()
    for _ in range(100):
        if not coordinator.is_running("天天樂"):
            break
        sleep(0.01)

    assert coordinator.is_running("天天樂") is False
    assert calls == ["天天樂"]


def test_recovery_coordinator_renews_and_releases_a_durable_lease() -> None:
    started = Event()
    renewed = Event()
    release_worker = Event()
    renewals: list[tuple[str, str]] = []
    releases: list[tuple[str, str]] = []

    def runner(_lottery: str) -> None:
        started.set()
        release_worker.wait(1)

    def renew(lottery: str, owner: str) -> bool:
        renewals.append((lottery, owner))
        if len(renewals) >= 2:
            renewed.set()
        return True

    coordinator = RecoveryCoordinator(
        runner,
        renew_lease=renew,
        release_lease=lambda lottery, owner: releases.append((lottery, owner)),
        heartbeat_seconds=0.01,
    )

    assert coordinator.enqueue("今彩539", lease_owner="invocation-1") == "accepted"
    assert started.wait(1)
    assert renewed.wait(1)
    release_worker.set()
    for _ in range(100):
        if not coordinator.is_running("今彩539"):
            break
        sleep(0.01)

    assert len(renewals) >= 2
    assert releases == [("今彩539", "invocation-1")]
