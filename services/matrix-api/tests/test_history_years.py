from types import SimpleNamespace
from urllib.parse import quote

from app.api_server import handle_api_request
from app.repositories.analysis_repository import InMemoryAnalysisRepository


def test_years_include_old_history_and_new_year_without_inventing_gap_years():
    repository = InMemoryAnalysisRepository()
    for period, date in enumerate(['2027-01-02', '2023-08-02', '2007-01-01', '2023-01-01'], 1):
        repository.upsert_draw({'lottery': '今彩539', 'period': str(period), 'drawDate': date, 'numbers': ['01', '02', '03', '04', '05']})
    status, body = handle_api_request('GET', '/api/matrix/history-years/' + quote('今彩539'), None, repository)
    assert status == 200
    assert body == {'years': ['2027', '2023', '2007']}


def test_year_query_reads_all_years_from_one_summary_rpc():
    class Query:
        def __init__(self):
            self.calls = []
        def rpc(self, name, params):
            self.calls.append((name, params))
            return self
        def execute(self):
            return SimpleNamespace(data={
                'years': ['2027', '2023', '2007'], 'revision': 'years-test',
            })
    query = Query()
    status, body = handle_api_request('GET', '/api/matrix/history-years/' + quote('六合彩'), None, SimpleNamespace(client=query))
    assert status == 200
    assert body == {'years': ['2027', '2023', '2007']}
    assert query.calls == [('matrix_draw_query', {'p_lottery': '六合彩', 'p_kind': 'summary'})]


def test_years_unknown_lottery_is_rejected():
    status, _ = handle_api_request('GET', '/api/matrix/history-years/unknown', None, InMemoryAnalysisRepository())
    assert status == 400
