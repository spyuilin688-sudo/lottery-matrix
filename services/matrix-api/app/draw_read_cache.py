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
        self._generation = 0

    def invalidate(self):
        # Publication is shared across lotteries. Old in-flight reads may finish,
        # but must never repopulate a corrected snapshot after this point.
        with self._lock:
            self._generation += 1
            self._values.clear()
            self._pending.clear()
            self._bytes = 0

    def read(self, key, load, *, cache_result=True, ttl=None):
        with self._lock:
            generation = self._generation
            for expired in [k for k, (until, _) in self._values.items() if until <= self._clock()]:
                self._bytes -= len(self._values.pop(expired)[1])
            cached = self._values.get(key) if cache_result else None
            if cached is not None:
                self._values.move_to_end(key)
                return json.loads(cached[1])
            future = self._pending.get(key)
            if future is not None and future.done():
                future = None
            owner = future is None
            if owner:
                future = Future()
                self._pending[key] = future
        if not owner:
            encoded = future.result()
            with self._lock:
                changed = generation != self._generation
            return self.read(key, load, cache_result=cache_result, ttl=ttl) if changed else json.loads(encoded)
        try:
            value = load()
            encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            with self._lock:
                changed = generation != self._generation
                if not changed and cache_result and 'error' not in value and len(encoded) <= self._max_bytes:
                    while self._values and (len(self._values) >= self._max_entries
                                            or self._bytes + len(encoded) > self._max_bytes):
                        _, (_, evicted) = self._values.popitem(last=False)
                        self._bytes -= len(evicted)
                    self._values[key] = (self._clock() + (self._ttl if ttl is None else ttl), encoded)
                    self._bytes += len(encoded)
            future.set_result(encoded)
        except BaseException as error:
            future.set_exception(error)
            raise
        finally:
            with self._lock:
                if self._pending.get(key) is future:
                    self._pending.pop(key, None)
        return self.read(key, load, cache_result=cache_result, ttl=ttl) if changed else json.loads(encoded)
