from __future__ import annotations

from threading import Event
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
    assert coordinator.enqueue("天天樂") == "already-running"
    release.set()
    for _ in range(100):
        if not coordinator.is_running("天天樂"):
            break
        sleep(0.01)

    assert coordinator.is_running("天天樂") is False
    assert calls == ["天天樂"]
