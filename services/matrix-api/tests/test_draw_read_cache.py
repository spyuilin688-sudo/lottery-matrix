from concurrent.futures import ThreadPoolExecutor
from threading import Event
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from app.draw_read_cache import DrawReadCache
from app.api_server import public_read_ttl_seconds


def test_public_api_checks_often_during_draws_and_keeps_quiet_reads_until_next_window():
    taipei = ZoneInfo('Asia/Taipei')
    assert public_read_ttl_seconds(datetime(2026, 9, 24, 12, 59, tzinfo=taipei)) == 30
    assert public_read_ttl_seconds(datetime(2026, 9, 24, 17, 0, tzinfo=taipei)) == 900
    assert public_read_ttl_seconds(datetime(2026, 9, 24, 20, 19, 59, tzinfo=taipei)) == 1


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


def test_finished_probe_cannot_be_joined_before_owner_cleanup(monkeypatch):
    import app.draw_read_cache as module
    from concurrent.futures import Future
    published, release = Event(), Event()

    class PausedFuture(Future):
        def set_result(self, result):
            super().set_result(result)
            if not published.is_set():
                published.set()
                assert release.wait(2)

    monkeypatch.setattr(module, 'Future', PausedFuture)
    cache = DrawReadCache()
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(cache.read, 'latest', lambda: {'revision': 'v1'}, cache_result=False)
        try:
            assert published.wait(2)
            assert cache.read('latest', lambda: {'revision': 'v2'}, cache_result=False) == {'revision': 'v2'}
        finally:
            release.set()
        assert first.result() == {'revision': 'v1'}


def test_publication_clears_completed_reads_and_a_missed_event_expires():
    now = [0.0]
    cache = DrawReadCache(ttl=60, clock=lambda: now[0])
    value = {'revision': 'old'}
    assert cache.read('latest', lambda: value) == value
    value = {'revision': 'corrected'}
    assert cache.read('latest', lambda: value) == {'revision': 'old'}
    cache.invalidate()
    assert cache.read('latest', lambda: value) == {'revision': 'corrected'}
    now[0] = 61
    assert cache.read('latest', lambda: {'revision': 'next'}) == {'revision': 'next'}


def test_publication_during_a_read_cannot_reinstall_the_old_snapshot():
    now = [0.0]
    cache = DrawReadCache(ttl=60, clock=lambda: now[0])
    started, release = Event(), Event()
    revision = ['old']

    def load():
        captured = revision[0]
        if captured == 'old':
            started.set()
            assert release.wait(2)
        return {'revision': captured}

    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(cache.read, 'latest', load)
        try:
            assert started.wait(2)
            revision[0] = 'corrected'
            cache.invalidate()
            assert cache.read('latest', load) == {'revision': 'corrected'}
        finally:
            release.set()
        assert first.result() == {'revision': 'corrected'}
    assert cache.read('latest', load) == {'revision': 'corrected'}


def test_new_database_error_is_not_hidden_when_an_old_read_retries_after_publication():
    cache = DrawReadCache()
    started, release = Event(), Event()

    def load():
        if not release.is_set():
            started.set()
            assert release.wait(2)
            return {'revision': 'old'}
        raise TimeoutError('new read failed')

    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(cache.read, 'latest', load)
        assert started.wait(2)
        cache.invalidate()
        release.set()
        with pytest.raises(TimeoutError, match='new read failed'):
            first.result()
