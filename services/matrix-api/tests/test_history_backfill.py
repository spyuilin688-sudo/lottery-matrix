import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.draw_refresh import DrawRefreshService


def _draw(period: int) -> dict:
    return {
        "period": str(period).zfill(9),
        "drawDate": f"2026-08-{((period - 1) % 28) + 1:02d}",
        "numbers": ["01", "02", "03", "04", "05"],
        "sortedNumbers": ["01", "02", "03", "04", "05"],
        "drawOrderNumbers": ["05", "04", "03", "02", "01"],
    }


class HistorySource:
    def __init__(self, history: list[dict]) -> None:
        self.history = history
        self.history_requests: list[tuple[str, int | None]] = []

    def fetch(self, lottery: str) -> dict:
        return dict(self.history[0])

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.history_requests.append((lottery, limit))
        rows = self.history if limit is None else self.history[:limit]
        return [dict(draw) for draw in rows]


def test_ensure_history_persists_complete_source_history_but_returns_latest_80() -> None:
    repository = InMemoryAnalysisRepository()
    source = HistorySource([_draw(period) for period in range(220, 99, -1)])

    history = DrawRefreshService(repository, source).ensure_history("今彩539", 80)

    assert len(history) == 80
    assert source.history_requests == [("今彩539", None)]
    assert len(repository.list_draws("今彩539", 1000)) == 121
    assert history == repository.list_draws("今彩539", 80)


def test_ensure_history_skips_full_backfill_after_database_has_analysis_minimum() -> None:
    repository = InMemoryAnalysisRepository()
    for draw in [_draw(period) for period in range(180, 100, -1)]:
        repository.upsert_draw({**draw, "lottery": "今彩539"})
    source = HistorySource([_draw(999)])

    history = DrawRefreshService(repository, source).ensure_history("今彩539", 80)

    assert len(history) == 80
    assert source.history_requests == []


def test_ensure_history_rejects_complete_source_when_it_still_has_under_80_draws() -> None:
    repository = InMemoryAnalysisRepository()
    source = HistorySource([_draw(period) for period in range(179, 100, -1)])

    with pytest.raises(ValueError, match="DRAW_HISTORY_INCOMPLETE"):
        DrawRefreshService(repository, source).ensure_history("今彩539", 80)

    assert source.history_requests == [("今彩539", None)]
    assert len(repository.list_draws("今彩539", 1000)) == 79
