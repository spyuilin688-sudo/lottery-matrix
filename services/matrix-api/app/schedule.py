from __future__ import annotations

import argparse
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo


TAIPEI = ZoneInfo("Asia/Taipei")
LOS_ANGELES = ZoneInfo("America/Los_Angeles")
FIRST_CRAWL_DELAY = timedelta(minutes=3)

CALL_TIMES: dict[str, tuple[int, int]] = {
    "今彩539": (20, 33),
    "大樂透": (20, 53),
    "六合彩": (21, 33),
}

DRAW_WEEKDAYS: dict[str, frozenset[int]] = {
    "今彩539": frozenset(range(6)),
    "大樂透": frozenset({1, 4}),
    "六合彩": frozenset({1, 3, 5}),
}
RECOVERY_WEEKDAYS: dict[str, frozenset[int]] = {
    **DRAW_WEEKDAYS,
    "六合彩": frozenset({1, 3, 5, 6}),
}

PRE_CALL_OFFSETS_MINUTES = (-120, -60, -30)
RETRY_OFFSETS_MINUTES = (
    0,
    *range(10, 91, 10),
    *range(120, 301, 30),
    *range(360, 1381, 60),
    1410,
)


def retry_offsets() -> list[int]:
    return list(RETRY_OFFSETS_MINUTES)


def _fantasy5_call_time(day: datetime) -> tuple[int, int]:
    taipei_day = day.astimezone(TAIPEI)
    source_day = (taipei_day - timedelta(days=1)).date()
    los_angeles_call = datetime.combine(
        source_day,
        time(hour=18, minute=33),
        tzinfo=LOS_ANGELES,
    )
    taipei_call = los_angeles_call.astimezone(TAIPEI)
    return taipei_call.hour, taipei_call.minute


def lottery_call_time(lottery: str, day: datetime) -> datetime:
    if day.tzinfo is None:
        raise ValueError("schedule time must include a timezone")
    taipei_day = day.astimezone(TAIPEI)
    if lottery == "天天樂":
        hour, minute = _fantasy5_call_time(taipei_day)
    else:
        try:
            hour, minute = CALL_TIMES[lottery]
        except KeyError as error:
            raise ValueError("UNKNOWN_LOTTERY") from error
    return taipei_day.replace(hour=hour, minute=minute, second=0, microsecond=0)


def next_lottery_call_time(lottery: str, now: datetime | None = None) -> datetime:
    current = now or datetime.now(TAIPEI)
    if current.tzinfo is None:
        raise ValueError("schedule time must include a timezone")
    taipei_now = current.astimezone(TAIPEI)
    for offset in range(8):
        day = taipei_now + timedelta(days=offset)
        if day.weekday() not in DRAW_WEEKDAYS.get(lottery, frozenset(range(7))):
            continue
        scheduled = lottery_call_time(lottery, day)
        if scheduled > taipei_now:
            return scheduled
    raise RuntimeError("NEXT_LOTTERY_CALL_NOT_FOUND")


def next_lottery_draw_time(
    lottery: str,
    now: datetime | None = None,
) -> datetime:
    current = now or datetime.now(TAIPEI)
    if current.tzinfo is None:
        raise ValueError("schedule time must include a timezone")
    taipei_now = current.astimezone(TAIPEI)
    for offset in range(8):
        day = taipei_now + timedelta(days=offset)
        if day.weekday() not in DRAW_WEEKDAYS.get(lottery, frozenset(range(7))):
            continue
        scheduled = lottery_call_time(lottery, day) - FIRST_CRAWL_DELAY
        if scheduled > taipei_now:
            return scheduled
    raise RuntimeError("NEXT_LOTTERY_DRAW_NOT_FOUND")


def previous_lottery_call_time(lottery: str, before: datetime) -> datetime:
    if before.tzinfo is None:
        raise ValueError("schedule time must include a timezone")
    taipei_before = before.astimezone(TAIPEI)
    for offset in range(1, 9):
        day = taipei_before - timedelta(days=offset)
        if day.weekday() not in DRAW_WEEKDAYS.get(lottery, frozenset(range(7))):
            continue
        return lottery_call_time(lottery, day)
    raise RuntimeError("PREVIOUS_LOTTERY_CALL_NOT_FOUND")


def _candidate_call_times(
    lottery: str,
    now: datetime,
    *,
    allow_weekend_fallback: bool = False,
) -> list[datetime]:
    taipei_now = now.astimezone(TAIPEI)
    weekdays = (
        RECOVERY_WEEKDAYS if allow_weekend_fallback else DRAW_WEEKDAYS
    ).get(lottery, frozenset(range(7)))
    return [
        lottery_call_time(lottery, day)
        for offset in (-1, 0, 1)
        if (
            (day := taipei_now + timedelta(days=offset)).weekday()
            in weekdays
        )
    ]


def due_call_cycle(
    lottery: str,
    now: datetime | None = None,
    *,
    allow_weekend_fallback: bool = False,
) -> datetime | None:
    current = now or datetime.now(TAIPEI)
    if current.tzinfo is None:
        raise ValueError("schedule time must include a timezone")
    taipei_now = current.astimezone(TAIPEI).replace(second=0, microsecond=0)
    candidate_calls = _candidate_call_times(
        lottery,
        taipei_now,
        allow_weekend_fallback=allow_weekend_fallback,
    )
    for base in candidate_calls:
        if taipei_now == base:
            return base
    for base in candidate_calls:
        pre_calls = [
            base + timedelta(minutes=offset)
            for offset in PRE_CALL_OFFSETS_MINUTES
        ]
        if taipei_now in pre_calls:
            return base
    for base in reversed(candidate_calls):
        final_retry = base + timedelta(minutes=RETRY_OFFSETS_MINUTES[-1])
        if base <= taipei_now <= final_retry:
            return base
    return None


def call_due(lottery: str, now: datetime | None = None) -> bool:
    return due_call_cycle(lottery, now) is not None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lottery", required=True)
    args = parser.parse_args()
    print("due" if call_due(args.lottery) else "not-due")


if __name__ == "__main__":
    main()
