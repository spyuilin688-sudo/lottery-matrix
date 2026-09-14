"""Bounded, best-effort security telemetry; no request payloads or proxy headers."""
from concurrent.futures import Future, TimeoutError
import hashlib
import hmac
import ipaddress
import json
import logging
import math
from queue import Queue, Full, Empty
from threading import Event, Lock, Thread
from time import monotonic
from urllib.parse import urlsplit
import httpx

ALLOW = {"allowed": True, "retryAfter": 0, "mode": "observe"}
DEFAULT_ENDPOINT_LIMITS = {
    "public_read": (240, 60.0),
    "public_compute": (60, 10.0),
    "unauthorized": (30, 2.0),
}


class EndpointRateLimiter:
    """Per-process aggregate overload guard; never treats a proxy IP as a user."""

    def __init__(self, limits=None, *, clock=monotonic):
        self.limits = dict(limits or DEFAULT_ENDPOINT_LIMITS)
        self.clock = clock
        self._buckets = {}
        self._lock = Lock()

    def check(self, category):
        limit = self.limits.get(category)
        if limit is None:
            return dict(ALLOW)
        capacity, refill_per_second = limit
        now = self.clock()
        with self._lock:
            tokens, previous = self._buckets.get(category, (float(capacity), now))
            tokens = min(float(capacity), tokens + max(0.0, now - previous) * refill_per_second)
            if tokens < 1.0:
                retry_after = max(1, math.ceil((1.0 - tokens) / refill_per_second))
                self._buckets[category] = (tokens, now)
                return {"allowed": False, "retryAfter": retry_after, "mode": "local"}
            self._buckets[category] = (tokens - 1.0, now)
        return dict(ALLOW)


def source_identity(peer: str, secret: str, trust_direct_peer: bool = False):
    try:
        address = str(ipaddress.ip_address(peer))
    except ValueError:
        address = "unattributed"
    trusted = trust_direct_peer and address != "unattributed"
    value = address if trusted else "unattributed"
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest(), trusted


def request_category(target: str, method: str = "GET"):
    path = urlsplit(target).path
    if path == "/health" or path in {"/jobs/status", "/jobs/refresh", "/jobs/recover", "/jobs/result-ready"}:
        return None
    if method == "GET" and path.startswith((
        "/api/matrix/latest/", "/api/matrix/history-years/", "/api/matrix/cards/",
    )):
        return "public_read"
    if ((method == "GET" and path.startswith("/api/matrix/history/"))
            or (method == "POST" and path in {
                "/api/matrix/tongxing", "/api/matrix/number-reference",
            })):
        return "public_compute"
    return "unauthorized"


class SecurityMonitor:
    def __init__(self, url, key, *, enforce=False, trust_direct_peer=False, client=None,
                 queue_size=256, observation_timeout=0.75, endpoint_limiter=None):
        self.url = url.rstrip("/") + "/rest/v1/rpc/security_observe"
        self.key = key
        self.enforce = enforce
        self.trust_direct_peer = trust_direct_peer
        self.observation_timeout = max(0.1, min(float(observation_timeout), 2.0))
        self.client = client or httpx.Client(
            http2=False, follow_redirects=False, timeout=self.observation_timeout,
        )
        self.endpoint_limiter = endpoint_limiter or EndpointRateLimiter()
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
                self._log_unavailable("queue-full", "enqueue", 0)
            future.set_result(dict(ALLOW))
        return future

    def observe(self, category, source, trusted, outcome="attempt"):
        self._enqueue(category, source, trusted, outcome)

    def check(self, category, source, trusted):
        if self.enforce:
            local_result = self.endpoint_limiter.check(category)
            if not local_result["allowed"]:
                self.observe(category, source, trusted, "rate_limited")
                return local_result
        if not self.enforce:
            self.observe(category, source, trusted)
            return dict(ALLOW)
        if not trusted:
            self.observe(category, source, trusted)
            return dict(ALLOW)
        started = monotonic()
        try:
            return self._enqueue(category, source, trusted, "attempt").result(
                timeout=self.observation_timeout + 0.05,
            )
        except TimeoutError:
            self.failures += 1
            self._log_unavailable(
                "timeout", "decision-wait", (monotonic() - started) * 1000,
            )
            return dict(ALLOW)

    def _log_unavailable(self, reason, stage, elapsed_ms, *, status_code=None):
        details = {
            "reason": reason,
            "stage": stage,
            "elapsedMs": round(max(0.0, elapsed_ms), 1),
            "failures": self.failures,
            "retries": 0,
            "dropped": self.dropped,
            "pending": self.pending,
        }
        if type(status_code) is int and 100 <= status_code <= 599:
            details["statusCode"] = status_code
        logging.getLogger(__name__).warning(
            "security-observation-unavailable %s",
            json.dumps(details, sort_keys=True, separators=(",", ":")),
        )

    def _run(self):
        while not self._stop.is_set():
            try:
                payload, future = self._queue.get(timeout=0.05)
            except Empty:
                continue
            result = dict(ALLOW)
            started = monotonic()
            try:
                response = self.client.post(self.url, json=payload, timeout=self.observation_timeout,
                                            headers={"apikey": self.key, "Authorization": f"Bearer {self.key}"})
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise ValueError("INVALID_OBSERVATION_RESPONSE")
                if data.get("degraded"):
                    raise RuntimeError("OBSERVATION_DEGRADED")
                if (data.get("mode") == "enforce" and data.get("allowed") is False
                        and type(data.get("retryAfter")) is int and 1 <= data["retryAfter"] <= 3600
                        and payload["p_trusted"]):
                    result = {"allowed": False, "mode": "enforce", "retryAfter": data["retryAfter"]}
            except Exception as error:
                self.failures += 1
                if self.failures == 1 or self.failures % 100 == 0:
                    if isinstance(error, httpx.TimeoutException):
                        reason = "timeout"
                        stage = "transport"
                    elif isinstance(error, httpx.ConnectError):
                        reason = "connection-error"
                        stage = "transport"
                    elif isinstance(error, httpx.HTTPStatusError):
                        reason = "http-status"
                        stage = "response"
                    elif isinstance(error, ValueError):
                        reason = "malformed-response"
                        stage = "decode"
                    elif isinstance(error, RuntimeError):
                        reason = "rpc-db-error"
                        stage = "rpc"
                    else:
                        reason = "unexpected-error"
                        stage = "worker"
                    status_code = (
                        error.response.status_code
                        if isinstance(error, httpx.HTTPStatusError) else None
                    )
                    self._log_unavailable(
                        reason, stage, (monotonic() - started) * 1000,
                        status_code=status_code,
                    )
            finally:
                future.set_result(result)
                self._queue.task_done()

    def close(self):
        self._stop.set()
        self._thread.join(timeout=0.4)
        if not self._thread.is_alive():
            self.client.close()
