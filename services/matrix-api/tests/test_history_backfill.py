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


def test_ensure_history_persists_and_returns_complete_source_history() -> None:
    repository = InMemoryAnalysisRepository()
    source = HistorySource([_draw(period) for period in range(220, 99, -1)])

    history = DrawRefreshService(repository, source).ensure_history("今彩539")

    assert len(history) == 121
    assert source.history_requests == [("今彩539", None)]
    assert len(repository.list_draws("今彩539", 1000)) == 121


def test_ensure_history_refreshes_from_complete_source_without_fixed_minimum() -> None:
    repository = InMemoryAnalysisRepository()
    for draw in [_draw(period) for period in range(180, 100, -1)]:
        repository.upsert_draw({**draw, "lottery": "今彩539"})
    source = HistorySource([_draw(999)])

    history = DrawRefreshService(repository, source).ensure_history("今彩539")

    assert len(history) == 81
    assert source.history_requests == [("今彩539", None)]


def test_ensure_history_accepts_available_source_history_without_numeric_threshold() -> None:
    repository = InMemoryAnalysisRepository()
    source = HistorySource([_draw(period) for period in range(179, 100, -1)])

    history = DrawRefreshService(repository, source).ensure_history("今彩539")

    assert source.history_requests == [("今彩539", None)]
    assert len(history) == 79
    assert len(repository.list_draws("今彩539", 1000)) == 79
