from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


TAIPEI = ZoneInfo("Asia/Taipei")

CALL_TIMES: dict[str, tuple[int, int]] = {
    "今彩539": (20, 33),
    "大樂透": (20, 53),
    "六合彩": (21, 33),
}

PRE_CALL_OFFSETS_MINUTES = (-120, -60, -30)
RETRY_OFFSETS_MINUTES = (
    0, 5, 10, 15, 20, 25, 30, 35, 40, 45,
    75, 105, 135, 165,
    225, 285, 345,
    525, 705,
    1065,
)


def retry_offsets() -> list[int]:
    return list(RETRY_OFFSETS_MINUTES)


def _fantasy5_call_time(day: datetime) -> tuple[int, int]:
    month_day = (day.month, day.day)
    summer = (3, 13) <= month_day <= (11, 5)
    return (9, 33) if summer else (10, 33)


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


def _candidate_call_times(lottery: str, now: datetime) -> list[datetime]:
    taipei_now = now.astimezone(TAIPEI)
    return [
        lottery_call_time(lottery, taipei_now + timedelta(days=offset))
        for offset in (-1, 0, 1)
    ]


def due_call_cycle(lottery: str, now: datetime | None = None) -> datetime | None:
    current = now or datetime.now(TAIPEI)
    if current.tzinfo is None:
        raise ValueError("schedule time must include a timezone")
    taipei_now = current.astimezone(TAIPEI).replace(second=0, microsecond=0)
    for base in _candidate_call_times(lottery, taipei_now):
        scheduled = [
            *(base + timedelta(minutes=offset) for offset in PRE_CALL_OFFSETS_MINUTES),
            *(base + timedelta(minutes=offset) for offset in RETRY_OFFSETS_MINUTES),
        ]
        if taipei_now in scheduled:
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
