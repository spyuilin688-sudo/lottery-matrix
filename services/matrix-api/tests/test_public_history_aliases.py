import json
from urllib.parse import quote

import httpx
import pytest
from postgrest import SyncPostgrestClient

from app.api_server import handle_api_request
from app.repositories.analysis_repository import InMemoryAnalysisRepository, SupabaseAnalysisRepository


@pytest.mark.parametrize('lottery', ['今彩539', '大樂透'])
@pytest.mark.parametrize('backend', ['memory', 'supabase'])
def test_history_alias_does_not_count_as_the_next_draw(lottery, backend):
    numbers = ['03', '09', '23', '32', '39']
    rows = [
        dict(period='096000005', draw_date='2007-01-05', numbers=['01', '02', '04', '05', '06']),
        dict(period='96000004', draw_date='2007-01-04', numbers=numbers),
        dict(period='096000004', draw_date='2007-01-04', numbers=numbers),
    ]

    def handler(request):
        if request.method == 'POST':
            assert request.url.path == '/rest/v1/rpc/matrix_draw_query'
            assert json.loads(request.content) == {
                'p_lottery': lottery, 'p_kind': 'tongxing', 'p_limit': 500,
                'p_cursor': None, 'p_numbers': ['03'],
                'p_order': '依號碼由小到大排序', 'p_future_offset': 1,
            }
            # The read-only RPC canonicalizes aliases before pairing draws.
            # SQL execution is covered by supabase/tests/matrix-draw-query.test.mjs.
            return httpx.Response(200, json={
                'groups': [{'lockedEntry': rows[2], 'predictedEntry': rows[0]}],
                'revision': 'alias-test', 'nextCursor': None,
            })
        assert request.method == 'GET'
        assert request.url.path == '/rest/v1/lottery_draws'
        offset = int(request.url.params.get('offset', 0))
        limit = int(request.url.params.get('limit', 1000))
        return httpx.Response(200, json=rows[offset:offset + limit])

    base = 'https://example.supabase.co/rest/v1'
    with SyncPostgrestClient(base, http_client=httpx.Client(base_url=base, transport=httpx.MockTransport(handler))) as client:
        if backend == 'supabase':
            repository = SupabaseAnalysisRepository(client)
        else:
            repository = InMemoryAnalysisRepository()
            for row in rows:
                repository.upsert_draw({
                    'lottery': lottery, 'period': row['period'],
                    'drawDate': row['draw_date'], 'numbers': row['numbers'],
                })
        status, history = handle_api_request('GET', f'/api/matrix/history/{quote(lottery)}', None, repository)
        assert status == 200
        assert [r['period'] for r in history['items']] == ['096000005', '096000004']
        status, result = handle_api_request('POST', '/api/matrix/tongxing', json.dumps({
            'lottery': lottery, 'numberOrder': '依號碼由小到大排序', 'numbers': ['03'], 'futureOffset': 1,
        }).encode(), repository)
        assert status == 200
        assert [(g['lockedEntry']['period'], g['predictedEntry']['period']) for g in result['groups']] == [('096000004', '096000005')]


def test_history_limit_counts_unique_draws_across_pages():
    rows = [
        dict(period='96000004', draw_date='2007-01-04', numbers=['03']),
        dict(period='096000004', draw_date='2007-01-04', numbers=['03']),
        dict(period='096000003', draw_date='2007-01-03', numbers=['04']),
    ]
    def handler(request):
        offset = int(request.url.params.get('offset', 0))
        limit = int(request.url.params.get('limit', 1000))
        return httpx.Response(200, json=rows[offset:offset + limit])
    base = 'https://example.supabase.co/rest/v1'
    with SyncPostgrestClient(base, http_client=httpx.Client(base_url=base, transport=httpx.MockTransport(handler))) as client:
        status, result = handle_api_request('GET', f'/api/matrix/history/{quote("今彩539")}?limit=2', None, SupabaseAnalysisRepository(client))
    assert status == 200
    assert [r['period'] for r in result['items']] == ['096000004', '096000003']


def test_conflicting_alias_payload_is_not_silently_selected():
    repository = InMemoryAnalysisRepository()
    for period, number in [('96000004', '03'), ('096000004', '04')]:
        repository.upsert_draw(dict(lottery='今彩539', period=period, drawDate='2007-01-04', numbers=[number]))
    status, result = handle_api_request('GET', f'/api/matrix/history/{quote("今彩539")}', None, repository)
    assert (status, result) == (400, {'error': 'DRAW_HISTORY_CONFLICT'})


def test_number_reference_removes_aliases_but_keeps_distinct_same_date_periods():
    repository = InMemoryAnalysisRepository()
    for period in ['96000004', '096000004']:
        repository.upsert_draw(dict(lottery='今彩539', period=period, drawDate='2007-01-04', numbers=['03']))
    body = json.dumps({'lottery': '今彩539', 'numberOrder': '依號碼由小到大排序', 'numbers': ['03'], 'historyRange': 1000}).encode()
    status, result = handle_api_request('POST', '/api/matrix/number-reference', body, repository)
    assert status == 200
    assert [(r['period'], r['matchSlots']) for r in result['items']] == [('096000004', [1])]
    for period, number in [('093053', '03'), ('093054', '04')]:
        repository.upsert_draw(dict(lottery='六合彩', period=period, drawDate='1993-07-13', numbers=[number]))
    status, result = handle_api_request('GET', f'/api/matrix/history/{quote("六合彩")}', None, repository)
    assert status == 200
    assert [r['period'] for r in result['items']] == ['093054', '093053']
