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
    beginnings: list[tuple[str, str, str]] = []
    renewals: list[tuple[str, str, str]] = []
    releases: list[tuple[str, str, str]] = []

    def runner(_lottery: str) -> None:
        started.set()
        release_worker.wait(1)

    def renew(lottery: str, owner: str, runner_id: str) -> bool:
        renewals.append((lottery, owner, runner_id))
        if len(renewals) >= 2:
            renewed.set()
        return True

    coordinator = RecoveryCoordinator(
        runner,
        begin_lease=lambda lottery, owner, runner_id: beginnings.append(
            (lottery, owner, runner_id)
        ) or True,
        renew_lease=renew,
        release_lease=lambda lottery, owner, runner_id: releases.append(
            (lottery, owner, runner_id)
        ),
        heartbeat_seconds=0.01,
        runner_id_factory=lambda: "runner-1",
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
    assert beginnings == [("今彩539", "invocation-1", "runner-1")]
    assert releases == [("今彩539", "invocation-1", "runner-1")]


def test_recovery_coordinator_fences_work_after_lease_loss() -> None:
    started = Event()
    lost = Event()
    release_worker = Event()

    def runner(_lottery: str) -> None:
        started.set()
        release_worker.wait(1)

    coordinator = RecoveryCoordinator(
        runner,
        begin_lease=lambda *_: True,
        renew_lease=lambda *_: False,
        release_lease=lambda *_: None,
        on_lease_lost=lambda *_: lost.set(),
        heartbeat_seconds=0.01,
        runner_id_factory=lambda: "runner-2",
    )

    assert coordinator.enqueue("六合彩", lease_owner="invocation-2") == "accepted"
    assert started.wait(1)
    assert lost.wait(1)
    release_worker.set()
