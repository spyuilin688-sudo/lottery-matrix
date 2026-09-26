from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace
from urllib.parse import quote

import pytest

from app import api_server
from app.draw_read_cache import DrawReadCache

PATH = '/api/matrix/cards/' + quote('今彩539') + '?format=png'


def setup(monkeypatch):
    repository = SimpleNamespace(client=object(), draw_read_cache=DrawReadCache())
    revision = {'drawRevision': 'r1', 'generation': 1, 'activeVersions': {}}
    calls = []
    def load(lottery, repo):
        calls.append(lottery)
        return {'lottery': lottery, 'period': '1', 'generation': str(revision['generation']),
                'cards': {'sorted': {'url': 'https://cards.test/1.png'}}}
    monkeypatch.setattr(api_server, '_public_result_revision', lambda client: dict(revision))
    monkeypatch.setattr(api_server, 'published_manifest', load)
    return repository, revision, calls


def read(repository):
    return api_server.handle_api_request('GET', PATH, None, repository)


def test_validated_manifest_shared_and_each_dependency_change_revalidates(monkeypatch):
    repository, revision, calls = setup(monkeypatch)
    first = read(repository)
    assert first[0] == 200
    assert read(repository) == first
    assert len(calls) == 1
    for field, value in [('drawRevision', 'corrected'), ('generation', 2),
                         ('activeVersions', {'draw': 'v2'})]:
        revision[field] = value
        read(repository)
        assert read(repository)[0] == 200
    assert len(calls) == 4


@pytest.mark.parametrize('missing', [None, 'error'])
def test_missing_invalid_or_failed_manifest_not_cached(monkeypatch, missing):
    repository, revision, calls = setup(monkeypatch)
    original = api_server.published_manifest
    def load(*args):
        if len(calls) == 0:
            calls.append('missing')
            if missing == 'error':
                raise RuntimeError('database offline')
            return None
        return original(*args)
    monkeypatch.setattr(api_server, 'published_manifest', load)
    if missing == 'error':
        assert read(repository)[0] == 500
    else:
        assert read(repository)[1]['period'] is None
    assert read(repository)[1]['period'] == '1'
    assert len(calls) == 2


def test_concurrent_users_share_one_validation(monkeypatch):
    repository, _, calls = setup(monkeypatch)
    entered, release = Event(), Event()
    original = api_server.published_manifest
    def load(*args):
        entered.set()
        assert release.wait(3)
        return original(*args)
    monkeypatch.setattr(api_server, 'published_manifest', load)
    with ThreadPoolExecutor(max_workers=8) as pool:
        first = pool.submit(read, repository)
        assert entered.wait(3)
        others = [pool.submit(read, repository) for _ in range(7)]
        release.set()
        responses = [first.result()] + [future.result() for future in others]
    assert all(value == responses[0] for value in responses)
    assert len(calls) == 1


def test_version_change_during_validation_does_not_publish_old_manifest(monkeypatch):
    repository, revision, calls = setup(monkeypatch)
    original = api_server.published_manifest
    def load(*args):
        result = original(*args)
        if len(calls) == 1:
            revision['generation'] = 2
        return result
    monkeypatch.setattr(api_server, 'published_manifest', load)
    assert read(repository)[1]['generation'] == '2'
    assert read(repository)[1]['generation'] == '2'
    assert len(calls) == 2


def test_revision_failure_retains_original_validation_without_cache(monkeypatch):
    repository, _, calls = setup(monkeypatch)
    monkeypatch.setattr(api_server, '_public_result_revision', lambda client: None)
    read(repository)
    read(repository)
    assert len(calls) == 2


def test_manifest_cache_expires_and_publication_invalidation_forces_revalidation(monkeypatch):
    repository, _, calls = setup(monkeypatch)
    clock = [0.0]
    repository.draw_read_cache = DrawReadCache(ttl=5, clock=lambda: clock[0])
    read(repository)
    read(repository)
    assert len(calls) == 1
    clock[0] = 6
    read(repository)
    assert len(calls) == 2
    repository.draw_read_cache.invalidate()
    read(repository)
    assert len(calls) == 3
