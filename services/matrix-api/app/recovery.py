from __future__ import annotations

from collections.abc import Callable
from threading import Event, Lock, Thread
from uuid import uuid4


LeaseBeginner = Callable[[str, str, str], bool]
LeaseRenewer = Callable[[str, str, str], bool]
LeaseReleaser = Callable[[str, str, str], object]
LeaseLostHandler = Callable[[str, str, str], object]


class RecoveryCoordinator:
    def __init__(
        self,
        runner: Callable[[str], None],
        *,
        begin_lease: LeaseBeginner | None = None,
        renew_lease: LeaseRenewer | None = None,
        release_lease: LeaseReleaser | None = None,
        on_lease_lost: LeaseLostHandler | None = None,
        heartbeat_seconds: float = 60.0,
        runner_id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._runner = runner
        self._begin_lease = begin_lease
        self._renew_lease = renew_lease
        self._release_lease = release_lease
        self._on_lease_lost = on_lease_lost
        self._heartbeat_seconds = heartbeat_seconds
        self._runner_id_factory = runner_id_factory or (lambda: str(uuid4()))
        self._lock = Lock()
        self._running: set[str] = set()

    def enqueue(self, lottery: str, lease_owner: str | None = None) -> str:
        with self._lock:
            if lottery in self._running:
                return "already-running"
            self._running.add(lottery)
        runner_id = self._runner_id_factory()
        lease_begun = False
        if lease_owner and self._begin_lease:
            try:
                lease_begun = self._begin_lease(lottery, lease_owner, runner_id)
            except Exception:
                with self._lock:
                    self._running.discard(lottery)
                raise
            if not lease_begun:
                with self._lock:
                    self._running.discard(lottery)
                return "already-running"
        thread = Thread(
            target=self._execute,
            args=(lottery, lease_owner, runner_id, lease_begun),
            daemon=False,
            name=f"matrix-recovery-{lottery}",
        )
        try:
            thread.start()
        except Exception:
            if lease_begun and lease_owner and self._release_lease:
                try:
                    self._release_lease(lottery, lease_owner, runner_id)
                except Exception as error:
                    print(
                        f"{lottery} recovery lease release failed: "
                        f"{type(error).__name__}"
                    )
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
        runner_id: str,
        stopped: Event,
    ) -> None:
        while not stopped.wait(self._heartbeat_seconds):
            try:
                if self._renew_lease and not self._renew_lease(
                    lottery,
                    lease_owner,
                    runner_id,
                ):
                    print(f"{lottery} recovery lease lost")
                    if self._on_lease_lost:
                        self._on_lease_lost(lottery, lease_owner, runner_id)
                    return
            except Exception as error:
                print(f"{lottery} recovery lease heartbeat failed: {type(error).__name__}")

    def _execute(
        self,
        lottery: str,
        lease_owner: str | None,
        runner_id: str,
        lease_begun: bool,
    ) -> None:
        stopped: Event | None = None
        heartbeat: Thread | None = None
        try:
            if lease_begun and lease_owner and self._renew_lease:
                stopped = Event()
                heartbeat = Thread(
                    target=self._keep_lease,
                    args=(lottery, lease_owner, runner_id, stopped),
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
            if lease_begun and lease_owner and self._release_lease:
                try:
                    self._release_lease(lottery, lease_owner, runner_id)
                except Exception as error:
                    print(f"{lottery} recovery lease release failed: {type(error).__name__}")
            with self._lock:
                self._running.discard(lottery)
