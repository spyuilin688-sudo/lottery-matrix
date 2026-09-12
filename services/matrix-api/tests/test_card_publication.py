from copy import deepcopy
from datetime import UTC, datetime, timedelta
from hashlib import sha256
import struct

import pytest

from app.card_renderer import CARD_HEIGHT, CARD_WIDTH, card_layout
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.card_publication import CardPublicationService, build_card_pngs, snapshot_digest

NOW = datetime(2026, 9, 5, tzinfo=UTC)
LOTTERIES = ['今彩539', '天天樂', '六合彩', '大樂透']


class MemoryCards:
    """A lease-aware fake transport; production storage is tested separately."""
    def __init__(self):
        self.row = {'desired_digest': None, 'eligible_at': None, 'manifest': None}
        self.owner = None
        self.objects = {}
        self.fail_order = None
        self.claims = 0
        self.prunes = []
        self.prune_error = None

    def claim(self, lottery, token, now):
        if self.owner is not None:
            return None
        self.owner = token
        self.claims += 1
        return {**deepcopy(self.row), 'claimed_at': now.isoformat()}

    def update(self, lottery, token, values):
        if token != self.owner:
            return False
        self.row.update(deepcopy(values))
        return True

    def upload(self, path, png):
        if path.endswith(f'{self.fail_order}.png'):
            raise RuntimeError('upload unavailable')
        if path in self.objects:
            assert self.objects[path] == png
        self.objects[path] = png
        return f'https://cards.example/{path}'

    def prune(self, lottery, current_period, keep_generation, lease_token, *, keep_generations=None):
        self.prunes.append((
            lottery, current_period, keep_generation, lease_token == self.owner,
        ))
        if self.prune_error is not None:
            raise self.prune_error

    def release(self, lottery, token, error=None):
        if self.owner == token:
            self.owner = None
            self.row['last_error'] = error

    def read_manifest(self, lottery):
        return deepcopy(self.row['manifest'])


def history(lottery='今彩539'):
    count = sum(card_layout(lottery)['column_rows'])
    numbers = ['39', '20', '11', '07', '01']
    if card_layout(lottery)['special']:
        numbers += ['42', '49']
    return [dict(lottery=lottery, period=str(10000 - i),
                 drawDate=(NOW - timedelta(days=i)).date().isoformat(),
                 numbers=numbers, sortedNumbers=sorted(numbers[:-1], key=int) + numbers[-1:]
                 if len(numbers) == 7 else sorted(numbers, key=int),
                 drawOrderNumbers=numbers) for i in range(count)]


def fixture(lottery='今彩539'):
    repository = InMemoryAnalysisRepository()
    for draw in history(lottery):
        repository.upsert_draw(draw)
    cards = MemoryCards()
    repository.card_repository = cards
    return repository, cards


def png_stub(lottery, draws, *, orders=None):
    # Valid header for orchestration tests; the real renderer is tested below.
    prefix = b'\x89PNG\r\n\x1a\n' + struct.pack('>I', 13) + b'IHDR' + struct.pack('>II', CARD_WIDTH, CARD_HEIGHT)
    selected = orders
    orders = ['sorted']
    if lottery != '天天樂' and all(
        row.get('resultStatus', 'confirmed') == 'confirmed' and row.get('drawOrderNumbers')
        for row in draws
    ):
        orders.insert(0, 'draw')
    return {order: prefix + sha256((order + snapshot_digest(lottery, draws)).encode()).digest()
            for order in orders if selected is None or order in selected}


def service(repository, cards, renderer=png_stub):
    return CardPublicationService(repository, cards, renderer=renderer)


def publish_initial(repository, cards):
    publisher = service(repository, cards)
    return publisher.ensure_current('今彩539', NOW)


def test_complete_snapshot_publishes_both_orders_immediately_once():
    repository, cards = fixture()
    publisher = service(repository, cards)
    manifest = publisher.ensure_current('今彩539', NOW)
    assert manifest['period'] == '10000'
    assert len(cards.objects) == 2
    assert all(item['mimeType'] == 'image/png' for item in manifest['cards'].values())
    assert all(item['inputDigest'] in item['url'] for item in manifest['cards'].values())
    objects = deepcopy(cards.objects)
    assert publisher.ensure_current('今彩539', NOW + timedelta(days=1)) == manifest
    assert cards.objects == objects


def test_successful_publication_prunes_to_latest_three_periods():
    repository, cards = fixture()
    manifest = publish_initial(repository, cards)
    assert cards.prunes == [
        ('今彩539', '10000', manifest['generation'], True),
    ]


def test_cleanup_failure_keeps_published_manifest_and_retries_without_rendering():
    repository, cards = fixture()
    cards.prune_error = RuntimeError('cleanup unavailable')
    publisher = service(repository, cards)
    manifest = publisher.ensure_current('今彩539', NOW)
    assert manifest == cards.read_manifest('今彩539')
    assert len(cards.prunes) == 1
    objects = deepcopy(cards.objects)

    cards.prune_error = None
    assert publisher.ensure_current('今彩539', NOW + timedelta(minutes=11)) == manifest
    assert len(cards.prunes) == 2
    assert cards.objects == objects


def test_cleanup_retry_runs_before_observing_a_changed_snapshot():
    repository, cards = fixture()
    cards.prune_error = RuntimeError('cleanup unavailable')
    manifest = publish_initial(repository, cards)
    assert len(cards.prunes) == 1

    changed = history()[0]
    changed['period'] = '10001'
    repository.upsert_draw(changed)
    cards.prune_error = None
    updated = service(repository, cards).ensure_current(
        '今彩539', NOW + timedelta(minutes=11),
    )
    assert updated['period'] == '10001'
    assert len(cards.prunes) == 3
    assert cards.prunes[-2][1] == manifest['period']


def test_historical_correction_creates_a_new_generation_immediately():
    repository, cards = fixture()
    old = publish_initial(repository, cards)
    changed = history()[30]
    changed['drawOrderNumbers'] = ['38', '20', '11', '07', '01']
    changed['numbers'] = changed['drawOrderNumbers']
    changed['sortedNumbers'] = sorted(changed['numbers'], key=int)
    repository.upsert_draw(changed)
    publisher = service(repository, cards)
    new = publisher.ensure_current('今彩539', NOW + timedelta(hours=1))
    assert new['period'] == old['period']
    assert new['generation'] != old['generation']
    assert len(cards.objects) == 4


def test_second_upload_failure_preserves_old_manifest_and_retry_finishes_same_files():
    repository, cards = fixture()
    old = publish_initial(repository, cards)
    changed = history()[0]
    changed['period'] = '10001'
    repository.upsert_draw(changed)
    publisher = service(repository, cards)
    cards.fail_order = 'sorted'
    with pytest.raises(RuntimeError, match='upload unavailable'):
        publisher.ensure_current('今彩539', NOW + timedelta(hours=1, minutes=10))
    assert cards.read_manifest('今彩539') == old
    assert cards.owner is None
    cards.fail_order = None
    new = publisher.ensure_current('今彩539', NOW + timedelta(hours=1, minutes=15))
    assert new['period'] == '10001'
    assert len(cards.objects) == 4


def test_source_change_while_rendering_never_publishes_stale_snapshot():
    repository, cards = fixture()
    def race(lottery, draws, *, orders=None):
        changed = history()[0]
        changed['period'] = '10001'
        repository.upsert_draw(changed)
        return png_stub(lottery, draws, orders=orders)
    assert service(repository, cards, race).ensure_current('今彩539', NOW + timedelta(minutes=10)) is None
    assert cards.row['manifest'] is None


def test_replaced_lease_cannot_publish_or_release_new_owner():
    repository, cards = fixture()
    def race(lottery, draws, *, orders=None):
        cards.owner = 'replacement-owner'
        return png_stub(lottery, draws, orders=orders)
    assert service(repository, cards, race).ensure_current('今彩539', NOW + timedelta(minutes=10)) is None
    assert cards.row['manifest'] is None
    assert cards.owner == 'replacement-owner'


@pytest.mark.parametrize('invalid', ['missing_row', 'missing_ball', 'duplicate_ball', 'bad_date'])
def test_incomplete_or_invalid_history_does_not_publish(invalid):
    repository, cards = fixture()
    if invalid == 'missing_row':
        repository.draws.pop(('今彩539', '10000'))
    else:
        draw = history()[0]
        if invalid == 'missing_ball':
            draw['drawOrderNumbers'] = ['01']
        elif invalid == 'duplicate_ball':
            draw['drawOrderNumbers'] = ['01'] * 5
        else:
            draw['drawDate'] = 'invalid'
        # Exercise the reader against a corrupt stored fixture; ingestion rejects invalid dates.
        repository.draws[(draw['lottery'], draw['period'])] = draw
    assert service(repository, cards).ensure_current('今彩539', NOW) is None
    assert cards.row['desired_digest'] is None
    assert cards.objects == {}


@pytest.mark.parametrize('lottery', LOTTERIES)
def test_real_png_renderer_produces_supported_fixed_size_deterministic_files(lottery):
    draws = history(lottery)
    output = build_card_pngs(lottery, draws)
    assert set(output) == ({'sorted'} if lottery == '天天樂' else {'draw', 'sorted'})
    assert output == build_card_pngs(lottery, draws)
    if 'draw' in output:
        assert output['draw'] != output['sorted']
    for png in output.values():
        assert png[:8] == b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II', png[16:24]) == (2276, 3438)
        assert len(png) > 10000


def test_png_manifest_validates_current_snapshot_without_rendering_history(monkeypatch):
    from app.api_server import handle_api_request
    import app.api_server as api
    repository, cards = fixture()
    manifest = publish_initial(repository, cards)
    monkeypatch.setattr(api, 'render_matrix_card', lambda *_: pytest.fail('manifest rendered'))
    status, actual = handle_api_request('GET', '/api/matrix/cards/%E4%BB%8A%E5%BD%A9539?format=png', None, repository)
    assert status == 200
    assert actual == manifest


def test_png_manifest_has_no_phantom_latest_period_before_publication():
    from app.api_server import handle_api_request
    repository, _ = fixture()
    status, manifest = handle_api_request('GET', '/api/matrix/cards/%E4%BB%8A%E5%BD%A9539?format=png', None, repository)
    assert status == 200
    assert manifest == {'lottery': '今彩539', 'period': None, 'cards': {}}


def test_scheduled_not_due_branch_notifies_published_actual_card_without_analysis(monkeypatch):
    import app.worker as worker
    from types import SimpleNamespace
    repository, cards = fixture()
    publisher = service(repository, cards)
    publisher.ensure_current('今彩539', NOW)
    monkeypatch.setattr(worker, 'publish_current_card', lambda lottery, repo, now=None: publisher.ensure_current(lottery, NOW + timedelta(minutes=10)), raising=False)
    monkeypatch.setattr(worker, 'due_call_cycle', lambda *_: None)
    monkeypatch.setattr(worker, '_resume_stored_analysis', lambda *_, **__: None)
    events = []
    emitter = SimpleNamespace(enabled=True, emit=lambda e: events.append(e))
    result = worker.run_scheduled_worker('今彩539', NOW, repository, None, notification_emitter=emitter)
    assert result['status'] == 'not-due'
    assert cards.row['manifest']['period'] == '10000'
    assert [e['eventType'] for e in events] == ['lottery_result', 'matrix_card']


def test_analysis_backlog_notifies_latest_published_fantasy5_card_before_analysis(monkeypatch):
    import app.analysis_worker as worker
    from types import SimpleNamespace
    repository, cards = fixture('天天樂')
    publisher = service(repository, cards)
    publisher.ensure_current('天天樂', NOW)
    monkeypatch.setattr(worker, 'publish_current_card', lambda lottery, repo: publisher.ensure_current(lottery, NOW + timedelta(minutes=10)), raising=False)
    monkeypatch.setattr(worker, '_select_analysis_draw', lambda draws, _: draws[1])
    monkeypatch.setattr(worker, '_run_analysis', lambda *_: {'status': 'running'})
    events = []
    emitter = SimpleNamespace(enabled=True, emit=lambda e: events.append(e))
    worker.run_analysis_only_worker('天天樂', repository, notification_emitter=emitter)
    assert cards.row['manifest']['period'] == '10000'
    assert [e['eventKey'] for e in events if e['eventType'] == 'matrix_card'] == ['matrix_card:fantasy5:10000']
    assert all(e['payload']['period'] == '10000' for e in events)


def test_card_notifications_retry_only_published_period(monkeypatch):
    import app.worker as worker
    from types import SimpleNamespace
    repository, cards = fixture()
    publish_initial(repository, cards)
    version = f'10000:{worker.ANALYSIS_VERSION}'
    repository.begin_run('今彩539', '10000', version, NOW.isoformat())
    for kind in ('explore', 'tianheng', 'tianyan', 'tiangong', 'status'):
        repository.save_artifact('今彩539', '10000', version, kind, {'summary': {'status': 'DORMANT'}} if kind == 'status' else {})
    repository.complete_run('今彩539', '10000', version, NOW.isoformat())
    events = []
    emitter = SimpleNamespace(enabled=True, emit=lambda e: events.append(e))
    for _ in range(2):
        worker.emit_ready_notifications('今彩539', '10000', repository, emitter, set())
    assert [e['eventKey'] for e in events if e['eventType'] == 'matrix_card'] == ['matrix_card:539:10000'] * 2
    changed = history()[0]
    changed['period'] = '10001'
    repository.upsert_draw(changed)
    events.clear()
    worker.emit_ready_notifications('今彩539', '10001', repository, emitter, set())
    assert not any(e['eventType'] == 'matrix_card' for e in events)


def test_internal_period_gap_is_rejected_even_when_older_rows_fill_the_count():
    repository, cards = fixture()
    older = history()[-1]
    older['period'] = '9773'
    older['drawDate'] = (NOW - timedelta(days=227)).date().isoformat()
    repository.upsert_draw(older)
    repository.draws.pop(('今彩539', '9970'))
    assert len(repository.list_draws('今彩539', 227)) == 227
    assert service(repository, cards).ensure_current('今彩539', NOW) is None
    assert cards.row['desired_digest'] is None
