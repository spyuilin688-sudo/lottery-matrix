"""Bounded, process-local cache for public draw pages, keyed by database revision."""
from collections import OrderedDict
from concurrent.futures import Future
import json
from threading import Lock
from time import monotonic


class DrawReadCache:
    def __init__(self, *, max_entries=128, max_bytes=16 * 1024 * 1024,
                 ttl=300, clock=monotonic):
        self._values = OrderedDict()
        self._pending = {}
        self._lock = Lock()
        self._bytes = 0
        self._max_entries = max_entries
        self._max_bytes = max_bytes
        self._ttl = ttl
        self._clock = clock

    def read(self, key, load):
        with self._lock:
            for expired in [k for k, (until, _) in self._values.items() if until <= self._clock()]:
                self._bytes -= len(self._values.pop(expired)[1])
            cached = self._values.get(key)
            if cached is not None:
                self._values.move_to_end(key)
                return json.loads(cached[1])
            future = self._pending.get(key)
            owner = future is None
            if owner:
                future = Future()
                self._pending[key] = future
        if not owner:
            return json.loads(future.result())
        try:
            value = load()
            encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            with self._lock:
                if 'error' not in value and len(encoded) <= self._max_bytes:
                    while self._values and (len(self._values) >= self._max_entries
                                            or self._bytes + len(encoded) > self._max_bytes):
                        _, (_, evicted) = self._values.popitem(last=False)
                        self._bytes -= len(evicted)
                    self._values[key] = (self._clock() + self._ttl, encoded)
                    self._bytes += len(encoded)
            future.set_result(encoded)
            return json.loads(encoded)
        except BaseException as error:
            future.set_exception(error)
            raise
        finally:
            with self._lock:
                self._pending.pop(key, None)
