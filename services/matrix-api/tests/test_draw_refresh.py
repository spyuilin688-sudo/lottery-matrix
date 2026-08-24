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
