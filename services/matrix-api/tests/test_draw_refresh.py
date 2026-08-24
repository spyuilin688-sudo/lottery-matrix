import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.draw_refresh import DrawRefreshService


class StubSource:
    def __init__(self, draw: dict) -> None:
        self.draw = draw
        self.requests: list[str] = []

    def fetch(self, lottery: str) -> dict:
        self.requests.append(lottery)
        return dict(self.draw)


def test_refresh_fetches_validates_and_upserts_latest_draw() -> None:
    repository = InMemoryAnalysisRepository()
    source = StubSource({
        "period": "114000123", "drawDate": "2025/08/23",
        "numbers": ["01", "02", "03", "04", "05"],
        "sortedNumbers": ["01", "02", "03", "04", "05"],
        "drawOrderNumbers": ["05", "04", "03", "02", "01"],
    })

    result = DrawRefreshService(repository, source).refresh("今彩539")

    assert source.requests == ["今彩539"]
    assert result["lottery"] == "今彩539"
    assert repository.list_draws("今彩539", 10) == [{
        "period": "114000123", "drawDate": "2025/08/23",
        "numbers": ["01", "02", "03", "04", "05"],
        "sortedNumbers": ["01", "02", "03", "04", "05"],
        "drawOrderNumbers": ["05", "04", "03", "02", "01"],
    }]


def test_refresh_rejects_a_source_result_for_another_lottery() -> None:
    repository = InMemoryAnalysisRepository()
    source = StubSource({
        "lottery": "大樂透", "period": "114000123", "drawDate": "2025/08/23",
        "numbers": ["01", "02", "03", "04", "05", "06", "07"],
    })

    with pytest.raises(ValueError, match="DRAW_LOTTERY_MISMATCH"):
        DrawRefreshService(repository, source).refresh("今彩539")
    assert repository.list_draws("今彩539", 10) == []


class StubHistorySource(StubSource):
    def __init__(self, draws: list[dict]) -> None:
        super().__init__(draws[0])
        self.draws = draws

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.requests.append(f"history:{lottery}:{limit}")
        return [dict(draw) for draw in self.draws]


class BulkTrackingRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.bulk_calls = 0

    def upsert_draws(self, draws: list[dict]) -> None:
        self.bulk_calls += 1
        super().upsert_draws(draws)


def test_ensure_history_bulk_upserts_the_complete_download_once() -> None:
    repository = BulkTrackingRepository()
    source = StubHistorySource([
        {
            "period": f"11400012{index}",
            "drawDate": f"2025/08/2{index}",
            "numbers": ["01", "02", "03", "04", "05"],
        }
        for index in range(1, 4)
    ])

    history = DrawRefreshService(repository, source).ensure_history("今彩539", minimum=2)

    assert source.requests == ["history:今彩539:None"]
    assert repository.bulk_calls == 1
    assert len(history) == 2
