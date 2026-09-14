"""Publish current immutable PNGs as sorted and formal actual orders become available."""
from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime
from functools import lru_cache
from hashlib import sha256
import json
import logging
from pathlib import Path
import re
import struct
from typing import Any
from uuid import uuid4

from app import card_renderer
from app.card_renderer import CARD_HEIGHT, CARD_WIDTH, card_layout, render_matrix_card, supported_card_orders
from app.repositories.card_repository import CardRepository, card_repository, published_manifest
from app.services.draw_refresh import require_complete_history

LOGGER = logging.getLogger(__name__)
FONT_DIR = Path(__file__).resolve().parents[1] / 'fonts'
FONT_FILES = tuple(sorted([*FONT_DIR.glob('*.otf'), *FONT_DIR.glob('*.ttf')]))
LOTTERY_CODES = {'今彩539': '539', '天天樂': 'fantasy5', '六合彩': 'marksix', '大樂透': 'lotto649'}


def publication_orders(lottery: str, draws: list[dict[str, Any]], repository: Any) -> tuple[str, ...]:
    if not draws:
        return ()
    orders = supported_card_orders(lottery, draws)
    if 'draw' not in orders:
        return orders
    # Import at call time: worker orchestration also imports this publisher.
    from app.domain.explore_state import DRAW_ORDER
    from app.worker import analysis_version_for_order

    period = str(draws[0]['period'])
    progress = repository.get_progress(lottery, period, analysis_version_for_order(period, DRAW_ORDER))
    if progress is None or progress.get('status') != 'complete':
        return tuple(order for order in orders if order != 'draw')
    return orders


@lru_cache(maxsize=1)
def renderer_digest() -> str:
    digest = sha256(b'matrix-static-png-v1:resvg-py==0.5.0')
    digest.update(Path(card_renderer.__file__).read_bytes())
    digest.update(Path(__file__).read_bytes())
    for font in FONT_FILES:
        digest.update(font.name.encode())
        digest.update(font.read_bytes())
    return digest.hexdigest()


def snapshot_digest(lottery: str, draws: list[dict[str, Any]]) -> str:
    payload = {'lottery': lottery, 'renderer': renderer_digest(), 'draws': [
        {**{key: row.get(key) for key in (
            'period', 'drawDate', 'numbers', 'sortedNumbers', 'drawOrderNumbers',
        )}, 'resultStatus': row.get('resultStatus', 'confirmed')} for row in draws
    ]}
    return sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':')).encode()).hexdigest()


def order_input_digest(lottery: str, order: str, draws: list[dict[str, Any]]) -> str:
    """Identity of one image's inputs, independent of the other order's arrival."""
    special = card_layout(lottery)['special']
    payload = {'lottery': lottery, 'order': order, 'renderer': renderer_digest(),
               'draws': [{'period': str(row['period']), 'drawDate': row['drawDate'],
                          'numbers': card_renderer._numbers(row, order, special)}
                         for row in draws]}
    return sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':')).encode()).hexdigest()


def reusable_card(card: Any, lottery: str, period: str, order: str, digest: str) -> bool:
    return bool(isinstance(card, dict) and card.get('inputDigest') == digest
                and card.get('mimeType') == 'image/png'
                and card.get('width') == CARD_WIDTH and card.get('height') == CARD_HEIGHT
                and re.fullmatch(r'[0-9a-f]{64}', str(card.get('sha256', '')))
                and isinstance(card.get('url'), str) and card['url'].startswith('https://')
                and card['url'].endswith(f'/{LOTTERY_CODES[lottery]}/{period}/{digest}/{order}.png'))


def complete_snapshot(lottery: str, draws: list[dict[str, Any]]) -> bool:
    layout = card_layout(lottery)
    if len(draws) != sum(layout['column_rows']):
        return False
    periods = set()
    maximum = 39 if lottery in {'今彩539', '天天樂'} else 49
    for row in draws:
        period = str(row.get('period', ''))
        if not re.fullmatch(r'[0-9]{1,20}', period) or period in periods:
            return False
        periods.add(period)
        try:
            date.fromisoformat(str(row.get('drawDate', '')).replace('/', '-').replace('.', '-'))
            variants = [row.get('numbers'), row.get('sortedNumbers') or row.get('numbers')]
            if row.get('drawOrderNumbers') not in (None, []):
                variants.append(row['drawOrderNumbers'])
            sets = []
            for variant in variants:
                if not isinstance(variant, list) or len(variant) != layout['balls']:
                    return False
                values = [int(str(value)) for value in variant]
                if len(set(values)) != layout['balls'] or any(n < 1 or n > maximum for n in values):
                    return False
                sets.append(set(values))
            if any(values != sets[0] for values in sets[1:]):
                return False
            if layout['special'] and any(int(str(v[-1])) != int(str(variants[0][-1])) for v in variants):
                return False
        except (ValueError, TypeError):
            return False
    try:
        require_complete_history(lottery, draws)
    except ValueError:
        return False
    return True


def validate_png(png: bytes) -> None:
    if (len(png) < 24 or png[:8] != b'\x89PNG\r\n\x1a\n'
            or png[12:16] != b'IHDR'
            or struct.unpack('>II', png[16:24]) != (CARD_WIDTH, CARD_HEIGHT)):
        raise ValueError('MATRIX_CARD_INVALID_PNG')


def build_card_pngs(lottery: str, draws: list[dict[str, Any]], *,
                   orders: tuple[str, ...] | None = None) -> dict[str, bytes]:
    import resvg_py

    result = {}
    if len(FONT_FILES) != 4:
        raise ValueError('MATRIX_CARD_FONTS_MISSING')
    supported = supported_card_orders(lottery, draws)
    selected = supported if orders is None else orders
    if len(set(selected)) != len(selected) or any(order not in supported for order in selected):
        raise ValueError('MATRIX_CARD_ORDER_UNAVAILABLE')
    for order in selected:
        svg = render_matrix_card(lottery, order, draws)
        svg = svg.replace(card_renderer.CJK_FONT_FAMILY, 'Matrix Card TC')
        svg = svg.replace('font-family="Arial"', 'font-family="Matrix Card Sans"')
        png = resvg_py.svg_to_bytes(
            svg_string=svg, width=CARD_WIDTH, height=CARD_HEIGHT,
            skip_system_fonts=True, font_files=[str(path) for path in FONT_FILES],
            font_family='Matrix Card Sans', sans_serif_family='Matrix Card Sans',
        )
        validate_png(png)
        result[order] = png
    return result


class CardPublicationService:
    def __init__(self, repository: Any, cards: CardRepository, *,
                 renderer: Callable = build_card_pngs):
        self.repository = repository
        self.cards = cards
        self.renderer = renderer

    def _prune(self, lottery: str, manifest: dict[str, Any],
               lease_token: str) -> None:
        try:
            self.cards.prune(
                lottery, manifest['period'], manifest['generation'], lease_token,
                keep_generations={card.get('inputDigest', manifest['generation'])
                                  for card in manifest['cards'].values()},
            )
        except Exception as error:
            # Publication is already durable; retry cleanup on the next tick.
            LOGGER.warning('Matrix card cleanup failed for %s (%s)',
                           lottery, type(error).__name__)

    def ensure_current(self, lottery: str, now: datetime | None = None) -> dict[str, Any] | None:
        now = now or datetime.now(UTC)
        token = str(uuid4())
        state = self.cards.claim(lottery, token, now)
        if state is None:
            return published_manifest(lottery, self.repository)
        error_code = None
        try:
            now = datetime.fromisoformat(state['claimed_at'])
            manifest = state['manifest']
            if manifest:
                self._prune(lottery, manifest, token)
            count = sum(card_layout(lottery)['column_rows'])
            draws = self.repository.list_draws(lottery, count)
            if not complete_snapshot(lottery, draws):
                return None
            digest = snapshot_digest(lottery, draws)
            orders = publication_orders(lottery, draws, self.repository)
            period = str(draws[0]['period'])
            inputs = {order: order_input_digest(lottery, order, draws) for order in orders}
            previous = manifest.get('cards', {}) if manifest else {}
            files = {order: previous[order] for order in orders
                     if reusable_card(previous.get(order), lottery, period, order, inputs[order])}
            if (manifest and manifest['generation'] == digest
                    and set(previous) == set(orders) == set(files)):
                return manifest
            if state['desired_digest'] != digest:
                if not self.cards.update(lottery, token, {
                    'desired_digest': digest, 'desired_period': str(draws[0]['period']),
                    'eligible_at': now.isoformat(),
                }):
                    return published_manifest(lottery, self.repository)
            pending = tuple(order for order in orders if order not in files)
            pngs = self.renderer(lottery, draws, orders=pending) if pending else {}
            if set(pngs) != set(pending):
                raise ValueError('MATRIX_CARD_ORDERS_INCOMPLETE')
            for png in pngs.values():
                validate_png(png)
            for order in pending:
                png = pngs[order]
                path = f'{LOTTERY_CODES[lottery]}/{period}/{inputs[order]}/{order}.png'
                files[order] = {
                    'url': self.cards.upload(path, png), 'mimeType': 'image/png',
                    'width': CARD_WIDTH, 'height': CARD_HEIGHT, 'sha256': sha256(png).hexdigest(),
                    'inputDigest': inputs[order],
                }
            # Acquisition/correction can happen while rasterizing or uploading.
            latest = self.repository.list_draws(lottery, count)
            if snapshot_digest(lottery, latest) != digest:
                return None
            published = {'lottery': lottery, 'period': period, 'generation': digest,
                         'generatedAt': now.isoformat(), 'cards': files}
            if self.cards.update(lottery, token, {'manifest': published}):
                self._prune(lottery, published, token)
                return published
            return published_manifest(lottery, self.repository)
        except Exception as error:
            error_code = type(error).__name__  # Do not store transport URLs/credentials.
            raise
        finally:
            self.cards.release(lottery, token, error_code)


def publish_current_card(lottery: str, repository: Any,
                         now: datetime | None = None) -> dict[str, Any] | None:
    cards = card_repository(repository)
    if cards is None:
        return None
    try:
        return CardPublicationService(repository, cards).ensure_current(lottery, now)
    except Exception as error:
        # Retry on the next scheduled tick; acquisition/analysis stays available.
        LOGGER.warning('Matrix card publication failed for %s (%s)', lottery, type(error).__name__)
        return None
