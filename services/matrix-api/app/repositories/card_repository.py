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
    def prune(self, lottery: str, current_period: str,
              keep_generation: str, lease_token: str, *,
              keep_generations: set[str] | None = None) -> None: ...
    def release(self, lottery: str, token: str, error: str | None = None) -> None: ...
    def read_state(self, lottery: str) -> dict[str, Any]: ...
    def read_manifest(self, lottery: str) -> dict[str, Any] | None: ...


class SupabaseCardRepository:
    def __init__(self, client: Any):
        self.client = client

    def claim(self, lottery: str, token: str, now: datetime) -> dict[str, Any] | None:
        # Production eligibility/leases use database time, not worker clocks.
        return self.client.rpc('claim_matrix_card_publication_v2', {
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

    @staticmethod
    def _list_all(bucket: Any, path: str) -> list[dict[str, Any]]:
        rows = []
        offset = 0
        while True:
            page = bucket.list(path, options={
                'limit': 100, 'offset': offset,
                'sortBy': {'column': 'name', 'order': 'asc'},
            })
            rows.extend(page)
            if len(page) < 100:
                return rows
            offset += len(page)

    def _renew_cleanup_lease(self, lottery: str, current_period: str,
                             keep_generation: str, lease_token: str) -> None:
        renewed = self.client.rpc('renew_matrix_card_cleanup_lease', {
            'p_lottery': lottery, 'p_token': lease_token,
            'p_period': current_period, 'p_digest': keep_generation,
        }).execute().data
        if not renewed:
            raise RuntimeError('MATRIX_CARD_CLEANUP_LEASE_LOST')

    def prune(self, lottery: str, current_period: str,
              keep_generation: str, lease_token: str, *,
              keep_generations: set[str] | None = None) -> None:
        current_generations = keep_generations if keep_generations is not None else {keep_generation}
        code = {
            '今彩539': '539', '天天樂': 'fantasy5',
            '六合彩': 'marksix', '大樂透': 'lotto649',
        }[lottery]
        self._renew_cleanup_lease(
            lottery, current_period, keep_generation, lease_token,
        )
        bucket = self.client.storage.from_(BUCKET)
        periods = [
            str(item.get('name', ''))
            for item in self._list_all(bucket, code)
            if str(item.get('name', '')).isdigit()
        ]
        retained = set(sorted(
            (period for period in periods if int(period) <= int(current_period)),
            key=int, reverse=True,
        )[:3])
        paths = []
        for period in periods:
            if period in retained and period != current_period:
                continue
            for generation_item in self._list_all(bucket, f'{code}/{period}'):
                generation = str(generation_item.get('name', ''))
                if not generation or (period == current_period
                                      and generation in current_generations):
                    continue
                base = f'{code}/{period}/{generation}'
                paths.extend((f'{base}/draw.png', f'{base}/sorted.png'))
        for offset in range(0, len(paths), 100):
            self._renew_cleanup_lease(
                lottery, current_period, keep_generation, lease_token,
            )
            bucket.remove(paths[offset:offset + 100])

    def release(self, lottery: str, token: str, error: str | None = None) -> None:
        (self.client.table(TABLE).update({
            'lease_token': None, 'lease_until': None, 'last_error': error,
        }).eq('lottery', lottery).eq('lease_token', token).execute())

    def read_state(self, lottery: str) -> dict[str, Any]:
        rows = (self.client.table(TABLE).select('manifest,last_error,desired_digest,desired_period')
                .eq('lottery', lottery).limit(1).execute().data)
        if not rows:
            return {'manifest': None, 'last_error': None, 'desired_digest': None,
                    'desired_period': None}
        row = rows[0]
        return {
            'manifest': row.get('manifest'),
            'last_error': row.get('last_error'),
            'desired_digest': row.get('desired_digest'),
            'desired_period': row.get('desired_period'),
        }

    def read_manifest(self, lottery: str) -> dict[str, Any] | None:
        return self.read_state(lottery)['manifest']


def card_repository(repository: Any) -> CardRepository | None:
    injected = getattr(repository, 'card_repository', None)
    if injected is not None:
        return injected
    client = getattr(repository, 'client', None)
    return SupabaseCardRepository(client) if client is not None else None


def validate_published_manifest(
    lottery: str,
    repository: Any,
    manifest: dict[str, Any] | None,
    *,
    require_all_orders: bool = False,
) -> dict[str, Any] | None:
    if not manifest:
        return None
    # Import locally because the publisher depends on the storage transport.
    from app.card_renderer import card_layout
    from app.services.card_publication import (
        complete_snapshot, order_input_digest, publication_orders, reusable_card, snapshot_digest,
    )

    draws = repository.list_draws(lottery, sum(card_layout(lottery)['column_rows']))
    if (not complete_snapshot(lottery, draws)
            or manifest.get('period') != str(draws[0]['period'])
            or manifest.get('generation') != snapshot_digest(lottery, draws)):
        return None
    available = manifest.get('cards', {})
    orders = publication_orders(lottery, draws, repository)
    if not isinstance(available, dict) or 'sorted' not in available:
        return None
    for order in orders:
        card = available.get(order)
        if card is None:
            if require_all_orders:
                return None
            continue
        if not isinstance(card, dict):
            return None
        if 'inputDigest' in card:
            if not reusable_card(
                card, lottery, str(draws[0]['period']), order,
                order_input_digest(lottery, order, draws),
            ):
                return None
        elif require_all_orders:
            # Legacy manifests can still be served, but are not strong enough to
            # prove that a no-op publication tick is safe.
            return None
    return {**manifest, 'cards': {order: available[order] for order in orders if order in available}}


def published_manifest(lottery: str, repository: Any) -> dict[str, Any] | None:
    cards = card_repository(repository)
    manifest = cards.read_manifest(lottery) if cards is not None else None
    return validate_published_manifest(lottery, repository, manifest)


def is_card_published(lottery: str, period: str, repository: Any, *, order: str = 'draw') -> bool:
    manifest = published_manifest(lottery, repository)
    return bool(manifest and manifest.get('period') == period
                and manifest.get('cards', {}).get(order))
