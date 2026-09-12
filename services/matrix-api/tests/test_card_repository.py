from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from storage3.exceptions import StorageApiError

from app.repositories.card_repository import SupabaseCardRepository


class Storage:
    def __init__(self, existing=None):
        self.existing = existing
        self.calls = []

    def upload(self, path, png, file_options):
        self.calls.append((path, png, file_options))
        if self.existing is not None:
            raise StorageApiError('Already exists', 'Duplicate', 409)

    def download(self, path):
        return self.existing

    def get_public_url(self, path):
        return f'https://project.supabase.co/storage/v1/object/public/matrix-card-png/{path}'


def test_upload_is_immutable_png_with_long_cache_and_content_checked_retry():
    storage = Storage(b'png')
    repo = SupabaseCardRepository(SimpleNamespace(storage=SimpleNamespace(from_=lambda _: storage)))
    assert repo.upload('generation/sorted.png', b'png').endswith('/generation/sorted.png')
    assert storage.calls == [('generation/sorted.png', b'png', {
        'content-type': 'image/png', 'cache-control': '31536000', 'upsert': 'false',
    })]
    with pytest.raises(ValueError, match='MATRIX_CARD_OBJECT_CONFLICT'):
        repo.upload('generation/sorted.png', b'changed')


class PrunableStorage(Storage):
    def __init__(self):
        super().__init__()
        self.removed = []
        self.listings = {
            '539': [
                {'name': '100'},
                {'name': '99'},
                {'name': '98'},
                {'name': '97'},
            ],
            '539/100': [
                {'name': 'current-generation'},
                {'name': 'stale-generation'},
            ],
            '539/97': [{'name': 'old-generation'}],
        }

    def list(self, path, options):
        rows = self.listings.get(path, [])
        offset = options['offset']
        return rows[offset:offset + options['limit']]

    def remove(self, paths):
        self.removed.extend(paths)
        return []


class PruneClient:
    def __init__(self, storage, renew_results=(True, True)):
        self.storage = SimpleNamespace(from_=lambda _: storage)
        self.renew_results = iter(renew_results)
        self.rpc_calls = []

    def rpc(self, name, parameters):
        self.rpc_calls.append((name, parameters))
        result = next(self.renew_results)
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=result))


def test_prune_removes_old_periods_and_stale_current_generation():
    storage = PrunableStorage()
    client = PruneClient(storage)
    repo = SupabaseCardRepository(client)
    repo.prune('今彩539', '100', 'current-generation', 'lease-token')
    assert set(storage.removed) == {
        '539/100/stale-generation/draw.png',
        '539/100/stale-generation/sorted.png',
        '539/97/old-generation/draw.png',
        '539/97/old-generation/sorted.png',
    }
    assert [name for name, _ in client.rpc_calls] == [
        'renew_matrix_card_cleanup_lease',
        'renew_matrix_card_cleanup_lease',
    ]
    assert all(parameters == {
        'p_lottery': '今彩539', 'p_token': 'lease-token',
        'p_period': '100', 'p_digest': 'current-generation',
    } for _, parameters in client.rpc_calls)


def test_prune_stops_before_delete_when_lease_is_lost_after_listing():
    storage = PrunableStorage()
    client = PruneClient(storage, renew_results=(True, False))
    repo = SupabaseCardRepository(client)
    with pytest.raises(RuntimeError, match='MATRIX_CARD_CLEANUP_LEASE_LOST'):
        repo.prune('今彩539', '100', 'current-generation', 'lease-token')
    assert storage.removed == []


def test_claim_observe_and_publish_use_the_server_guarded_rpcs():
    calls = []
    def rpc(name, parameters):
        calls.append((name, parameters))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data={'claimed_at': 'server-time'} if name.startswith('claim') else True))
    repo = SupabaseCardRepository(SimpleNamespace(rpc=rpc))
    assert repo.claim('今彩539', 'token', datetime(2000, 1, 1, tzinfo=UTC)) == {'claimed_at': 'server-time'}
    assert repo.update('今彩539', 'token', {'desired_digest': 'digest', 'desired_period': '123', 'eligible_at': 'client-time'})
    manifest = {'generation': 'digest'}
    assert repo.update('今彩539', 'token', {'manifest': manifest})
    assert calls == [
        ('claim_matrix_card_publication_v2', {'p_lottery': '今彩539', 'p_token': 'token'}),
        ('observe_matrix_card_snapshot', {'p_lottery': '今彩539', 'p_token': 'token', 'p_digest': 'digest', 'p_period': '123'}),
        ('publish_matrix_card', {'p_lottery': '今彩539', 'p_token': 'token', 'p_digest': 'digest', 'p_manifest': manifest}),
    ]


def test_prune_keeps_both_referenced_order_generations_and_removes_unreferenced_files():
    storage = PrunableStorage()
    storage.listings['539/100'] = [
        {'name': 'sorted-input'}, {'name': 'draw-input'}, {'name': 'obsolete-input'},
    ]
    client = PruneClient(storage)
    repo = SupabaseCardRepository(client)
    repo.prune('今彩539', '100', 'whole-snapshot', 'lease-token',
               keep_generations={'sorted-input', 'draw-input'})
    assert set(storage.removed) == {
        '539/100/obsolete-input/draw.png', '539/100/obsolete-input/sorted.png',
        '539/97/old-generation/draw.png', '539/97/old-generation/sorted.png',
    }
    assert all(parameters['p_digest'] == 'whole-snapshot' for _, parameters in client.rpc_calls)
