from datetime import date, timedelta
from typing import Any, Protocol

from app.repositories.analysis_repository import AnalysisRepository


def missing_history_periods(
    lottery: str, history: list[dict[str, Any]],
) -> list[str]:
    """Return internal numeric period gaps, grouped by yearly period series."""
    groups: dict[str, dict[int, int]] = {}
    for draw in history:
        if not str(draw.get("drawDate") or "").strip():
            continue
        period = str(draw.get("period") or "").strip()
        if not period.isdigit():
            raise ValueError("DRAW_HISTORY_INCOMPLETE")
        if lottery in {"今彩539", "大樂透"} and len(period) == 9:
            prefix, sequence_text = period[:3], period[3:]
        elif lottery in {"今彩539", "大樂透"} and len(period) == 8:
            prefix, sequence_text = period[:2], period[2:]
        elif len(period) == 6 and (
            lottery == "六合彩"
            or (lottery == "天天樂" and period.startswith("0"))
        ):
            prefix, sequence_text = period[:3], period[3:]
        else:
            prefix, sequence_text = "", period
        groups.setdefault(prefix, {})[int(sequence_text)] = len(sequence_text)

    missing: list[str] = []
    for prefix, sequence_widths in groups.items():
        sequences = sequence_widths.keys()
        ordered = sorted(sequences)
        for previous, current in zip(ordered, ordered[1:]):
            width = min(sequence_widths[previous], sequence_widths[current])
            missing.extend(
                f"{prefix}{sequence:0{width}d}"
                for sequence in range(previous + 1, current)
            )
    return sorted(missing, key=int, reverse=True)


def require_complete_history(
    lottery: str,
    history: list[dict[str, Any]],
    required_period: str | None = None,
) -> None:
    if not history or missing_history_periods(lottery, history):
        raise ValueError("DRAW_HISTORY_INCOMPLETE")
    if required_period is not None and not any(
        str(draw.get("period")) == required_period for draw in history
    ):
        raise ValueError("DRAW_HISTORY_INCOMPLETE")


def recent_history_window(
    history: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    dated: list[tuple[date, dict[str, Any]]] = []
    for draw in history:
        normalized = str(draw.get("drawDate") or "").strip().replace("/", "-").replace(".", "-")[:10]
        try:
            dated.append((date.fromisoformat(normalized), draw))
        except ValueError:
            continue
    if not dated:
        raise ValueError("DRAW_HISTORY_INCOMPLETE")
    cutoff = max(draw_date for draw_date, _ in dated) - timedelta(days=31)
    return [draw for draw_date, draw in dated if draw_date >= cutoff]


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
        latest = self.repository.list_draws(lottery, 1)
        if not latest:
            self._fetch_and_store_history(lottery, None)
            latest = self.repository.list_draws(lottery, 1)

        history = self._recent_history(lottery, latest)

        missing = missing_history_periods(lottery, history)
        for _ in range(2):
            if not missing:
                break
            previous_latest = (
                str(latest[0].get("period") or ""),
                str(latest[0].get("drawDate") or ""),
            )
            repair_limit = sum(
                1
                for draw in history
                if str(draw.get("period") or "").isdigit()
                and int(str(draw["period"])) >= int(missing[-1])
            ) + len(missing)
            self._fetch_and_store_history(lottery, repair_limit)
            latest = self.repository.list_draws(lottery, 1)
            history = self._recent_history(lottery, latest)
            missing = missing_history_periods(lottery, history)
            current_latest = (
                str(latest[0].get("period") or ""),
                str(latest[0].get("drawDate") or ""),
            )
            if missing and current_latest == previous_latest:
                break

        require_complete_history(lottery, history)
        return history

    def _recent_history(
        self, lottery: str, latest: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not latest:
            raise ValueError("DRAW_HISTORY_INCOMPLETE")
        normalized = str(latest[0].get("drawDate") or "").strip().replace("/", "-").replace(".", "-")[:10]
        try:
            latest_date = date.fromisoformat(normalized)
        except ValueError as error:
            raise ValueError("DRAW_HISTORY_INCOMPLETE") from error
        since_date = (latest_date - timedelta(days=31)).isoformat()
        return self.repository.list_draws_since(lottery, since_date)

    def _fetch_and_store_history(self, lottery: str, limit: int | None) -> None:
        draws = [
            self._prepare_draw(lottery, raw)
            for raw in self.source.fetch_history(lottery, limit)
        ]
        if not draws:
            raise ValueError("DRAW_HISTORY_INCOMPLETE")
        self.repository.upsert_draws(draws)

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
