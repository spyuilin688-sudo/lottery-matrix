from copy import deepcopy
from types import SimpleNamespace

from app import api_server
from app.draw_read_cache import DrawReadCache


def version():
    return {lottery: {'drawRevision': 'r1', 'generation': 1, 'activeVersions': {}}
            for lottery in api_server.LOTTERIES}


def test_public_revision_probe_is_small_opaque_and_changes_for_same_period_updates():
    current = version()
    calls = []
    def rpc(name, params):
        calls.append((name, params))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=deepcopy(current)))
    repository = SimpleNamespace(client=SimpleNamespace(rpc=rpc), draw_read_cache=DrawReadCache())
    def read():
        return api_server.handle_api_request('GET', '/api/matrix/result-revisions', None, repository)
    status, first = read()
    assert status == 200
    assert set(first) == {'revisions'}
    assert set(first['revisions']) == api_server.LOTTERIES
    assert all(len(token) == 64 for token in first['revisions'].values())
    assert read()[1] == first
    for field, value in [('drawRevision', 'corrected'), ('generation', 2), ('activeVersions', {'draw': 'v2'})]:
        current['今彩539'][field] = value
        changed = read()[1]
        assert changed['revisions']['今彩539'] != first['revisions']['今彩539']
        assert changed['revisions']['天天樂'] == first['revisions']['天天樂']
        first = changed
    assert all(name == 'matrix_public_result_revision' and params == {} for name, params in calls)


def test_probe_failure_is_unavailable_and_not_retained(monkeypatch):
    current = [None]
    monkeypatch.setattr(api_server, '_public_result_revision', lambda client: current[0])
    repository = SimpleNamespace(client=object(), draw_read_cache=DrawReadCache())
    read = lambda: api_server.handle_api_request('GET', '/api/matrix/result-revisions', None, repository)
    assert read() == (503, {'error': 'RESULT_REVISION_UNAVAILABLE'})
    current[0] = version()
    assert read()[0] == 200


def test_latest_result_metadata_matches_verified_snapshot_and_fallback_omits_it(monkeypatch):
    current = [version()]
    monkeypatch.setattr(api_server, '_public_result_revision', lambda client: deepcopy(current[0]))
    payload = {'drawDate': '2026-09-26', 'items': [{'lottery': '今彩539', 'period': '1'}]}
    monkeypatch.setattr(api_server, '_read_latest_completed_results', lambda client: payload.copy())
    repository = SimpleNamespace(client=object(), completed_result_cache=DrawReadCache())
    result = api_server._latest_completed_results(repository)
    assert result == {**payload, 'revisions': api_server._result_revision_tokens(current[0])}
    current[0] = None
    assert api_server._latest_completed_results(repository) == payload


def test_revision_http_success_and_failure_are_never_stored(monkeypatch):
    from test_api_server_http import running_server, request, HttpOperationalRepository
    current = [version()]
    monkeypatch.setattr(api_server, '_public_result_revision', lambda client: current[0])
    repository = HttpOperationalRepository()
    repository.client = object()
    with running_server(repository) as address:
        response, _ = request(address, 'GET', '/api/matrix/result-revisions')
        assert response.status == 200
        assert response.getheader('Cache-Control') == 'no-store'
        current[0] = None
        response, _ = request(address, 'GET', '/api/matrix/result-revisions')
        assert response.status == 503
        assert response.getheader('Cache-Control') == 'no-store'
