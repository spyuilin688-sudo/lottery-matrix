from datetime import timedelta

import pytest

from app import worker
from app.domain.explore_state import DRAW_ORDER
from app.scraping.sources import parse_taiwan_lottery_payload
from tests.test_card_publication import NOW, complete_analysis, fixture, png_stub, service
from tests.test_worker_notifications import NotificationSource, RecordingEmitter, _builders, _due_time


@pytest.mark.parametrize('count,key', [(5, 'daily539Res'), (7, 'lotto649Res')])
@pytest.mark.parametrize('actual', [None, [], [1, 2], [1, 2, 3, 4, 39]])
def test_official_sorted_result_survives_missing_actual_order(count, key, actual):
    values = [1, 2, 3, 4, 5] if count == 5 else [1, 2, 3, 4, 5, 6, 49]
    draw = parse_taiwan_lottery_payload({'content': {key: [{
        'period': '115000223', 'lotteryDate': '2026-09-14',
        'drawNumberSize': values, 'drawNumberAppear': actual,
    }]}}, key, count)
    assert draw['period'] == '115000223'
    assert draw['drawOrderNumbers'] is None
    assert draw['numbers'] == [str(value).zfill(2) for value in values]
    assert draw.get('resultStatus') == 'preliminary'


def test_marksix_sorted_result_survives_missing_actual_order():
    from app.scraping.sources import parse_sc888_marksix_history
    draws = parse_sc888_marksix_history('''<table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第026100期</td><td>2026-09-15</td><td></td><td>01 02 03 04 05 06 49</td></tr>
    </table>''')
    assert len(draws) == 1
    assert draws[0]['resultStatus'] == 'preliminary'
    assert draws[0]['numbers'] == ['01','02','03','04','05','06','49']
    assert draws[0]['drawOrderNumbers'] is None


def test_new_result_is_emitted_before_history_repair_or_card_render(monkeypatch):
    from app.repositories.analysis_repository import InMemoryAnalysisRepository
    repository = InMemoryAnalysisRepository()
    source = NotificationSource()
    repository.upsert_draws([{'lottery': '今彩539', **draw} for draw in source.fetch_history('今彩539', None)])
    emitter = RecordingEmitter()

    def repair(_self, lottery):
        assert 'lottery_result:539:000001001' in emitter.successful
        raise RuntimeError('archive unavailable')

    def publish(lottery, repo, now=None):
        if repo.list_draws(lottery, 1)[0]['period'] == '000001001':
            assert 'lottery_result:539:000001001' in emitter.successful

    monkeypatch.setattr(worker.DrawRefreshService, 'ensure_history', repair)
    monkeypatch.setattr(worker, 'publish_current_card', publish)
    with pytest.raises(RuntimeError, match='archive unavailable'):
        worker.run_scheduled_worker('今彩539', _due_time(), repository, source, _builders(), notification_emitter=emitter)


def test_fantasy5_result_is_emitted_before_card_render(monkeypatch):
    from app import analysis_worker
    repository, _ = fixture('天天樂')
    emitter = RecordingEmitter()

    def publish(*_):
        assert 'lottery_result:fantasy5:10000' in emitter.successful

    monkeypatch.setattr(analysis_worker, 'publish_current_card', publish)
    monkeypatch.setattr(analysis_worker, '_run_analysis', lambda *_: {'status':'running'})
    result = analysis_worker.run_analysis_only_worker('天天樂', repository, notification_emitter=emitter)
    assert result['status'] == 'running'


@pytest.mark.parametrize('lottery', ['今彩539', '六合彩', '大樂透'])
def test_raw_card_waits_for_current_raw_analysis_then_reuses_sorted(lottery):
    repository, cards = fixture(lottery)
    repository.runs.clear()
    renders = []

    def render(lottery, draws, *, orders=None):
        renders.extend(orders)
        return png_stub(lottery, draws, orders=orders)

    publisher = service(repository, cards, render)
    first = publisher.ensure_current(lottery, NOW)
    assert set(first['cards']) == {'sorted'}
    version = worker.analysis_version_for_order('10000', DRAW_ORDER)
    repository.begin_run(lottery, '10000', version, NOW.isoformat())
    assert publisher.ensure_current(lottery, NOW + timedelta(seconds=1)) == first
    complete_analysis(repository, lottery)
    final = publisher.ensure_current(lottery, NOW + timedelta(seconds=2))
    assert set(final['cards']) == {'sorted', 'draw'}
    assert final['cards']['sorted'] == first['cards']['sorted']
    assert renders == ['sorted', 'draw']


def test_raw_notification_waits_for_raw_analysis_even_if_card_is_present(monkeypatch):
    repository, _ = fixture()
    repository.runs.clear()
    emitter = RecordingEmitter()
    monkeypatch.setattr(worker, '_card_ready', lambda *_: True)
    worker.emit_ready_notifications('今彩539', '10000', repository, emitter, set())
    assert not any(key.startswith('matrix_card:') for key in emitter.successful)


@pytest.mark.parametrize('lottery', ['今彩539', '天天樂', '六合彩', '大樂透'])
def test_legacy_card_routes_exclude_unready_raw_cards(lottery):
    from app.api_server import handle_api_request, handle_matrix_card_request, MatrixCardRequestError
    from urllib.parse import quote
    repository, _ = fixture(lottery)
    repository.runs.clear()
    route = '/api/matrix/cards/' + quote(lottery)
    status, manifest = handle_api_request('GET', route, None, repository)
    assert status == 200
    assert set(manifest['cards']) == {'sorted'}
    with pytest.raises(MatrixCardRequestError, match='牌單尚未建立'):
        handle_matrix_card_request(route + '/draw.svg', repository)


@pytest.mark.parametrize('lottery', ['今彩539', '大樂透'])
@pytest.mark.parametrize('legacy_target', [False, True])
def test_sorted_worker_deduplicates_equal_historical_period_aliases(monkeypatch, lottery, legacy_target):
    from app.repositories.analysis_repository import InMemoryAnalysisRepository
    repository = InMemoryAnalysisRepository()
    values = ['01','02','03','04','05'] + (['06','49'] if lottery == '大樂透' else [])
    draws = [{'lottery':lottery,'period':f'096{i:06d}','drawDate':f'2007-01-{i:02d}',
              'numbers':values,'sortedNumbers':values} for i in range(1,14)]
    if legacy_target:
        draws = [{**draw, 'period':draw['period'][1:]} for draw in draws]
    repository.upsert_draws([*draws,{**draws[0],'period':'096000001' if legacy_target else '96000001'}])
    seen = []
    monkeypatch.setattr(worker, '_run_analysis', lambda repo, draw, history, builders, **kwargs:
                        seen.extend(row['period'] for row in history) or {'status':'complete'})
    worker._resume_stored_analysis(lottery, repository, None, draws[-1], _builders())
    assert len(seen) == 13
    assert seen.count('096000001') == 1
    assert seen[0] == draws[-1]['period']
    alias = '096000001' if legacy_target else '96000001'
    repository.draws[(lottery, alias)]['numbers'] = ['09', *values[1:]]
    repository.draws[(lottery, alias)]['sortedNumbers'] = sorted(['09', *values[1:-1]]) + values[-1:] if lottery == '大樂透' else sorted(['09', *values[1:]])
    with pytest.raises(ValueError, match='DRAW_HISTORY_CONFLICT'):
        worker._resume_stored_analysis(lottery, repository, None, draws[-1], _builders())
    assert len(seen) == 13
