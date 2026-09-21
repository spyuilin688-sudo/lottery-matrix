from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from app.draw_read_cache import DrawReadCache


def test_shared_result_is_loaded_once_and_cannot_be_mutated_by_callers():
    cache = DrawReadCache()
    calls = []
    started, release = Event(), Event()
    def load():
        calls.append(1)
        started.set()
        assert release.wait(2)
        return {'items': [1]}
    with ThreadPoolExecutor(max_workers=8) as pool:
        first = pool.submit(cache.read, 'revision1:query', load)
        assert started.wait(2)
        rest = [pool.submit(cache.read, 'revision1:query', load) for _ in range(7)]
        release.set()
        results = [first.result(), *(job.result() for job in rest)]
    results[0]['items'].append(2)
    assert all(result == {'items': [1]} for result in results[1:])
    assert len(calls) == 1
    assert cache.read('revision2:query', lambda: {'items': [3]}) == {'items': [3]}


def test_failure_is_retryable_and_capacity_and_expiry_are_bounded():
    now = [0.0]
    cache = DrawReadCache(max_entries=1, max_bytes=100, ttl=5, clock=lambda: now[0])
    with pytest.raises(ValueError):
        cache.read('failed', lambda: (_ for _ in ()).throw(ValueError()))
    assert cache.read('failed', lambda: {'ok': True}) == {'ok': True}
    cache.read('second', lambda: {'value': 2})
    assert cache.read('failed', lambda: {'ok': False}) == {'ok': False}
    now[0] = 5
    assert cache.read('failed', lambda: {'fresh': True}) == {'fresh': True}
    assert cache.read('large', lambda: {'data': 'x' * 100}) == {'data': 'x' * 100}
    assert cache.read('large', lambda: {'data': 'new'}) == {'data': 'new'}


def test_inflight_only_shares_pending_read_but_rechecks_next_request(monkeypatch):
    import app.draw_read_cache as module
    from concurrent.futures import Future
    joined, started, release = Event(), Event(), Event()

    class ObservedFuture(Future):
        def result(self, *args, **kwargs):
            joined.set()
            return super().result(*args, **kwargs)

    monkeypatch.setattr(module, 'Future', ObservedFuture)
    cache = DrawReadCache()
    calls = []

    def load():
        calls.append(1)
        started.set()
        assert release.wait(2)
        return {'revision': 'v1'}

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(cache.read, 'latest', load, cache_result=False)
        try:
            assert started.wait(2)
            second = pool.submit(cache.read, 'latest', load, cache_result=False)
            assert joined.wait(2)
        finally:
            release.set()
        assert first.result() == second.result() == {'revision': 'v1'}
    assert len(calls) == 1
    assert cache.read('latest', lambda: {'revision': 'v2'}, cache_result=False) == {'revision': 'v2'}
