import pytest

from app import analysis_worker
from app.analysis_worker import run_analysis_only_worker
from tests.test_analysis_worker_notifications import (
    LOTTERY, PERIOD, CARD_KEY, RESULT_KEY, STATUS_KEY, RecordingEmitter,
    _builders, _repository, _complete_analysis,
)
from tests.test_card_publication import MemoryCards, NOW, service


def published_repository():
    repository = _repository()
    cards = MemoryCards()
    repository.card_repository = cards
    manifest = service(repository, cards).ensure_current(LOTTERY, NOW)
    assert set(manifest['cards']) == {'sorted'}
    assert repository.list_draws(LOTTERY, 1)[0]['drawOrderNumbers'] is None
    return repository, cards


def test_official_sorted_card_notifies_once_before_analysis_starts():
    repository, _ = published_repository()
    emitter = RecordingEmitter()
    builders = _builders()

    def explore(_):
        assert emitter.successful == [RESULT_KEY, CARD_KEY]
        return {'items': [], 'validationById': {}}

    builders['explore'] = explore
    result = run_analysis_only_worker(LOTTERY, repository, builders, notification_emitter=emitter)
    assert result['status'] == 'complete'
    assert emitter.successful == [RESULT_KEY, CARD_KEY, STATUS_KEY]


def test_already_completed_analysis_still_notifies_the_published_sorted_card():
    repository, _ = published_repository()
    _complete_analysis(repository)
    emitter = RecordingEmitter()
    result = run_analysis_only_worker(LOTTERY, repository, _builders(), notification_emitter=emitter)
    assert result['status'] == 'already-analyzed'
    assert emitter.successful == [RESULT_KEY, CARD_KEY, STATUS_KEY]


@pytest.mark.parametrize('unavailable', ['missing', 'preliminary', 'stale'])
def test_unpublished_unconfirmed_or_stale_sorted_card_does_not_notify(unavailable):
    repository, cards = published_repository()
    if unavailable == 'missing':
        cards.row['manifest'] = None
    else:
        draw = {'lottery': LOTTERY, **repository.list_draws(LOTTERY, 1)[0]}
        if unavailable == 'preliminary':
            repository.draws.pop((LOTTERY, PERIOD))
            repository.upsert_draw({**draw, 'resultStatus': 'preliminary'})
            # Even a successfully published preliminary sorted card must wait.
            service(repository, cards).ensure_current(LOTTERY, NOW)
        else:
            changed = ['01', '02', '03', '04', '05']
            repository.upsert_draw({**draw, 'numbers': changed, 'sortedNumbers': changed})
    cards.owner = 'another-publisher'
    emitter = RecordingEmitter()
    result = run_analysis_only_worker(LOTTERY, repository, _builders(), notification_emitter=emitter)
    assert result['status'] == 'complete'
    assert CARD_KEY not in emitter.attempts


def test_historical_analysis_notifies_only_the_latest_published_card(monkeypatch):
    repository, _ = published_repository()
    emitter = RecordingEmitter()
    monkeypatch.setattr(analysis_worker, '_select_analysis_draw', lambda draws, _: draws[1])
    result = run_analysis_only_worker(LOTTERY, repository, _builders(), notification_emitter=emitter)
    assert result['drawPeriod'] == '11987'
    assert emitter.successful == [RESULT_KEY, CARD_KEY]


def test_transient_card_notice_failure_retries_without_blocking_analysis():
    repository, _ = published_repository()
    emitter = RecordingEmitter(fail_delivery={CARD_KEY: 1})
    result = run_analysis_only_worker(LOTTERY, repository, _builders(), notification_emitter=emitter)
    assert result['status'] == 'complete'
    assert emitter.attempts.count(CARD_KEY) == 2
    assert emitter.successful == [RESULT_KEY, CARD_KEY, STATUS_KEY]
