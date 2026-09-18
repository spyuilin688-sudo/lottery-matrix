from copy import deepcopy
from datetime import date
import importlib.util
import json
from pathlib import Path

import httpx
import pytest


def module():
    spec = importlib.util.find_spec('app.services.marksix_calendar')
    assert spec is not None, 'official calendar synchronization is not implemented'
    from app.services import marksix_calendar
    return marksix_calendar


def fixture():
    return json.loads((Path(__file__).parent / 'fixtures/hkjc_calendar_september_2026.json').read_text())


def test_real_official_calendar_covers_every_day_and_excludes_unlisted_thursday():
    days = module().parse_hkjc_calendar(fixture(), date(2026, 9, 13))
    assert len(days) == 30
    assert [d['date'] for d in days if d['isDrawDay']] == [
        f'2026-09-{d}' for d in ['05','08','10','12','15','17','19','22','26','29']
    ]
    assert days[23] == {'date': '2026-09-24', 'isDrawDay': False}


def test_weekend_reschedule_and_presale_dates_do_not_become_extra_draws():
    raw = fixture()
    month = raw['data']['item']['years'][0]['months'][0]
    month['dates']['date'] = [{'value': '13'}]
    month['snowballs']['date'] = []
    month['presales']['date'] = [{'value': '12'}]
    days = module().parse_hkjc_calendar(raw, date(2026, 9, 12))
    assert days[11]['isDrawDay'] is False
    assert days[12]['isDrawDay'] is True


@pytest.mark.parametrize('fault', ['errors','no-data','no-month','empty','bad-day','duplicate-month','invalid-type'])
def test_invalid_or_incomplete_source_fails_closed(fault):
    raw = fixture()
    month = raw['data']['item']['years'][0]['months'][0]
    if fault == 'errors': raw['errors'] = [{'message': 'upstream error'}]
    elif fault == 'no-data': raw = {}
    elif fault == 'no-month': month['month']['value'] = '08'
    elif fault == 'empty': month['dates']['date'] = []; month['snowballs']['date'] = []
    elif fault == 'bad-day': month['dates']['date'].append({'value': '31'})
    elif fault == 'duplicate-month': raw['data']['item']['years'][0]['months'].append(deepcopy(month))
    elif fault == 'invalid-type': month['dates']['date'] = None
    with pytest.raises(ValueError, match='OFFICIAL_CALENDAR_INVALID'):
        module().parse_hkjc_calendar(raw, date(2026, 9, 13))


def test_unpublished_next_month_is_not_invented_and_published_next_month_is_included():
    raw = fixture()
    mod = module()
    assert mod.parse_hkjc_calendar(raw, date(2026, 9, 30))[-1]['date'] == '2026-09-30'
    october = deepcopy(raw['data']['item']['years'][0]['months'][0])
    october['month']['value'] = '10'
    raw['data']['item']['years'][0]['months'].append(october)
    days = mod.parse_hkjc_calendar(raw, date(2026, 9, 30))
    assert len(days) == 61 and days[-1]['date'] == '2026-10-31'


class Database:
    def __init__(self, acquired=True, completed=True):
        self.calls = []
        self.acquired = acquired
        self.completed = completed
        self.client = self

    def rpc(self, name, args):
        self.calls.append((name, args))
        self.data = self.acquired if name.endswith('_acquire') else self.completed
        return self

    def execute(self):
        return self


def transport(fail=False):
    def handle(request):
        if request.url.path == '/Config/GlobalConfig.js':
            return httpx.Response(200, text="SITECORE_APIKEY: '{public-fixture-key}'")
        assert request.url.host == 'consvc.hkjc.com'
        assert request.headers['sc_apikey'] == '{public-fixture-key}'
        assert 'NormalDrawDates' in json.loads(request.content)['query']
        if fail: return httpx.Response(503)
        return httpx.Response(200, json=fixture())
    return httpx.MockTransport(handle)


def test_owned_sync_publishes_a_complete_calendar_without_member_notifications():
    db = Database()
    with httpx.Client(transport=transport()) as client:
        result = module().sync_marksix_calendar(db, client, today=date(2026, 9, 13))
    assert result['status'] == 'synced' and result['days'] == 30
    assert [n for n, _ in db.calls] == ['notification_draw_calendar_acquire','notification_draw_calendar_complete']
    assert db.calls[0][1]['p_owner_id'] == db.calls[1][1]['p_owner_id']
    assert db.calls[1][1]['p_days'][23]['isDrawDay'] is False


def test_no_source_request_when_another_worker_owns_sync_or_it_is_not_due():
    db = Database(acquired=False)
    def unexpected(_): pytest.fail('official source must not be requested')
    with httpx.Client(transport=httpx.MockTransport(unexpected)) as client:
        assert module().sync_marksix_calendar(db, client)['status'] == 'not-due'


def test_source_failure_records_unavailable_and_does_not_publish_partial_data():
    db = Database()
    with httpx.Client(transport=transport(fail=True)) as client:
        assert module().sync_marksix_calendar(db, client)['status'] == 'unavailable'
    assert [n for n, _ in db.calls] == ['notification_draw_calendar_acquire','notification_draw_calendar_fail']


def test_lost_lease_does_not_report_success():
    db = Database(completed=False)
    with httpx.Client(transport=transport()) as client:
        assert module().sync_marksix_calendar(db, client, today=date(2026, 9, 13))['status'] == 'lease-lost'
