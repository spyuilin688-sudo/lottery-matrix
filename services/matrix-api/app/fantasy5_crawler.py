from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.repositories.analysis_repository import (
    AnalysisRepository,
    JOB_NAME_BY_LOTTERY,
    create_supabase_repository,
)
from app.scraping.sources import LatestDrawSource
from app.services.draw_refresh import DrawRefreshService, DrawSource
from app.settings import load_settings


FANTASY5 = "天天樂"
TAIPEI = ZoneInfo("Asia/Taipei")


def _best_effort_telemetry(write: Callable[[], None]) -> None:
    try:
        write()
    except Exception:
        pass


def _normalized_draw_date(value: Any) -> str:
    return str(value or "").strip().replace("/", "-").replace(".", "-")[:10]


def _expected_source_draw_date(now: datetime | None) -> str:
    current = now or datetime.now(TAIPEI)
    if current.tzinfo is None:
        current = current.replace(tzinfo=TAIPEI)
    return (current.astimezone(TAIPEI).date() - timedelta(days=1)).isoformat()


def _is_transient_source_error(error: Exception) -> bool:
    code = str(getattr(error, "code", "") or "").upper()
    if code in {"57014", "PGRST000", "PGRST001", "PGRST002", "PGRST003"}:
        return True
    if code.isdigit() and 500 <= int(code) <= 599:
        return True
    if isinstance(error, httpx.HTTPStatusError):
        return 500 <= error.response.status_code <= 599
    if isinstance(error, httpx.TransportError):
        return True
    message = str(error).lower()
    return any(marker in message for marker in (
        "statement timeout",
        "web server is down",
        "connection reset",
        "connection refused",
        "temporarily unavailable",
    ))


def run_fantasy5_crawler(
    repository: AnalysisRepository,
    source: DrawSource,
    now: datetime | None = None,
) -> dict[str, Any]:
    latest = repository.list_draws(FANTASY5, 1)
    database_period = str(latest[0]["period"]) if latest else None
    job_name = JOB_NAME_BY_LOTTERY[FANTASY5]
    refresh = DrawRefreshService(repository, source)

    _best_effort_telemetry(
        lambda: repository.start_job(
            job_name,
            FANTASY5,
            datetime.now(UTC).isoformat(),
        )
    )

    try:
        try:
            if not latest:
                refresh.ensure_history(FANTASY5)
            draw = refresh.fetch(FANTASY5)
        except httpx.HTTPError as error:
            if not _is_transient_source_error(error):
                raise
            acquisition = {
                "sourcePeriod": None,
                "databasePeriod": database_period,
                "writtenPeriod": None,
                "status": "not-acquired",
                "drawPeriod": database_period or "",
            }
        else:
            source_period = str(draw["period"])
            if _normalized_draw_date(draw.get("drawDate")) != _expected_source_draw_date(now):
                acquisition = {
                    "sourcePeriod": source_period,
                    "databasePeriod": database_period,
                    "writtenPeriod": None,
                    "status": "not-acquired",
                    "drawPeriod": source_period,
                }
            else:
                refresh.store(draw)
                refresh.ensure_history(FANTASY5)
                acquisition = {
                    "sourcePeriod": source_period,
                    "databasePeriod": database_period,
                    "writtenPeriod": source_period,
                    "status": "acquired",
                    "drawPeriod": source_period,
                }
    except Exception as error:
        _best_effort_telemetry(
            lambda: repository.finish_job(
                job_name,
                "failed",
                datetime.now(UTC).isoformat(),
                str(error)[:1000],
            )
        )
        raise

    job_status = "success" if acquisition["status"] == "acquired" else "waiting_source"
    _best_effort_telemetry(
        lambda: repository.finish_job(
            job_name,
            job_status,
            datetime.now(UTC).isoformat(),
            source_period=acquisition["sourcePeriod"],
            database_period=acquisition["databasePeriod"],
            written_period=acquisition["writtenPeriod"],
        )
    )
    return {
        "lottery": FANTASY5,
        "drawPeriod": acquisition["drawPeriod"],
        "status": acquisition["status"],
    }


def main() -> int:
    settings = load_settings()
    repository = create_supabase_repository(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
    with httpx.Client() as client:
        result = run_fantasy5_crawler(repository, LatestDrawSource(client))
    print(f'{result["lottery"]} {result["drawPeriod"] or "-"} {result["status"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
