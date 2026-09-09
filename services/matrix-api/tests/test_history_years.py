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


def test_year_query_reads_dates_only_and_does_not_stop_at_a_short_server_page():
    class Query:
        def __init__(self):
            self.offset = 0
            self.pages = []
        def table(self, name):
            assert name == 'lottery_draws'
            return self
        def select(self, fields):
            assert fields == 'draw_date'
            return self
        def eq(self, field, value):
            assert (field, value) == ('lottery', '六合彩')
            return self
        def order(self, *args, **kwargs):
            return self
        def range(self, start, end):
            self.offset = start
            self.pages.append(start)
            return self
        def execute(self):
            values = [{'draw_date': '2027-01-01'}, {'draw_date': '2023-01-01'}, {'draw_date': '2007-01-01'}, {'draw_date': None}]
            return SimpleNamespace(data=values[self.offset:self.offset + 2])
    query = Query()
    status, body = handle_api_request('GET', '/api/matrix/history-years/' + quote('六合彩'), None, SimpleNamespace(client=query))
    assert status == 200
    assert body == {'years': ['2027', '2023', '2007']}
    assert query.pages == [0, 2, 4]


def test_years_unknown_lottery_is_rejected():
    status, _ = handle_api_request('GET', '/api/matrix/history-years/unknown', None, InMemoryAnalysisRepository())
    assert status == 400
