from datetime import date, timedelta
from typing import Any, Protocol

from app.domain.history_boundaries import (
    SORTED_HISTORY_START_PERIODS,
    draw_order_history,
    has_complete_draw_order,
    incomplete_history_years,
    period_sort_key,
)
from app.repositories.analysis_repository import AnalysisRepository


DRAW_UPSERT_BATCH_SIZE = 500
ALGORITHM_HISTORY_START_PERIODS = SORTED_HISTORY_START_PERIODS
ALGORITHM_HISTORY_START_YEARS = {
    "今彩539": 96,
    "六合彩": 1976,
    "大樂透": 93,
}


def missing_history_periods(
    lottery: str, history: list[dict[str, Any]],
) -> list[str]:
    """Return internal numeric period gaps, grouped by yearly period series."""
    groups: dict[str, dict[int, int]] = {}
    for draw in history:
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


def missing_algorithm_history_years(
    lottery: str,
    history: list[dict[str, Any]],
) -> list[int]:
    return incomplete_history_years(
        lottery,
        history,
        first_year=ALGORITHM_HISTORY_START_YEARS[lottery],
    )


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

    def ensure_algorithm_history(self, lottery: str) -> list[dict[str, Any]]:
        """Return full history only after required actual draw order is complete."""
        self.ensure_history(lottery)
        history = self.repository.list_draws(lottery, None)
        if lottery == "天天樂":
            return history
        try:
            history = self._sort_algorithm_history(lottery, history)
        except ValueError as error:
            if error.args != ("DRAW_HISTORY_CONFLICT",):
                raise
            self._fetch_and_store_algorithm_history(lottery, history)
            history = self._sort_algorithm_history(
                lottery,
                self.repository.list_draws(lottery, None),
            )

        start_period = ALGORITHM_HISTORY_START_PERIODS[lottery]
        try:
            draw_order_history(lottery, history, require_boundary=True)
            order_history_incomplete = False
        except ValueError:
            order_history_incomplete = True
        needs_backfill = (
            order_history_incomplete
            or not any(str(draw.get("period")) == start_period for draw in history)
            or bool(missing_history_periods(lottery, history))
            or bool(missing_algorithm_history_years(lottery, history))
        )
        if needs_backfill:
            self._fetch_and_store_algorithm_history(
                lottery,
                self.repository.list_draws(lottery, None),
            )
            history = self._sort_algorithm_history(
                lottery,
                self.repository.list_draws(lottery, None),
            )

        if (
            not any(str(draw.get("period")) == start_period for draw in history)
            or missing_history_periods(lottery, history)
            or missing_algorithm_history_years(lottery, history)
        ):
            raise ValueError("DRAW_HISTORY_INCOMPLETE")
        draw_order_history(lottery, history, require_boundary=True)
        return history

    @staticmethod
    def _sort_algorithm_history(
        lottery: str,
        history: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        by_period: dict[int, dict[str, Any]] = {}
        for raw in history:
            raw_period = str(raw.get("period") or "").strip()
            if lottery in {"今彩539", "大樂透"} and len(raw_period) == 8:
                canonical_period = raw_period.zfill(9)
            else:
                canonical_period = raw_period
            key = period_sort_key(lottery, canonical_period)
            if key < 0:
                raise ValueError("DRAW_HISTORY_INCOMPLETE")
            draw = {**raw, "period": canonical_period}
            existing = by_period.get(key)
            if existing is not None:
                if DrawRefreshService._history_payload(existing) != (
                    DrawRefreshService._history_payload(draw)
                ):
                    raise ValueError("DRAW_HISTORY_CONFLICT")
            else:
                by_period[key] = draw
        return [by_period[key] for key in sorted(by_period, reverse=True)]

    @staticmethod
    def _history_payload(draw: dict[str, Any]) -> tuple[Any, ...]:
        normalized_date = (
            str(draw.get("drawDate") or "")
            .strip()
            .replace("/", "-")
            .replace(".", "-")[:10]
        )
        order = draw.get("drawOrderNumbers")
        return (
            normalized_date,
            tuple(draw.get("numbers") or ()),
            tuple(draw.get("sortedNumbers") or draw.get("numbers") or ()),
            None if order is None else tuple(order),
        )

    def _fetch_and_store_algorithm_history(
        self,
        lottery: str,
        existing_history: list[dict[str, Any]],
    ) -> None:
        fetch_algorithm_history = getattr(
            self.source,
            "fetch_algorithm_history",
            None,
        )
        if not callable(fetch_algorithm_history):
            raise ValueError("DRAW_ORDER_HISTORY_INCOMPLETE")
        existing_by_period = {
            str(draw.get("period")): draw
            for draw in existing_history
        }
        alias_periods_by_key: dict[int, list[str]] = {}
        if lottery in {"今彩539", "大樂透"}:
            for draw in existing_history:
                period = str(draw.get("period") or "").strip()
                alias_periods_by_key.setdefault(
                    period_sort_key(lottery, period),
                    [],
                ).append(period)

        draws: list[dict[str, Any]] = []
        for raw in fetch_algorithm_history(lottery):
            prepared = self._prepare_history_draw(
                lottery,
                raw,
                existing_by_period.get(str(raw.get("period"))),
                allow_missing_date=True,
            )
            draws.append(prepared)
            prepared_period = str(prepared["period"])
            for alias_period in alias_periods_by_key.get(
                period_sort_key(lottery, prepared_period),
                [],
            ):
                if (
                    alias_period != prepared_period
                    and {len(alias_period), len(prepared_period)} == {8, 9}
                ):
                    draws.append({**prepared, "period": alias_period})
        if not draws:
            raise ValueError("DRAW_ORDER_HISTORY_INCOMPLETE")
        self._upsert_draws(draws)

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
        existing_by_period = {
            str(draw.get("period")): draw
            for draw in self.repository.list_draws(lottery, None)
        }
        draws = [
            self._prepare_history_draw(
                lottery,
                raw,
                existing_by_period.get(str(raw.get("period"))),
            )
            for raw in self.source.fetch_history(lottery, limit)
        ]
        if not draws:
            raise ValueError("DRAW_HISTORY_INCOMPLETE")
        self._upsert_draws(draws)

    def _upsert_draws(self, draws: list[dict[str, Any]]) -> None:
        for start in range(0, len(draws), DRAW_UPSERT_BATCH_SIZE):
            self.repository.upsert_draws(
                draws[start:start + DRAW_UPSERT_BATCH_SIZE],
            )

    @classmethod
    def _prepare_history_draw(
        cls,
        lottery: str,
        raw: dict[str, Any],
        existing: dict[str, Any] | None,
        *,
        allow_missing_date: bool = False,
    ) -> dict[str, Any]:
        draw = dict(raw)
        if existing is not None:
            if not str(draw.get("drawDate") or "").strip():
                draw["drawDate"] = existing.get("drawDate")
            count = 5 if lottery in {"今彩539", "天天樂"} else 7
            if (
                not cls._has_complete_draw_order(draw, count)
                and cls._has_complete_draw_order(existing, count)
            ):
                draw["drawOrderNumbers"] = existing["drawOrderNumbers"]
        return cls._prepare_draw(
            lottery,
            draw,
            allow_missing_date=allow_missing_date,
        )

    @staticmethod
    def _has_complete_draw_order(draw: dict[str, Any], count: int) -> bool:
        return has_complete_draw_order(draw, count)

    @classmethod
    def _prepare_draw(
        cls,
        lottery: str,
        raw: dict[str, Any],
        *,
        allow_missing_date: bool = False,
    ) -> dict[str, Any]:
        draw = dict(raw)
        source_lottery = draw.get("lottery")
        if source_lottery is not None and source_lottery != lottery:
            raise ValueError("DRAW_LOTTERY_MISMATCH")
        draw["lottery"] = lottery
        cls._validate(draw, allow_missing_date=allow_missing_date)
        return draw

    @staticmethod
    def _validate(
        draw: dict[str, Any],
        *,
        allow_missing_date: bool = False,
    ) -> None:
        limits = {"今彩539": (5, 39), "天天樂": (5, 39), "六合彩": (7, 49), "大樂透": (7, 49)}
        if (
            not draw.get("period")
            or (not allow_missing_date and not draw.get("drawDate"))
            or draw.get("lottery") not in limits
        ):
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
        order = draw.get("drawOrderNumbers")
        if order is not None and not DrawRefreshService._has_complete_draw_order(draw, count):
            raise ValueError("DRAW_ORDER_NUMBERS_INVALID")
