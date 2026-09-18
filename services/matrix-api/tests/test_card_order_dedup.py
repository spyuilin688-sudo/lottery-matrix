from copy import deepcopy
from datetime import timedelta

import pytest

from app.repositories.card_repository import published_manifest
from app.services.card_publication import build_card_pngs
from tests.test_card_publication import NOW, complete_analysis, fixture, history, png_stub, service
from tests.test_card_two_stage import preliminary


def recording_renderer(calls):
    def render(lottery, draws, *, orders=None):
        pngs = png_stub(lottery, draws, orders=orders)
        calls.extend(pngs)
        return pngs
    return render


@pytest.mark.parametrize('lottery', ['今彩539', '六合彩', '大樂透'])
def test_confirmation_renders_and_uploads_only_actual_and_repeats_do_no_work(lottery):
    repository, cards = fixture(lottery)
    preliminary(repository, lottery)
    calls = []
    publisher = service(repository, cards, recording_renderer(calls))
    first = publisher.ensure_current(lottery, NOW)
    repository.upsert_draw({**history(lottery)[0], 'resultStatus': 'confirmed'})
    complete_analysis(repository, lottery)
    confirmed = publisher.ensure_current(lottery, NOW + timedelta(seconds=1))
    assert calls == ['sorted', 'draw']
    assert len(cards.objects) == 2
    assert confirmed['cards']['sorted'] == first['cards']['sorted']
    assert confirmed['generation'] != first['generation']
    assert published_manifest(lottery, repository) == confirmed
    assert publisher.ensure_current(lottery, NOW + timedelta(seconds=2)) == confirmed
    assert calls == ['sorted', 'draw']
    assert len(cards.objects) == 2


def test_actual_order_correction_only_renders_actual_but_number_correction_renders_both():
    repository, cards = fixture()
    calls = []
    publisher = service(repository, cards, recording_renderer(calls))
    first = publisher.ensure_current('今彩539', NOW)
    corrected = deepcopy(history()[0])
    corrected['drawOrderNumbers'] = list(reversed(corrected['drawOrderNumbers']))
    repository.upsert_draw(corrected)
    complete_analysis(repository)
    second = publisher.ensure_current('今彩539', NOW + timedelta(seconds=1))
    assert calls == ['draw', 'sorted', 'draw']
    assert second['cards']['sorted'] == first['cards']['sorted']
    corrected = deepcopy(corrected)
    for key in ('numbers', 'sortedNumbers', 'drawOrderNumbers'):
        corrected[key] = ['02' if n == '01' else n for n in corrected[key]]
    repository.upsert_draw(corrected)
    complete_analysis(repository)
    third = publisher.ensure_current('今彩539', NOW + timedelta(seconds=2))
    assert calls == ['draw', 'sorted', 'draw', 'draw', 'sorted']
    assert third['cards']['sorted'] != second['cards']['sorted']


@pytest.mark.parametrize('field,value', [('period', '10001'), ('drawDate', '2026-09-06')])
def test_new_period_or_date_correction_rebuilds_both_orders(field, value):
    repository, cards = fixture()
    calls = []
    publisher = service(repository, cards, recording_renderer(calls))
    first = publisher.ensure_current('今彩539', NOW)
    corrected = {**history()[0], field: value}
    if field == 'period':
        corrected['drawDate'] = '2026-09-06'
        repository.upsert_draw(corrected)
    else:
        # Check publication after a persisted data repair, independently of
        # ingestion's rejection of conflicting confirmed dates.
        repository.draws[('今彩539', corrected['period'])] = corrected
    complete_analysis(repository)
    second = publisher.ensure_current('今彩539', NOW + timedelta(seconds=1))
    assert calls == ['draw', 'sorted', 'draw', 'sorted']
    assert second['cards']['sorted'] != first['cards']['sorted']


def test_fantasy5_repeated_publication_has_only_one_sorted_render_and_upload():
    repository, cards = fixture('天天樂')
    calls = []
    publisher = service(repository, cards, recording_renderer(calls))
    first = publisher.ensure_current('天天樂', NOW)
    assert publisher.ensure_current('天天樂', NOW + timedelta(seconds=1)) == first
    assert calls == ['sorted']
    assert len(cards.objects) == 1
    assert set(first['cards']) == {'sorted'}


def test_invalid_reuse_metadata_is_repaired_instead_of_treated_as_complete():
    repository, cards = fixture()
    calls = []
    publisher = service(repository, cards, recording_renderer(calls))
    first = publisher.ensure_current('今彩539', NOW)
    cards.row['manifest']['cards']['sorted']['inputDigest'] = '0' * 64
    assert published_manifest('今彩539', repository) is None
    repaired = publisher.ensure_current('今彩539', NOW + timedelta(seconds=1))
    assert calls == ['draw', 'sorted', 'sorted']
    assert repaired['cards'] == first['cards']


def test_confirmation_without_actual_updates_manifest_without_sorted_render():
    repository, cards = fixture()
    draw = preliminary(repository)
    calls = []
    publisher = service(repository, cards, recording_renderer(calls))
    first = publisher.ensure_current('今彩539', NOW)
    repository.upsert_draw({**draw, 'resultStatus': 'confirmed'})
    confirmed = publisher.ensure_current('今彩539', NOW + timedelta(seconds=1))
    assert confirmed['generation'] != first['generation']
    assert confirmed['cards'] == first['cards']
    assert calls == ['sorted']
    assert len(cards.objects) == 1


def test_real_renderer_can_render_only_requested_actual_order():
    assert set(build_card_pngs('今彩539', history(), orders=('draw',))) == {'draw'}
    with pytest.raises(ValueError, match='MATRIX_CARD_ORDER_UNAVAILABLE'):
        build_card_pngs('天天樂', history('天天樂'), orders=('draw',))
