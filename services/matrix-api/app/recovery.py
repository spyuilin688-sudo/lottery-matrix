from __future__ import annotations

from collections.abc import Callable
from threading import Event, Lock, Thread
from time import monotonic
from uuid import uuid4
import json
from httpx import HTTPStatusError


LeaseBeginner = Callable[[str, str, str], bool]
LeaseRenewer = Callable[[str, str, str], bool]
LeaseReleaser = Callable[[str, str, str], object]
LeaseLostHandler = Callable[[str, str, str], object]


class RecoveryCoordinator:
    def __init__(
        self,
        runner: Callable[[str], None],
        *,
        verify: Callable[..., bool] | None = None,
        record_success: Callable[..., object] | None = None,
        targeted_runner: Callable[..., str | None] | None = None,
        begin_lease: LeaseBeginner | None = None,
        renew_lease: LeaseRenewer | None = None,
        release_lease: LeaseReleaser | None = None,
        on_lease_lost: LeaseLostHandler | None = None,
        heartbeat_seconds: float = 60.0,
        lease_timeout_seconds: float = 20 * 60,
        runner_id_factory: Callable[[], str] | None = None,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._runner = runner
        self._verify = verify
        self._record_success = record_success
        self._targeted_runner = targeted_runner
        self._begin_lease = begin_lease
        self._renew_lease = renew_lease
        self._release_lease = release_lease
        self._on_lease_lost = on_lease_lost
        self._heartbeat_seconds = heartbeat_seconds
        self._lease_timeout_seconds = lease_timeout_seconds
        self._runner_id_factory = runner_id_factory or (lambda: str(uuid4()))
        self._clock = clock or monotonic
        self._lock = Lock()
        self._running: set[str] = set()

    def enqueue(self, lottery: str, lease_owner: str | None = None, *, draw_period: str | None = None, stage: str | None = None, minimum_draw_date: str | None = None) -> str:
        with self._lock:
            if lottery in self._running:
                return "already-running"
            self._running.add(lottery)
        runner_id = self._runner_id_factory()
        lease_begun = False
        lease_confirmed_until: float | None = None
        if lease_owner and self._begin_lease:
            confirmation_started_at = self._clock()
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
            lease_confirmed_until = (
                confirmation_started_at + self._lease_timeout_seconds
            )
        thread = Thread(
            target=self._execute,
            args=(
                lottery,
                lease_owner,
                runner_id,
                lease_begun,
                lease_confirmed_until,
                draw_period, stage, minimum_draw_date,
            ),
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
        confirmed_until: float,
    ) -> None:
        while True:
            remaining = confirmed_until - self._clock()
            if remaining <= 0:
                self._fence_lost_lease(lottery, lease_owner, runner_id)
                return
            if stopped.wait(min(self._heartbeat_seconds, remaining)):
                return
            if self._clock() >= confirmed_until:
                self._fence_lost_lease(lottery, lease_owner, runner_id)
                return
            confirmation_started_at = self._clock()
            try:
                renewed = not self._renew_lease or self._renew_lease(lottery, lease_owner, runner_id)
                if stopped.is_set():
                    return
                if not renewed:
                    self._fence_lost_lease(lottery, lease_owner, runner_id)
                    return
                confirmed_until = (
                    confirmation_started_at + self._lease_timeout_seconds
                )
            except Exception as error:
                print(
                    f"{lottery} recovery lease heartbeat failed: "
                    f"{type(error).__name__}"
                )
                if self._clock() >= confirmed_until:
                    self._fence_lost_lease(lottery, lease_owner, runner_id)
                    return

    def _fence_lost_lease(
        self,
        lottery: str,
        lease_owner: str,
        runner_id: str,
    ) -> None:
        print(f"{lottery} recovery lease lost")
        if self._on_lease_lost:
            self._on_lease_lost(lottery, lease_owner, runner_id)

    def _execute(
        self,
        lottery: str,
        lease_owner: str | None,
        runner_id: str,
        lease_begun: bool,
        lease_confirmed_until: float | None,
        draw_period: str | None = None,
        stage: str | None = None,
        minimum_draw_date: str | None = None,
    ) -> None:
        stopped: Event | None = None
        heartbeat: Thread | None = None
        try:
            if (
                lease_begun
                and lease_owner
                and self._renew_lease
                and lease_confirmed_until is not None
            ):
                stopped = Event()
                heartbeat = Thread(
                    target=self._keep_lease,
                    args=(
                        lottery,
                        lease_owner,
                        runner_id,
                        stopped,
                        lease_confirmed_until,
                    ),
                    daemon=False,
                    name=f"matrix-recovery-heartbeat-{lottery}",
                )
                heartbeat.start()
            if stage is not None:
                if self._targeted_runner is None:
                    raise RuntimeError("TARGETED_RECOVERY_NOT_CONFIGURED")
                verified_period = self._targeted_runner(
                    lottery, draw_period, stage, minimum_draw_date,
                    lease_owner=lease_owner if lease_begun else None,
                    runner_id=runner_id if lease_begun else None,
                )
            else:
                self._runner(lottery)
                verified_period = draw_period
            # A successful completion deletes the durable lease. Drain renewal
            # first so it cannot misinterpret our own deletion as lease loss.
            if stopped is not None:
                stopped.set()
            if heartbeat is not None:
                heartbeat.join(timeout=max(10.0, self._heartbeat_seconds + 1.0))
                if heartbeat.is_alive():
                    raise RuntimeError("RECOVERY_HEARTBEAT_NOT_STOPPED")
            if lease_begun and lease_owner and self._verify and self._record_success:
                if self._verify(lottery, verified_period):
                    self._record_success(lottery, lease_owner, runner_id, verified_period)
        except Exception as error:
            # Record only bounded diagnostic fields, never request URLs, headers or bodies.
            print(json.dumps({
                "event": "recovery-failed", "lottery": lottery,
                "period": draw_period, "stage": stage,
                "errorType": type(error).__name__,
                **({"httpStatus": error.response.status_code} if isinstance(error, HTTPStatusError) else {}),
            }, ensure_ascii=False), flush=True)
        finally:
            if stopped is not None:
                stopped.set()
            if heartbeat is not None:
                heartbeat.join(timeout=max(1.0, self._heartbeat_seconds + 1.0))
            if lease_begun and lease_owner and self._release_lease and (heartbeat is None or not heartbeat.is_alive()):
                try:
                    self._release_lease(lottery, lease_owner, runner_id)
                except Exception as error:
                    print(f"{lottery} recovery lease release failed: {type(error).__name__}")
            with self._lock:
                self._running.discard(lottery)
