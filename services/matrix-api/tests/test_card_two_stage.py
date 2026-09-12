from copy import deepcopy
from datetime import timedelta

import pytest

from app.card_renderer import _build_rows
from app.repositories.card_repository import is_card_published, published_manifest
from app.services.card_publication import build_card_pngs, snapshot_digest
from tests.test_card_publication import NOW, fixture, history, png_stub, service


def preliminary(repository, lottery='今彩539'):
    draw = history(lottery)[0]
    draw.update(resultStatus='preliminary', drawOrderNumbers=None)
    # This period has not been formally acquired; keep the earlier history.
    repository.draws.pop((lottery, draw['period']))
    repository.upsert_draw(draw)
    return draw


def available_pngs(lottery, draws):
    output = png_stub(lottery, draws)
    if lottery == '天天樂' or any(
        row.get('resultStatus', 'confirmed') != 'confirmed' or not row.get('drawOrderNumbers')
        for row in draws
    ):
        output.pop('draw', None)
    return output


def test_preliminary_sorted_card_is_downloadable_in_the_first_publication_call():
    repository, cards = fixture()
    preliminary(repository)
    manifest = service(repository, cards, available_pngs).ensure_current('今彩539', NOW)
    assert manifest is not None
    assert manifest['period'] == '10000'
    assert set(manifest['cards']) == {'sorted'}
    assert len(cards.objects) == 1
    assert published_manifest('今彩539', repository) == manifest
    assert not is_card_published('今彩539', '10000', repository)


def test_confirmation_publishes_actual_order_as_a_new_immutable_generation_immediately():
    repository, cards = fixture()
    preliminary(repository)
    publisher = service(repository, cards, available_pngs)
    first = publisher.ensure_current('今彩539', NOW)
    repository.upsert_draw({**history()[0], 'resultStatus': 'confirmed'})
    confirmed = publisher.ensure_current('今彩539', NOW + timedelta(seconds=1))
    assert first is not None and confirmed is not None
    assert confirmed['period'] == first['period']
    assert confirmed['generation'] != first['generation']
    assert set(confirmed['cards']) == {'draw', 'sorted'}
    assert is_card_published('今彩539', '10000', repository)


def test_result_confirmation_is_part_of_the_snapshot_even_when_numbers_do_not_change():
    draws = history()
    first = snapshot_digest('今彩539', draws)
    draws[0]['resultStatus'] = 'preliminary'
    assert snapshot_digest('今彩539', draws) != first
    draws[0]['resultStatus'] = 'confirmed'
    assert snapshot_digest('今彩539', draws) == first


@pytest.mark.parametrize('change', ['new_period', 'correction', 'unconfirmed'])
def test_stale_manifest_is_hidden_even_if_another_worker_owns_the_lease(change):
    repository, cards = fixture()
    publisher = service(repository, cards, available_pngs)
    publisher.ensure_current('今彩539', NOW)
    publisher.ensure_current('今彩539', NOW + timedelta(minutes=10))
    assert cards.read_manifest('今彩539') is not None
    draw = history()[0]
    if change == 'new_period':
        draw['period'] = '10001'
    elif change == 'correction':
        draw['drawOrderNumbers'] = list(reversed(draw['drawOrderNumbers']))
    else:
        draw['resultStatus'] = 'preliminary'
    # A stored correction must invalidate reads independently of ingestion's
    # safeguard against replacing an already confirmed draw with preliminary data.
    repository.draws[('今彩539', draw['period'])] = draw
    cards.owner = 'another-worker'
    assert published_manifest('今彩539', repository) is None
    assert publisher.ensure_current('今彩539', NOW + timedelta(minutes=11)) is None
    assert not is_card_published('今彩539', '10000', repository)


def test_historical_actual_order_gap_keeps_sorted_available_without_substitution():
    repository, cards = fixture()
    draw = history()[40]
    draw['drawOrderNumbers'] = None
    repository.upsert_draw(draw)
    manifest = service(repository, cards, available_pngs).ensure_current('今彩539', NOW)
    assert manifest is not None
    assert set(manifest['cards']) == {'sorted'}


@pytest.mark.parametrize('status,actual', [
    ('confirmed', None), ('confirmed', []), ('preliminary', ['39', '20', '11', '07', '01']),
])
def test_renderer_never_substitutes_sorted_numbers_for_missing_or_unconfirmed_actual(status, actual):
    draw = {**history()[0], 'resultStatus': status, 'drawOrderNumbers': actual}
    rows = _build_rows('今彩539', (1,), 1, [draw], 'draw', False)
    assert rows[0][0]['values'] == []


def test_sorted_only_official_lottery_never_gets_an_actual_png_or_notification_readiness():
    repository, cards = fixture('天天樂')
    manifest = service(repository, cards, available_pngs).ensure_current('天天樂', NOW)
    assert manifest is not None
    assert set(manifest['cards']) == {'sorted'}
    assert not is_card_published('天天樂', '10000', repository)


def test_sorted_only_official_lottery_does_not_render_numbers_as_actual_order():
    rows = _build_rows('天天樂', (1,), 1, history('天天樂')[:1], 'draw', False)
    assert rows[0][0]['values'] == []


def test_empty_actual_order_still_allows_the_complete_sorted_card():
    repository, cards = fixture()
    draw = preliminary(repository)
    draw['drawOrderNumbers'] = []
    repository.upsert_draw(draw)
    manifest = service(repository, cards, available_pngs).ensure_current('今彩539', NOW)
    assert manifest is not None
    assert set(manifest['cards']) == {'sorted'}


@pytest.mark.parametrize('lottery,preliminary_result', [('今彩539', True), ('天天樂', False)])
def test_real_renderer_generates_only_supported_orders(lottery, preliminary_result):
    draws = deepcopy(history(lottery))
    if preliminary_result:
        draws[0].update(resultStatus='preliminary', drawOrderNumbers=None)
    assert set(build_card_pngs(lottery, draws)) == {'sorted'}
