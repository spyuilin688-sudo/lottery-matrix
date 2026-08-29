from typing import Any, Protocol

from app.repositories.analysis_repository import AnalysisRepository


class DrawSource(Protocol):
    def fetch(self, lottery: str) -> dict[str, Any]: ...
    def fetch_history(self, lottery: str, limit: int | None) -> list[dict[str, Any]]: ...


class DrawRefreshService:
    """Fetches formal draws and persists them under the requested lottery."""

    def __init__(self, repository: AnalysisRepository, source: DrawSource) -> None:
        self.repository = repository
        self.source = source

    def refresh(self, lottery: str) -> dict[str, Any]:
        draw = self._prepare_draw(lottery, self.source.fetch(lottery))
        self.repository.upsert_draw(draw)
        return draw

    def ensure_history(self, lottery: str) -> list[dict[str, Any]]:
        history = self.repository.list_draws(lottery, None)
        if history:
            return history

        draws = [
            self._prepare_draw(lottery, raw)
            for raw in self.source.fetch_history(lottery, None)
        ]
        if not draws:
            raise ValueError("DRAW_HISTORY_INCOMPLETE")
        self.repository.upsert_draws(draws)

        history = self.repository.list_draws(lottery, None)
        if not history:
            raise ValueError("DRAW_HISTORY_INCOMPLETE")
        return history

    @classmethod
    def _prepare_draw(cls, lottery: str, raw: dict[str, Any]) -> dict[str, Any]:
        draw = dict(raw)
        source_lottery = draw.get("lottery")
        if source_lottery is not None and source_lottery != lottery:
            raise ValueError("DRAW_LOTTERY_MISMATCH")
        draw["lottery"] = lottery
        cls._validate(draw)
        return draw

    @staticmethod
    def _validate(draw: dict[str, Any]) -> None:
        limits = {"今彩539": (5, 39), "天天樂": (5, 39), "六合彩": (7, 49), "大樂透": (7, 49)}
        if not draw.get("period") or not draw.get("drawDate") or draw.get("lottery") not in limits:
            raise ValueError("DRAW_REQUIRED_FIELDS_MISSING")
        count, maximum = limits[draw["lottery"]]
        numbers = draw.get("numbers")
        if (
            not isinstance(numbers, list)
            or len(numbers) != count
            or len(set(numbers)) != count
            or any(not isinstance(number, str) or len(number) != 2 or not number.isdigit() for number in numbers)
            or any(not 1 <= int(number) <= maximum for number in numbers)
        ):
            raise ValueError("DRAW_NUMBERS_INVALID")
