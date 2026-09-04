from __future__ import annotations

from collections.abc import Callable
from threading import Lock, Thread


class RecoveryCoordinator:
    def __init__(self, runner: Callable[[str], None]) -> None:
        self._runner = runner
        self._lock = Lock()
        self._running: set[str] = set()

    def enqueue(self, lottery: str) -> str:
        with self._lock:
            if lottery in self._running:
                return "already-running"
            self._running.add(lottery)
        thread = Thread(
            target=self._execute,
            args=(lottery,),
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

    def _execute(self, lottery: str) -> None:
        try:
            self._runner(lottery)
        except Exception as error:
            print(f"{lottery} recovery failed: {type(error).__name__}")
        finally:
            with self._lock:
                self._running.discard(lottery)
