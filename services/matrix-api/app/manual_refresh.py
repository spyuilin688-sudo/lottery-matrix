"""Bounded, correlated manual draw refreshes; no analysis work is run here."""
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from threading import Lock, Thread
from typing import Any, Protocol
from uuid import uuid4


class SourceNotReady(Exception):
    pass


class RefreshStore(Protocol):
    def claim(self, lottery: str, request_id: str) -> dict: ...
    def get(self, lottery: str, request_id: str) -> dict | None: ...
    def update(self, lottery: str, request_id: str, status: str, *, period: str | None = None,
               draw_date: str | None = None, error: str | None = None) -> bool: ...


class SupabaseRefreshStore:
    def __init__(self, client: Any):
        self.client = client

    def claim(self, lottery: str, request_id: str) -> dict:
        return self.client.rpc("matrix_manual_refresh_claim", {
            "p_lottery": lottery, "p_request_id": request_id,
        }).execute().data

    def get(self, lottery: str, request_id: str) -> dict | None:
        return self.client.rpc("matrix_manual_refresh_status", {
            "p_lottery": lottery, "p_request_id": request_id,
        }).execute().data

    def update(self, lottery: str, request_id: str, status: str, *, period=None, draw_date=None, error=None) -> bool:
        return bool(self.client.rpc("matrix_manual_refresh_update", {
            "p_lottery": lottery, "p_request_id": request_id, "p_status": status,
            "p_period": period, "p_draw_date": draw_date, "p_error": error,
        }).execute().data)


class InMemoryRefreshStore:
    """The in-memory repository's equivalent of the atomic SQL store."""
    def __init__(self):
        self.rows: dict[str, dict] = {}
        self.expires: dict[str, datetime] = {}
        self.lock = Lock()

    def claim(self, lottery: str, request_id: str) -> dict:
        with self.lock:
            row = self.rows.get(lottery)
            if row and row["status"] in {"accepted", "running"} and self.expires[lottery] > datetime.now(UTC):
                return dict(row)
            row = {"lottery": lottery, "requestId": request_id, "status": "accepted",
                   "period": None, "drawDate": None, "error": None}
            self.rows[lottery] = row
            self.expires[lottery] = datetime.now(UTC) + timedelta(minutes=30)
            return dict(row)

    def get(self, lottery: str, request_id: str) -> dict | None:
        with self.lock:
            row = self.rows.get(lottery)
            if not row or row["requestId"] != request_id:
                return None
            if row["status"] in {"accepted", "running"} and self.expires[lottery] <= datetime.now(UTC):
                return {**row, "status": "failed", "error": "REFRESH_INTERRUPTED"}
            return dict(row)

    def update(self, lottery: str, request_id: str, status: str, *, period=None, draw_date=None, error=None) -> bool:
        with self.lock:
            row = self.rows.get(lottery)
            if not row or row["requestId"] != request_id or row["status"] not in {"accepted", "running"} or self.expires[lottery] <= datetime.now(UTC):
                return False
            row.update(status=status, period=period, drawDate=draw_date, error=error)
            return True


class ManualRefreshCoordinator:
    def __init__(self):
        self.lock = Lock()
        self.active: dict[str, str] = {}

    def enqueue(self, lottery: str, store: RefreshStore, runner: Callable[[], dict], *, on_done: Callable[[], None] = lambda: None) -> dict:
        with self.lock:
            # Do not create unlimited threads if an upstream call stalls beyond expiry.
            if lottery in self.active:
                task = store.get(lottery, self.active[lottery])
                if task is None:
                    raise RuntimeError("REFRESH_BUSY")
                return task
            request_id = str(uuid4())
            task = store.claim(lottery, request_id)
            if task["requestId"] != request_id:
                return task
            self.active[lottery] = request_id
            try:
                Thread(target=self._execute, args=(lottery, request_id, store, runner, on_done), daemon=False).start()
            except Exception:
                self.active.pop(lottery, None)
                store.update(lottery, request_id, "failed", error="REFRESH_FAILED")
                return store.get(lottery, request_id)
            return task

    def _execute(self, lottery, request_id, store, runner, on_done):
        try:
            if not store.update(lottery, request_id, "running"):
                return
            draw = runner()
            period = str(draw.get("period") or "")
            if not period or (draw.get("lottery") is not None and draw["lottery"] != lottery):
                raise ValueError("INVALID_DRAW")
            store.update(lottery, request_id, "complete", period=period, draw_date=draw.get("drawDate"))
        except Exception as error:
            try:
                store.update(lottery, request_id, "failed", error="SOURCE_NOT_READY" if isinstance(error, SourceNotReady) else "REFRESH_FAILED")
            except Exception:
                # The durable deadline makes a lost result interrupted, never complete.
                pass
        finally:
            with self.lock:
                self.active.pop(lottery, None)
            on_done()
