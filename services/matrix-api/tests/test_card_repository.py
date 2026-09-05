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
        ('claim_matrix_card_publication', {'p_lottery': '今彩539', 'p_token': 'token'}),
        ('observe_matrix_card_snapshot', {'p_lottery': '今彩539', 'p_token': 'token', 'p_digest': 'digest', 'p_period': '123'}),
        ('publish_matrix_card', {'p_lottery': '今彩539', 'p_token': 'token', 'p_digest': 'digest', 'p_manifest': manifest}),
    ]
