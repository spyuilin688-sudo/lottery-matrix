import json

import pytest
from types import SimpleNamespace
from urllib.parse import quote, urlencode

from app.api_server import handle_api_request


class QueryRepository:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []
        self.client = self

    def rpc(self, name, params):
        self.calls.append((name, params))
        payload = self.payload[len(self.calls) - 1] if isinstance(self.payload, list) else self.payload
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=payload))


def draw(period='115000001'):
    return dict(period=period, draw_date='2026-09-01', numbers=['01','02','03','04','05'],
                sorted_numbers=['01','02','03','04','05'], draw_order_numbers=None, result_status='confirmed')


def test_history_page_uses_one_rpc_and_preserves_cursor_and_envelope():
    cursor = {'offset': 500, 'revision': 'r1'}
    repository = QueryRepository({'items': [draw()], 'revision': 'r1', 'nextCursor': cursor})
    path = '/api/matrix/history/' + quote('今彩539') + '?' + urlencode({'pageSize': 500, 'cursor': json.dumps(cursor)})
    status, payload = handle_api_request('GET', path, None, repository)
    assert status == 200
    assert payload['items'][0]['drawDate'] == '2026-09-01'
    assert payload['nextCursor'] == cursor
    assert repository.calls == [('matrix_draw_query', {'p_lottery': '今彩539', 'p_kind': 'history', 'p_limit': 500, 'p_cursor': cursor})]


def test_changed_history_snapshot_returns_409_not_partial_results():
    repository = QueryRepository({'error': 'DRAW_HISTORY_CHANGED', 'revision': 'r2'})
    status, payload = handle_api_request('GET', '/api/matrix/history/' + quote('今彩539') + '?pageSize=500', None, repository)
    assert (status, payload) == (409, {'error': 'DRAW_HISTORY_CHANGED'})


def test_years_uses_summary_not_date_pages():
    repository = QueryRepository({'years': ['2026','2025'], 'revision': 'r1'})
    status, payload = handle_api_request('GET', '/api/matrix/history-years/' + quote('今彩539'), None, repository)
    assert status == 200 and payload == {'years': ['2026','2025']}
    assert repository.calls[0][1]['p_kind'] == 'summary'


def test_latest_includes_correction_revision():
    repository = QueryRepository({'items': [draw()], 'revision': 'r1', 'nextCursor': None})
    status, payload = handle_api_request('GET', '/api/matrix/latest/' + quote('今彩539'), None, repository)
    assert status == 200 and payload['revision'] == 'r1'
    assert payload['item']['period'] == '115000001'


def test_tongxing_filters_in_database_and_preserves_pair_projection():
    repository = QueryRepository({'groups': [{'lockedEntry': draw(), 'predictedEntry': draw('115000002')}], 'revision': 'r1', 'nextCursor': None})
    body = {'lottery':'今彩539','numberOrder':'依號碼由小到大排序','numbers':['01'],'futureOffset':1,'pageSize':500}
    status, payload = handle_api_request('POST','/api/matrix/tongxing',json.dumps(body).encode(),repository)
    assert status == 200 and payload['groups'][0]['predictedEntry']['period'] == '115000002'
    assert payload['nextCursor'] is None
    assert repository.calls[0][1]['p_numbers'] == ['01']


def test_page_size_and_cursor_are_validated_before_database():
    for suffix in ('?pageSize=0','?pageSize=501','?pageSize=oops','?pageSize=10&cursor=[]'):
        repository = QueryRepository({})
        status, _ = handle_api_request('GET','/api/matrix/history/'+quote('今彩539')+suffix,None,repository)
        assert status == 400 and repository.calls == []


@pytest.mark.parametrize('explicit_page_size, expected_count', [(False, 2), (True, 1)])
def test_tongxing_legacy_reads_all_filtered_pages_but_explicit_page_reads_one(explicit_page_size, expected_count):
    cursor = {'offset': 1, 'revision': 'r1'}
    repository = QueryRepository([
        {'groups': [{'lockedEntry': draw(), 'predictedEntry': draw('115000002')}], 'revision': 'r1', 'nextCursor': cursor},
        {'groups': [{'lockedEntry': draw('115000003'), 'predictedEntry': draw('115000004')}], 'revision': 'r1', 'nextCursor': None},
    ])
    body = {'lottery': '今彩539', 'numberOrder': '依號碼由小到大排序', 'numbers': ['01'], 'futureOffset': 1}
    if explicit_page_size:
        body['pageSize'] = 1
    status, payload = handle_api_request('POST', '/api/matrix/tongxing', json.dumps(body).encode(), repository)
    assert status == 200
    assert [pair['predictedEntry']['period'] for pair in payload['groups']] == ['115000002', '115000004'][:expected_count]
    assert payload['nextCursor'] == (cursor if explicit_page_size else None)
    assert len(repository.calls) == expected_count
    assert all(name == 'matrix_draw_query' and params['p_kind'] == 'tongxing' for name, params in repository.calls)
    if not explicit_page_size:
        assert repository.calls[1][1]['p_cursor'] == cursor


def test_tongxing_legacy_revision_change_rejects_all_partial_results():
    repository = QueryRepository([
        {'groups': [{'lockedEntry': draw(), 'predictedEntry': draw('115000002')}], 'revision': 'r1', 'nextCursor': {'offset': 1, 'revision': 'r1'}},
        {'error': 'DRAW_HISTORY_CHANGED', 'revision': 'r2'},
    ])
    body = {'lottery': '今彩539', 'numberOrder': '依號碼由小到大排序', 'numbers': ['01'], 'futureOffset': 1}
    status, payload = handle_api_request('POST', '/api/matrix/tongxing', json.dumps(body).encode(), repository)
    assert (status, payload) == (409, {'error': 'DRAW_HISTORY_CHANGED'})
    assert len(repository.calls) == 2


@pytest.mark.parametrize('next_cursor', [{'offset': 0, 'revision': 'r1'}, {'offset': 3, 'revision': 'r1'}])
def test_tongxing_legacy_rejects_nonadvancing_or_skipping_cursor(next_cursor):
    repository = QueryRepository({'groups': [{'lockedEntry': draw(), 'predictedEntry': draw('115000002')}], 'revision': 'r1', 'nextCursor': next_cursor})
    body = {'lottery': '今彩539', 'numberOrder': '依號碼由小到大排序', 'numbers': ['01'], 'futureOffset': 1}
    status, payload = handle_api_request('POST', '/api/matrix/tongxing', json.dumps(body).encode(), repository)
    assert (status, payload) == (500, {'error': 'INTERNAL_ERROR'})
    assert len(repository.calls) == 1
