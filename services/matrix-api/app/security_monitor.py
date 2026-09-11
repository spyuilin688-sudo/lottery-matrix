"""Bounded, best-effort security telemetry; no request payloads or proxy headers."""
from concurrent.futures import Future, TimeoutError
import hashlib
import hmac
import ipaddress
import logging
from queue import Queue, Full, Empty
from threading import Thread, Event
from urllib.parse import urlsplit
import httpx

ALLOW = {"allowed": True, "retryAfter": 0, "mode": "observe"}


def source_identity(peer: str, secret: str, trust_direct_peer: bool = False):
    try:
        address = str(ipaddress.ip_address(peer))
    except ValueError:
        address = "unattributed"
    trusted = trust_direct_peer and address != "unattributed"
    value = address if trusted else "unattributed"
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest(), trusted


def request_category(target: str):
    path = urlsplit(target).path
    if path == "/health" or path in {"/jobs/status", "/jobs/refresh", "/jobs/recover"}:
        return None
    return "public_query" if path.startswith("/api/matrix/") else "unauthorized"


class SecurityMonitor:
    def __init__(self, url, key, *, enforce=False, trust_direct_peer=False, client=None, queue_size=256):
        self.url = url.rstrip("/") + "/rest/v1/rpc/security_observe"
        self.key = key
        self.enforce = enforce
        self.trust_direct_peer = trust_direct_peer
        self.client = client or httpx.Client(http2=False, follow_redirects=False, timeout=0.25)
        self._queue = Queue(maxsize=max(1, min(queue_size, 256)))
        self._stop = Event()
        self._thread = Thread(target=self._run, daemon=True, name="security-observation")
        self._thread.start()
        self.dropped = 0
        self.failures = 0

    @property
    def pending(self):
        return self._queue.qsize()

    def identity(self, peer):
        return source_identity(peer, self.key, self.trust_direct_peer)

    def _enqueue(self, category, source, trusted, outcome):
        future = Future()
        try:
            self._queue.put_nowait(({"p_category": category, "p_source": source,
                                     "p_trusted": trusted, "p_outcome": outcome}, future))
        except Full:
            self.dropped += 1
            if self.dropped == 1 or self.dropped % 100 == 0:
                logging.getLogger(__name__).warning("security-observation-queue-full")
            future.set_result(dict(ALLOW))
        return future

    def observe(self, category, source, trusted, outcome="attempt"):
        self._enqueue(category, source, trusted, outcome)

    def check(self, category, source, trusted):
        if not self.enforce:
            self.observe(category, source, trusted)
            return dict(ALLOW)
        try:
            return self._enqueue(category, source, trusted, "attempt").result(timeout=0.3)
        except TimeoutError:
            return dict(ALLOW)

    def _run(self):
        while not self._stop.is_set():
            try:
                payload, future = self._queue.get(timeout=0.05)
            except Empty:
                continue
            result = dict(ALLOW)
            try:
                response = self.client.post(self.url, json=payload, timeout=0.25,
                                            headers={"apikey": self.key, "Authorization": f"Bearer {self.key}"})
                response.raise_for_status()
                data = response.json()
                if data.get("degraded"):
                    raise RuntimeError("observation unavailable")
                if (data.get("mode") == "enforce" and data.get("allowed") is False
                        and isinstance(data.get("retryAfter"), int) and 1 <= data["retryAfter"] <= 3600
                        and payload["p_trusted"]):
                    result = {"allowed": False, "mode": "enforce", "retryAfter": data["retryAfter"]}
            except Exception:
                self.failures += 1
                # Sample fixed text only, never exception strings / credentials / payloads.
                if self.failures == 1 or self.failures % 100 == 0:
                    logging.getLogger(__name__).warning("security-observation-unavailable")
            finally:
                future.set_result(result)
                self._queue.task_done()

    def close(self):
        self._stop.set()
        self._thread.join(timeout=0.4)
        if not self._thread.is_alive():
            self.client.close()
