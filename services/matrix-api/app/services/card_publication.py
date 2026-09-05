"""Build both fixed PNG orders once; publish only a complete immutable generation."""
from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
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
from app.card_renderer import CARD_HEIGHT, CARD_WIDTH, card_layout, render_matrix_card
from app.repositories.card_repository import CardRepository, card_repository
from app.services.draw_refresh import require_complete_history

LOGGER = logging.getLogger(__name__)
FONT_DIR = Path(__file__).resolve().parents[1] / 'fonts'
FONT_FILES = tuple(sorted([*FONT_DIR.glob('*.otf'), *FONT_DIR.glob('*.ttf')]))
LOTTERY_CODES = {'今彩539': '539', '天天樂': 'fantasy5', '六合彩': 'marksix', '大樂透': 'lotto649'}
PUBLICATION_DELAY = timedelta(minutes=10)


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
        {key: row.get(key) for key in (
            'period', 'drawDate', 'numbers', 'sortedNumbers', 'drawOrderNumbers',
        )} for row in draws
    ]}
    return sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':')).encode()).hexdigest()


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
            if row.get('drawOrderNumbers') is not None:
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


def build_card_pngs(lottery: str, draws: list[dict[str, Any]]) -> dict[str, bytes]:
    import resvg_py

    result = {}
    if len(FONT_FILES) != 4:
        raise ValueError('MATRIX_CARD_FONTS_MISSING')
    for order in ('draw', 'sorted'):
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

    def _prune(self, lottery: str, draws: list[dict[str, Any]],
               manifest: dict[str, Any]) -> None:
        keep_periods = tuple(str(row['period']) for row in draws[:3])
        try:
            self.cards.prune(lottery, keep_periods, manifest['generation'])
        except Exception as error:
            # Publication is already durable; retry cleanup on the next tick.
            LOGGER.warning('Matrix card cleanup failed for %s (%s)',
                           lottery, type(error).__name__)

    def ensure_current(self, lottery: str, now: datetime | None = None) -> dict[str, Any] | None:
        now = now or datetime.now(UTC)
        token = str(uuid4())
        state = self.cards.claim(lottery, token, now)
        if state is None:
            return self.cards.read_manifest(lottery)
        error_code = None
        try:
            now = datetime.fromisoformat(state['claimed_at'])
            count = sum(card_layout(lottery)['column_rows'])
            draws = self.repository.list_draws(lottery, count)
            if not complete_snapshot(lottery, draws):
                return state['manifest']
            digest = snapshot_digest(lottery, draws)
            manifest = state['manifest']
            if manifest and manifest['generation'] == digest:
                self._prune(lottery, draws, manifest)
                return manifest
            if state['desired_digest'] != digest:
                self.cards.update(lottery, token, {
                    'desired_digest': digest, 'desired_period': str(draws[0]['period']),
                    'eligible_at': (now + PUBLICATION_DELAY).isoformat(),
                })
                return manifest
            if now < datetime.fromisoformat(state['eligible_at']):
                return manifest
            pngs = self.renderer(lottery, draws)
            if set(pngs) != {'draw', 'sorted'}:
                raise ValueError('MATRIX_CARD_ORDERS_INCOMPLETE')
            for png in pngs.values():
                validate_png(png)
            period = str(draws[0]['period'])
            files = {}
            for order in ('draw', 'sorted'):
                png = pngs[order]
                path = f'{LOTTERY_CODES[lottery]}/{period}/{digest}/{order}.png'
                files[order] = {
                    'url': self.cards.upload(path, png), 'mimeType': 'image/png',
                    'width': CARD_WIDTH, 'height': CARD_HEIGHT, 'sha256': sha256(png).hexdigest(),
                }
            # Acquisition/correction can happen while rasterizing or uploading.
            latest = self.repository.list_draws(lottery, count)
            if snapshot_digest(lottery, latest) != digest:
                return manifest
            published = {'lottery': lottery, 'period': period, 'generation': digest,
                         'generatedAt': now.isoformat(), 'cards': files}
            if self.cards.update(lottery, token, {'manifest': published}):
                self._prune(lottery, draws, published)
                return published
            return self.cards.read_manifest(lottery)
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
