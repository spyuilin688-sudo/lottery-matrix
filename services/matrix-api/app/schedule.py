from __future__ import annotations

import argparse
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


PACIFIC = ZoneInfo("America/Los_Angeles")
FANTASY5_ANALYSIS_HOUR = 18
FANTASY5_ANALYSIS_MINUTE = 50


def fantasy5_analysis_due(now: datetime | None = None) -> bool:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise ValueError("schedule time must include a timezone")
    pacific = current.astimezone(PACIFIC)
    return (
        pacific.hour == FANTASY5_ANALYSIS_HOUR
        and pacific.minute == FANTASY5_ANALYSIS_MINUTE
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lottery", required=True)
    args = parser.parse_args()
    due = args.lottery != "天天樂" or fantasy5_analysis_due()
    print("due" if due else "not-due")


if __name__ == "__main__":
    main()
