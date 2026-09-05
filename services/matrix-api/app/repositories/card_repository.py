"""Durable publication state, separate from expiring analysis artifacts."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

BUCKET = 'matrix-card-png'
TABLE = 'matrix_card_publications'


class CardRepository(Protocol):
    def claim(self, lottery: str, token: str, now: datetime) -> dict[str, Any] | None: ...
    def update(self, lottery: str, token: str, values: dict[str, Any]) -> bool: ...
    def upload(self, path: str, png: bytes) -> str: ...
    def release(self, lottery: str, token: str, error: str | None = None) -> None: ...
    def read_manifest(self, lottery: str) -> dict[str, Any] | None: ...


class SupabaseCardRepository:
    def __init__(self, client: Any):
        self.client = client

    def claim(self, lottery: str, token: str, now: datetime) -> dict[str, Any] | None:
        # Production eligibility/leases use database time, not worker clocks.
        return self.client.rpc('claim_matrix_card_publication', {
            'p_lottery': lottery, 'p_token': token,
        }).execute().data or None

    def update(self, lottery: str, token: str, values: dict[str, Any]) -> bool:
        if 'manifest' in values:
            return bool(self.client.rpc('publish_matrix_card', {
                'p_lottery': lottery, 'p_token': token,
                'p_digest': values['manifest']['generation'],
                'p_manifest': values['manifest'],
            }).execute().data)
        return bool(self.client.rpc('observe_matrix_card_snapshot', {
            'p_lottery': lottery, 'p_token': token,
            'p_digest': values['desired_digest'], 'p_period': values['desired_period'],
        }).execute().data)

    def upload(self, path: str, png: bytes) -> str:
        bucket = self.client.storage.from_(BUCKET)
        try:
            bucket.upload(path, png, file_options={
                'content-type': 'image/png', 'cache-control': '31536000',
                'upsert': 'false',
            })
        except Exception as error:
            # A crashed generation may already have staged this immutable key.
            # Verify existing bytes before accepting a conflict; never overwrite.
            status = str(getattr(error, 'status', '') or getattr(error, 'statusCode', ''))
            if status not in {'409', '400'}:
                raise
            if bucket.download(path) != png:
                raise ValueError('MATRIX_CARD_OBJECT_CONFLICT') from error
        return bucket.get_public_url(path)

    def release(self, lottery: str, token: str, error: str | None = None) -> None:
        (self.client.table(TABLE).update({
            'lease_token': None, 'lease_until': None, 'last_error': error,
        }).eq('lottery', lottery).eq('lease_token', token).execute())

    def read_manifest(self, lottery: str) -> dict[str, Any] | None:
        rows = (self.client.table(TABLE).select('manifest')
                .eq('lottery', lottery).limit(1).execute().data)
        return rows[0]['manifest'] if rows else None


def card_repository(repository: Any) -> CardRepository | None:
    injected = getattr(repository, 'card_repository', None)
    if injected is not None:
        return injected
    client = getattr(repository, 'client', None)
    return SupabaseCardRepository(client) if client is not None else None


def published_manifest(lottery: str, repository: Any) -> dict[str, Any] | None:
    cards = card_repository(repository)
    return cards.read_manifest(lottery) if cards is not None else None


def is_card_published(lottery: str, period: str, repository: Any) -> bool:
    manifest = published_manifest(lottery, repository)
    return bool(manifest and manifest.get('period') == period)
