from __future__ import annotations

from collections.abc import Callable
from threading import Event, Lock, Thread


LeaseRenewer = Callable[[str, str], bool]
LeaseReleaser = Callable[[str, str], object]


class RecoveryCoordinator:
    def __init__(
        self,
        runner: Callable[[str], None],
        *,
        renew_lease: LeaseRenewer | None = None,
        release_lease: LeaseReleaser | None = None,
        heartbeat_seconds: float = 60.0,
    ) -> None:
        self._runner = runner
        self._renew_lease = renew_lease
        self._release_lease = release_lease
        self._heartbeat_seconds = heartbeat_seconds
        self._lock = Lock()
        self._running: set[str] = set()

    def enqueue(self, lottery: str, lease_owner: str | None = None) -> str:
        with self._lock:
            if lottery in self._running:
                return "already-running"
            self._running.add(lottery)
        thread = Thread(
            target=self._execute,
            args=(lottery, lease_owner),
            daemon=False,
            name=f"matrix-recovery-{lottery}",
        )
        try:
            thread.start()
        except Exception:
            with self._lock:
                self._running.discard(lottery)
            raise
        return "accepted"

    def is_running(self, lottery: str) -> bool:
        with self._lock:
            return lottery in self._running

    def _keep_lease(
        self,
        lottery: str,
        lease_owner: str,
        stopped: Event,
    ) -> None:
        while not stopped.wait(self._heartbeat_seconds):
            try:
                if self._renew_lease and not self._renew_lease(lottery, lease_owner):
                    print(f"{lottery} recovery lease lost")
                    return
            except Exception as error:
                print(f"{lottery} recovery lease heartbeat failed: {type(error).__name__}")

    def _execute(self, lottery: str, lease_owner: str | None) -> None:
        stopped: Event | None = None
        heartbeat: Thread | None = None
        lease_valid = False
        try:
            if lease_owner and self._renew_lease:
                lease_valid = self._renew_lease(lottery, lease_owner)
                if not lease_valid:
                    print(f"{lottery} recovery lease unavailable")
                    return
                stopped = Event()
                heartbeat = Thread(
                    target=self._keep_lease,
                    args=(lottery, lease_owner, stopped),
                    daemon=False,
                    name=f"matrix-recovery-heartbeat-{lottery}",
                )
                heartbeat.start()
            self._runner(lottery)
        except Exception as error:
            print(f"{lottery} recovery failed: {type(error).__name__}")
        finally:
            if stopped is not None:
                stopped.set()
            if heartbeat is not None:
                heartbeat.join(timeout=max(1.0, self._heartbeat_seconds + 1.0))
            if lease_valid and lease_owner and self._release_lease:
                try:
                    self._release_lease(lottery, lease_owner)
                except Exception as error:
                    print(f"{lottery} recovery lease release failed: {type(error).__name__}")
            with self._lock:
                self._running.discard(lottery)
