from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from os import environ
from time import sleep
from typing import Any
from zoneinfo import ZoneInfo

from app.services.runtime_log import log_worker_run


LOS_ANGELES = ZoneInfo("America/Los_Angeles")
PDT_OFFSET = timedelta(hours=-7)
PST_OFFSET = timedelta(hours=-8)
RETRY_SECONDS = 600
DEFAULT_MAX_ATTEMPTS = 10


def is_active_slot(now: datetime) -> bool:
    current = now if now.tzinfo is not None else now.replace(tzinfo=UTC)
    current_utc = current.astimezone(UTC)
    los_angeles_offset = current_utc.astimezone(LOS_ANGELES).utcoffset()
    if los_angeles_offset == PDT_OFFSET:
        return current_utc.hour == 1
    if los_angeles_offset == PST_OFFSET:
        return current_utc.hour == 2
    return False


def run_retry_loop(
    run_once: Callable[[], dict[str, Any]],
    *,
    sleeper: Callable[[int], None] = sleep,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> dict[str, Any]:
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    result: dict[str, Any] = {}
    for attempt in range(1, max_attempts + 1):
        result = run_once()
        if str(result.get("status") or "") != "not-acquired":
            return result
        if attempt < max_attempts:
            sleeper(RETRY_SECONDS)
    return result


def main() -> int:
    if not is_active_slot(datetime.now(UTC)):
        log_worker_run("天天樂", lambda: {"status": "not-due", "drawPeriod": None})
        return 0

    from app.fantasy5_crawler import run_fantasy5_crawler_once

    max_attempts = int(environ.get("FANTASY5_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS))

    def logged_run_once() -> dict[str, Any]:
        return log_worker_run("天天樂", run_fantasy5_crawler_once)

    result = run_retry_loop(logged_run_once, max_attempts=max_attempts)
    if result.get("status") == "not-acquired":
        print(
            "Fantasy5 formal source is still waiting after "
            f"{max_attempts} attempts."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
