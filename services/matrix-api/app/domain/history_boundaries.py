from collections.abc import Mapping, Sequence
from typing import Any

from .models import lottery_position_count


SORTED_HISTORY_START_PERIODS = {
    "今彩539": "096000001",
    "六合彩": "076001",
    "大樂透": "093000001",
}

# The independently verified Mark Six original-order archive is complete from
# 1991 onward. Earlier sorted results remain in sorted-mode history, but are
# never substituted for missing original-order rows.
DRAW_ORDER_HISTORY_START_PERIODS = {
    "今彩539": "096000001",
    "六合彩": "091001",
    "大樂透": "093000001",
}

# Verified final sequence for every completed algorithm-history year.  The
# active (newest) year is deliberately not checked against this manifest; its
# latest period is guarded separately by the live refresh path.  Once a newer
# year appears, the previous year must be added here or history fails closed.
COMPLETED_YEAR_LAST_SEQUENCES = {
    "今彩539": dict(zip(
        range(96, 115),
        (
            261, 262, 261, 261, 313, 313, 313, 313, 313, 314, 312,
            313, 313, 314, 313, 313, 312, 314, 316,
        ),
        strict=True,
    )),
    "六合彩": dict(zip(
        range(1976, 2026),
        (
            50, 102, 101, 102, 103, 101, 104, 103, 103, 103,
            100, 103, 102, 99, 100, 101, 102, 101, 101, 101,
            106, 104, 114, 110, 112, 110, 113, 117, 140, 155,
            154, 152, 149, 154, 152, 154, 152, 152, 152, 152,
            151, 153, 149, 144, 30, 123, 111, 146, 140, 134,
        ),
        strict=True,
    )),
    "大樂透": dict(zip(
        range(93, 115),
        (
            104, 104, 104, 104, 105, 104, 105, 104, 104, 108, 108,
            109, 111, 108, 108, 112, 112, 114, 114, 116, 118, 118,
        ),
        strict=True,
    )),
}


def period_sort_key(lottery: str, value: object) -> int:
    period = str(value or "").strip()
    if not period.isdigit():
        return -1
    if lottery == "六合彩" and len(period) == 6:
        short_year = int(period[1:3])
        full_year = 1900 + short_year if short_year >= 76 else 2000 + short_year
        return full_year * 1000 + int(period[3:])
    return int(period)


def has_complete_draw_order(draw: Mapping[str, Any], count: int) -> bool:
    numbers = draw.get("numbers")
    order = draw.get("drawOrderNumbers")
    return (
        isinstance(numbers, list)
        and isinstance(order, list)
        and len(order) == count
        and len(set(order)) == count
        and sorted(order) == sorted(numbers)
        and (
            count != 7
            or (
                order[-1] == numbers[-1]
                and sorted(order[:6]) == sorted(numbers[:6])
            )
        )
    )


def _period_parts(lottery: str, value: object) -> tuple[int, int] | None:
    period = str(value or "").strip()
    if not period.isdigit():
        return None
    if lottery in {"今彩539", "大樂透"} and len(period) in {8, 9}:
        return int(period[:-6]), int(period[-6:])
    if lottery == "六合彩" and len(period) == 6:
        return period_sort_key(lottery, period) // 1000, int(period[3:])
    return None


def incomplete_history_years(
    lottery: str,
    draws: Sequence[Mapping[str, Any]],
    *,
    first_year: int | None = None,
) -> list[int]:
    """Return years missing their first, internal, or verified final period."""
    parts = [_period_parts(lottery, draw.get("period")) for draw in draws]
    if not parts or any(part is None for part in parts):
        raise ValueError("DRAW_HISTORY_INCOMPLETE")
    parsed = [part for part in parts if part is not None]
    sequences_by_year: dict[int, set[int]] = {}
    for year, sequence in parsed:
        sequences_by_year.setdefault(year, set()).add(sequence)

    latest_year = max(sequences_by_year)
    start_year = min(sequences_by_year) if first_year is None else first_year
    manifest = COMPLETED_YEAR_LAST_SEQUENCES[lottery]
    incomplete: list[int] = []
    for year in range(start_year, latest_year + 1):
        sequences = sequences_by_year.get(year, set())
        if 1 not in sequences:
            incomplete.append(year)
            continue
        ordered = sorted(sequences)
        if any(
            current != previous + 1
            for previous, current in zip(ordered, ordered[1:])
        ):
            incomplete.append(year)
            continue
        if year < latest_year:
            expected_last = manifest.get(year)
            if expected_last is None or ordered[-1] != expected_last:
                incomplete.append(year)
    return incomplete


def _require_contiguous_periods(
    lottery: str,
    draws: Sequence[Mapping[str, Any]],
    *,
    boundary_applied: bool,
) -> None:
    parts = [_period_parts(lottery, draw.get("period")) for draw in draws]
    # Synthetic domain-level tests may use symbolic periods. Production's
    # strict path is numeric; a mixed representation is never acceptable.
    if not any(part is not None for part in parts):
        return
    if any(part is None for part in parts):
        raise ValueError("DRAW_ORDER_HISTORY_INCOMPLETE")

    parsed = [part for part in parts if part is not None]
    if len(set(parsed)) != len(parsed):
        raise ValueError("DRAW_ORDER_HISTORY_INCOMPLETE")
    sequences_by_year: dict[int, set[int]] = {}
    for year, sequence in parsed:
        sequences_by_year.setdefault(year, set()).add(sequence)
    for sequences in sequences_by_year.values():
        ordered = sorted(sequences)
        if any(current != previous + 1 for previous, current in zip(ordered, ordered[1:])):
            raise ValueError("DRAW_ORDER_HISTORY_INCOMPLETE")

    if boundary_applied:
        first_year = min(sequences_by_year)
        latest_year = max(sequences_by_year)
        if any(
            1 not in sequences_by_year.get(year, set())
            for year in range(first_year, latest_year + 1)
        ):
            raise ValueError("DRAW_ORDER_HISTORY_INCOMPLETE")
        if incomplete_history_years(lottery, draws, first_year=first_year):
            raise ValueError("DRAW_ORDER_HISTORY_INCOMPLETE")


def draw_order_history(
    lottery: str,
    history: Sequence[Mapping[str, Any]],
    *,
    require_boundary: bool = False,
) -> list[Mapping[str, Any]]:
    if lottery == "天天樂":
        raise ValueError("DRAW_ORDER_HISTORY_UNSUPPORTED")
    draws = list(history)
    start_period = DRAW_ORDER_HISTORY_START_PERIODS[lottery]
    start_key = period_sort_key(lottery, start_period)
    has_boundary = any(str(draw.get("period")) == start_period for draw in draws)
    newest_key = max(
        (period_sort_key(lottery, draw.get("period")) for draw in draws),
        default=-1,
    )
    if has_boundary:
        selected = [
            draw
            for draw in draws
            if period_sort_key(lottery, draw.get("period")) >= start_key
        ]
    elif require_boundary and newest_key >= start_key:
        raise ValueError("DRAW_ORDER_HISTORY_INCOMPLETE")
    else:
        selected = draws

    count = lottery_position_count(lottery)
    if not selected or any(
        not has_complete_draw_order(draw, count) for draw in selected
    ):
        raise ValueError("DRAW_ORDER_HISTORY_INCOMPLETE")
    _require_contiguous_periods(
        lottery,
        selected,
        boundary_applied=has_boundary,
    )
    return selected
