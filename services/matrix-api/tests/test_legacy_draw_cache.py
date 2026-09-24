import json
from concurrent.futures import Future, ThreadPoolExecutor
from threading import Event
from urllib.parse import quote

import httpx
import pytest

from app.api_server import handle_api_request
from app.draw_read_cache import DrawReadCache
from app.repositories.analysis_repository import create_supabase_repository


class DrawDatabase:
    """HTTP boundary with server-capped pages and mutable history revisions."""

    def __init__(self):
        self.revision = 'r1'
        self.reads = []
        self.probes = 0
        self.fail_once = False
        self.after_read = lambda: None
        self.rows = [self.draw(str(115001205 - index)) for index in range(1205)]

    @staticmethod
    def draw(period):
        return dict(period=period, draw_date='2026-09-01', numbers=['01', '02', '03', '04', '05'],
                    sorted_numbers=['01', '02', '03', '04', '05'],
                    draw_order_numbers=None, result_status='confirmed')

    def respond(self, request):
        if request.url.path.endswith('/rpc/matrix_draw_query'):
            params = json.loads(request.content)
            kind = params['p_kind']
            if kind == 'latest':
                self.probes += 1
                return httpx.Response(200, json={'items': self.rows[:1], 'revision': self.revision})
            assert kind == 'tongxing'
            cursor = params.get('p_cursor')
            if cursor is not None and cursor['revision'] != self.revision:
                return httpx.Response(200, json={'error': 'DRAW_HISTORY_CHANGED'})
            offset = cursor['offset'] if cursor else 0
            page = self.rows[offset:offset + 500]
            payload = {'groups': [{'lockedEntry': row, 'predictedEntry': row} for row in page],
                       'revision': self.revision,
                       'nextCursor': {'offset': offset + len(page), 'revision': self.revision}
                       if offset + len(page) < len(self.rows) else None}
        else:
            assert request.url.path == '/rest/v1/lottery_draws'
            kind = 'history'
            offset = int(request.url.params['offset'])
            limit = min(int(request.url.params['limit']), 500)
            payload = self.rows[offset:offset + limit]
        self.reads.append((kind, offset))
        if self.fail_once:
            self.fail_once = False
            raise httpx.ReadTimeout('temporary database timeout')
        self.after_read()
        return httpx.Response(200, json=payload)


@pytest.fixture
def database():
    database = DrawDatabase()
    with httpx.Client(transport=httpx.MockTransport(database.respond)) as client:
        repository = create_supabase_repository('https://supabase.test', 'test-key', httpx_client=client)
        repository.draw_read_cache = DrawReadCache()
        yield database, repository


def request(repository, kind, **params):
    if kind == 'history':
        return handle_api_request('GET', '/api/matrix/history/' + quote('今彩539'), None, repository)
    return handle_api_request('POST', '/api/matrix/tongxing', json.dumps({
        'lottery': '今彩539', 'numberOrder': '依號碼由小到大排序',
        'numbers': ['01'], 'futureOffset': 1, **params,
    }).encode(), repository)


@pytest.mark.parametrize('kind', ['history', 'tongxing'])
def test_legacy_complete_result_is_reused_without_reloading_pages(database, kind):
    source, repository = database
    first = request(repository, kind)
    assert first[0] == 200
    rows = first[1]['items'] if kind == 'history' else [pair['lockedEntry'] for pair in first[1]['groups']]
    assert len(rows) == 1205
    assert rows[0]['period'] == '115001205' and rows[-1]['period'] == '115000001'
    reads = list(source.reads)
    probes = source.probes
    assert request(repository, kind) == first
    assert source.reads == reads
    assert source.probes == probes
    rows[0]['numbers'].append('39')
    fresh = request(repository, kind)[1]
    fresh_row = fresh['items'][0] if kind == 'history' else fresh['groups'][0]['lockedEntry']
    assert fresh_row['numbers'] == ['01', '02', '03', '04', '05']


@pytest.mark.parametrize('kind', ['history', 'tongxing'])
def test_legacy_result_reloads_after_history_correction_and_does_not_cache_errors(database, kind):
    source, repository = database
    assert request(repository, kind)[0] == 200
    source.revision = 'r2'
    source.rows[0] = {**source.rows[0], 'numbers': ['06', '07', '08', '09', '10'],
                      'sorted_numbers': ['06', '07', '08', '09', '10']}
    repository.draw_read_cache.invalidate()
    source.fail_once = True
    assert request(repository, kind)[0] == 503
    corrected = request(repository, kind)
    assert corrected[0] == 200
    row = corrected[1]['items'][0] if kind == 'history' else corrected[1]['groups'][0]['lockedEntry']
    assert row['numbers'] == ['06', '07', '08', '09', '10']
    reads = list(source.reads)
    assert request(repository, kind) == corrected
    assert source.reads == reads


def test_legacy_history_rejects_revision_changed_during_table_pages(database):
    source, repository = database
    source.after_read = lambda: setattr(source, 'revision', 'r2')
    assert request(repository, 'history') == (409, {'error': 'DRAW_HISTORY_CHANGED'})
    source.after_read = lambda: None
    repository.draw_read_cache.invalidate()
    assert request(repository, 'history')[0] == 200


def test_legacy_history_limit_does_not_poison_complete_history_cache(database):
    source, repository = database
    path = '/api/matrix/history/' + quote('今彩539')
    short = handle_api_request('GET', path + '?limit=2', None, repository)
    complete = request(repository, 'history')
    assert short[0] == complete[0] == 200
    assert len(short[1]['items']) == 2
    assert len(complete[1]['items']) == 1205
    assert complete[1]['items'][-1]['period'] == '115000001'
    reads = list(source.reads)
    assert handle_api_request('GET', path + '?limit=2', None, repository) == short
    assert source.reads == reads


@pytest.mark.parametrize('params', [
    {'numbers': ['02']}, {'futureOffset': 2}, {'numberOrder': '依實際開獎順序排序'},
])
def test_legacy_tongxing_query_conditions_have_separate_cache_entries(database, params):
    source, repository = database
    assert request(repository, 'tongxing')[0] == 200
    result = request(repository, 'tongxing', **params)
    assert result[0] == 200
    for key, value in params.items():
        assert result[1][key] == value
    reads = list(source.reads)
    assert request(repository, 'tongxing', **params) == result
    assert source.reads == reads


@pytest.mark.parametrize('kind', ['history', 'tongxing'])
def test_concurrent_legacy_queries_share_one_complete_read(database, monkeypatch, kind):
    import app.draw_read_cache as module
    source, repository = database
    started, release, joined = Event(), Event(), Event()

    class ObservedFuture(Future):
        def result(self, *args, **kwargs):
            joined.set()
            return super().result(*args, **kwargs)

    monkeypatch.setattr(module, 'Future', ObservedFuture)

    def pause():
        started.set()
        assert release.wait(2)

    source.after_read = pause
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(request, repository, kind)
        try:
            assert started.wait(2)
            second = pool.submit(request, repository, kind)
            assert joined.wait(2)
        finally:
            release.set()
        assert first.result() == second.result()
        assert first.result()[0] == 200
    assert source.reads == [(kind, 0), (kind, 500), (kind, 1000)] + ([(kind, 1205)] if kind == 'history' else [])
