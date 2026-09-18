from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from hashlib import sha256
import struct

from app.card_renderer import CARD_HEIGHT, CARD_WIDTH, card_layout
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.card_publication import CardPublicationService, snapshot_digest


NOW = datetime(2026, 9, 5, tzinfo=UTC)
LOTTERY = "天天樂"


class Cards:
    def __init__(self) -> None:
        self.row = {"desired_digest": None, "eligible_at": None, "manifest": None}
        self.owner: str | None = None
        self.claims = 0

    def claim(self, lottery: str, token: str, now: datetime):
        self.claims += 1
        self.owner = token
        return {**deepcopy(self.row), "claimed_at": now.isoformat()}

    def update(self, lottery: str, token: str, values: dict) -> bool:
        assert token == self.owner
        self.row.update(deepcopy(values))
        return True

    def upload(self, path: str, png: bytes) -> str:
        return f"https://cards.example/{path}"

    def prune(self, *args, **kwargs) -> None:
        return None

    def release(self, lottery: str, token: str, error: str | None = None) -> None:
        if token == self.owner:
            self.owner = None

    def read_manifest(self, lottery: str):
        return deepcopy(self.row["manifest"])


def history() -> list[dict]:
    count = sum(card_layout(LOTTERY)["column_rows"])
    return [
        {
            "lottery": LOTTERY,
            "period": str(12000 - index),
            "drawDate": (NOW - timedelta(days=index)).date().isoformat(),
            "numbers": ["39", "20", "11", "07", "01"],
            "sortedNumbers": ["01", "07", "11", "20", "39"],
            "drawOrderNumbers": None,
        }
        for index in range(count)
    ]


def png_stub(lottery: str, draws: list[dict], *, orders=None) -> dict[str, bytes]:
    prefix = (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", 13)
        + b"IHDR"
        + struct.pack(">II", CARD_WIDTH, CARD_HEIGHT)
    )
    return {
        "sorted": prefix + sha256(snapshot_digest(lottery, draws).encode()).digest()
    }


def test_current_manifest_returns_without_acquiring_another_write_lease() -> None:
    repository = InMemoryAnalysisRepository()
    for draw in history():
        repository.upsert_draw(draw)
    cards = Cards()
    repository.card_repository = cards
    publisher = CardPublicationService(repository, cards, renderer=png_stub)

    first = publisher.ensure_current(LOTTERY, NOW)
    assert first is not None
    assert cards.claims == 1

    second = publisher.ensure_current(LOTTERY, NOW + timedelta(minutes=5))

    assert second == first
    assert cards.claims == 1
