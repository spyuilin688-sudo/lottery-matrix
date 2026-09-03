import argparse
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta
from os import environ
from time import sleep
from typing import Any

import httpx

from app.repositories.analysis_repository import AnalysisRepository, JOB_NAME_BY_LOTTERY, create_supabase_repository
from app.schedule import due_call_cycle, previous_lottery_call_time
from app.scraping.sources import LatestDrawSource
from app.services.analysis_pipeline import AnalysisPipeline, ArtifactBuilder
from app.services.artifact_builders import create_artifact_builders
from app.services.draw_refresh import (
    DrawRefreshService,
    DrawSource,
    recent_history_window,
    require_complete_history,
)
from app.settings import load_settings


EXPLORE_BATCH_SIZE = 10
MAX_CYCLES_PER_INVOCATION = 450
MAX_FAILURES_PER_INVOCATION = 3
RETRY_BACKOFF_SECONDS = (15.0, 45.0)
ANALYSIS_VERSION = "matrix-python-v12"


def _draw_from_history(
    lottery: str,
    period: str,
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    for stored in history:
        if str(stored.get("period")) == period:
            return {"lottery": lottery, **stored}
    raise ValueError("DRAW_HISTORY_INCOMPLETE")


def _is_transient_service_error(error: Exception) -> bool:
    code = str(getattr(error, "code", "") or "").upper()
    if code == "57014" or code in {"PGRST000", "PGRST001", "PGRST002", "PGRST003"}:
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


def _wait_before_retry(error: Exception, failures: int) -> None:
    if not _is_transient_service_error(error):
        return
    delay_index = min(max(0, failures - 1), len(RETRY_BACKOFF_SECONDS) - 1)
    sleep(RETRY_BACKOFF_SECONDS[delay_index])


def _run_analysis(
    repository: AnalysisRepository,
    draw: dict[str, Any],
    history: list[dict[str, Any]],
    builders: Mapping[str, ArtifactBuilder] | None,
) -> dict[str, Any]:
    require_complete_history(
        str(draw["lottery"]), recent_history_window(history), str(draw["period"]),
    )
    version = f'{draw["period"]}:{ANALYSIS_VERSION}'
    pipeline = AnalysisPipeline(
        repository,
        builders or create_artifact_builders(),
        version,
        explore_batch_size=EXPLORE_BATCH_SIZE,
    )
    failures = 0
    result: dict[str, Any] = {}
    for _ in range(MAX_CYCLES_PER_INVOCATION):
        try:
            result = pipeline.run(draw, history)
            failures = 0
        except Exception as error:
            failures += 1
            if failures >= MAX_FAILURES_PER_INVOCATION:
                raise
            _wait_before_retry(error, failures)
            continue
        if result.get("status") != "running":
            return result
    return result


def _best_effort_telemetry(write: Callable[[], None]) -> None:
    try:
        write()
    except Exception:
        pass


def _run_tracked_job(
    lottery: str,
    repository: AnalysisRepository,
    execute: Callable[[], dict[str, Any]],
) -> dict[str, Any]:
    job_name = JOB_NAME_BY_LOTTERY[lottery]
    _best_effort_telemetry(
        lambda: repository.start_job(job_name, lottery, datetime.now(UTC).isoformat())
    )
    try:
        result = execute()
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
    job_status = "waiting_source" if result.get("status") == "not-acquired" else "success"
    _best_effort_telemetry(
        lambda: repository.finish_job(
            job_name,
            job_status,
            datetime.now(UTC).isoformat(),
            source_period=result.get("sourcePeriod"),
            database_period=result.get("databasePeriod"),
            written_period=result.get("writtenPeriod"),
        )
    )
    return result


def _normalized_draw_date(value: Any) -> str:
    return str(value or "").strip().replace("/", "-").replace(".", "-")[:10]


def _expected_source_draw_date(lottery: str, cycle: datetime) -> str:
    source_date = cycle.date()
    if lottery == "天天樂":
        source_date -= timedelta(days=1)
    return source_date.isoformat()


def _resume_stored_analysis(
    lottery: str,
    repository: AnalysisRepository,
    source: DrawSource,
    latest_draw: dict[str, Any],
    builders: Mapping[str, ArtifactBuilder] | None,
) -> dict[str, Any] | None:
    period = str(latest_draw["period"])
    expected_version = f"{period}:{ANALYSIS_VERSION}"
    progress = repository.get_progress(lottery, period, expected_version)
    if progress is not None and progress.get("status") == "complete":
        if not repository.has_explore_results(lottery, period, expected_version):
            artifact = repository.read_artifact(lottery, period, expected_version, "explore")
            if artifact is not None:
                repository.save_explore_results(
                    lottery, period, expected_version, artifact,
                )
        return None

    refresh = DrawRefreshService(repository, source)
    history: list[dict[str, Any]] | None = None
    if builders is None:
        history = refresh.ensure_algorithm_history(lottery)
    else:
        refresh.ensure_history(lottery)
    repository.cleanup_expired(datetime.now(UTC))
    if history is None:
        history = repository.list_draws(lottery, None)
    draw = _draw_from_history(lottery, period, history)
    return _run_analysis(repository, draw, history, builders)


def run_scheduled_worker(
    lottery: str,
    now: datetime | None,
    repository: AnalysisRepository,
    source: DrawSource,
    builders: Mapping[str, ArtifactBuilder] | None = None,
) -> dict[str, Any]:
    latest = repository.list_draws(lottery, 1)
    cycle = due_call_cycle(lottery, now)

    if cycle is None:
        if latest:
            resumed = _resume_stored_analysis(lottery, repository, source, latest[0], builders)
            if resumed is not None:
                return resumed
        return {"lottery": lottery, "status": "not-due"}

    current = now or datetime.now(cycle.tzinfo)
    is_pre_draw_recovery = current.astimezone(cycle.tzinfo) < cycle
    target_cycle = previous_lottery_call_time(lottery, cycle) if is_pre_draw_recovery else cycle
    expected_draw_date = _expected_source_draw_date(lottery, target_cycle)
    latest_draw_date = _normalized_draw_date(latest[0].get("drawDate")) if latest else ""

    if latest and (
        latest_draw_date == expected_draw_date
        or (is_pre_draw_recovery and latest_draw_date > expected_draw_date)
    ):
        if is_pre_draw_recovery:
            return {
                "lottery": lottery,
                "drawPeriod": latest[0]["period"],
                "status": "already-acquired",
            }
        resumed = _resume_stored_analysis(lottery, repository, source, latest[0], builders)
        if resumed is not None:
            return resumed
        return {
            "lottery": lottery,
            "drawPeriod": latest[0]["period"],
            "status": "already-acquired",
        }

    database_period = str(latest[0]["period"]) if latest else None
    refresh = DrawRefreshService(repository, source)

    def acquire() -> dict[str, Any]:
        repository.cleanup_expired(datetime.now(UTC))
        try:
            if not repository.list_draws(lottery, 1):
                refresh.ensure_history(lottery)
            draw = refresh.fetch(lottery)
        except httpx.HTTPError as error:
            if lottery == "天天樂" and _is_transient_service_error(error):
                return {
                    "lottery": lottery,
                    "drawPeriod": database_period or "",
                    "status": "not-acquired",
                    "sourcePeriod": None,
                    "databasePeriod": database_period,
                    "writtenPeriod": None,
                }
            raise
        source_period = str(draw["period"])

        if _normalized_draw_date(draw.get("drawDate")) != expected_draw_date:
            return {
                "lottery": lottery,
                "drawPeriod": draw["period"],
                "status": "not-acquired",
                "sourcePeriod": source_period,
                "databasePeriod": database_period,
                "writtenPeriod": None,
            }

        refresh.store(draw)
        refresh.ensure_history(lottery)
        return {
            "lottery": lottery,
            "drawPeriod": draw["period"],
            "status": "acquired",
            "sourcePeriod": source_period,
            "databasePeriod": database_period,
            "writtenPeriod": source_period,
        }

    acquisition = _run_tracked_job(lottery, repository, acquire)
    if acquisition["status"] != "acquired":
        return {
            "lottery": lottery,
            "drawPeriod": acquisition["drawPeriod"],
            "status": acquisition["status"],
        }

    if builders is None:
        history = refresh.ensure_algorithm_history(lottery)
    else:
        history = repository.list_draws(lottery, None)
    draw = _draw_from_history(lottery, str(acquisition["drawPeriod"]), history)
    return _run_analysis(repository, draw, history, builders)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refresh and analyze one Matrix lottery")
    lotteries = ["今彩539", "天天樂", "六合彩", "大樂透"]
    parser.add_argument("--lottery", choices=lotteries)
    parser.add_argument("--scheduled", action="store_true")
    args = parser.parse_args(argv)
    lottery = args.lottery or environ.get("MATRIX_LOTTERY", "").strip()
    if lottery not in lotteries:
        parser.error("set --lottery or MATRIX_LOTTERY to one supported lottery")
    settings = load_settings()
    repository = create_supabase_repository(settings.supabase_url, settings.supabase_secret_key)
    with httpx.Client() as client:
        source = LatestDrawSource(client)
        result = run_scheduled_worker(lottery, None, repository, source)
    draw_period = result.get("drawPeriod", "-")
    print(f'{result["lottery"]} {draw_period} {result["status"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
