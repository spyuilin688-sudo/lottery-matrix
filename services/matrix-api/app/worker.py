import argparse
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta
from os import environ
from time import sleep
from typing import Any

import httpx

from app.card_renderer import card_layout
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
from app.services.notification_events import (
    NotificationDeliveryError,
    NotificationEventEmitter,
    lottery_result_event,
    matrix_card_event,
    matrix_status_event,
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
        if result.get("leaseAcquired") is False:
            return result
        if result.get("status") != "running":
            return result
    return result


def _notification_enabled(notification_emitter: NotificationEventEmitter | None) -> bool:
    return notification_emitter is not None and notification_emitter.enabled


def _card_ready(lottery: str, repository: AnalysisRepository) -> bool:
    required_rows = sum(card_layout(lottery)["column_rows"])
    return len(repository.list_draws(lottery, required_rows)) >= required_rows


def _latest_draw_for_period(
    lottery: str,
    period: str,
    repository: AnalysisRepository,
) -> dict[str, Any]:
    latest = repository.list_draws(lottery, 1)
    if not latest or str(latest[0].get("period")) != period:
        raise ValueError("NOTIFICATION_DRAW_NOT_AVAILABLE")
    return {"lottery": lottery, **latest[0]}


def _emit_notification_event(
    notification_emitter: NotificationEventEmitter | None,
    event: dict[str, Any] | None,
    emitted_event_keys: set[str],
) -> None:
    if not _notification_enabled(notification_emitter) or event is None:
        return
    event_key = str(event["eventKey"])
    if event_key in emitted_event_keys:
        return
    notification_emitter.emit(event)
    emitted_event_keys.add(event_key)


def _emit_early_notifications(
    draw: dict[str, Any],
    repository: AnalysisRepository,
    notification_emitter: NotificationEventEmitter | None,
    emitted_event_keys: set[str],
) -> None:
    if not _notification_enabled(notification_emitter):
        return
    events = [lottery_result_event(draw)]
    if _card_ready(str(draw["lottery"]), repository):
        events.append(matrix_card_event(draw))
    for event in events:
        try:
            _emit_notification_event(notification_emitter, event, emitted_event_keys)
        except NotificationDeliveryError:
            continue


def emit_ready_notifications(
    lottery: str,
    period: str,
    repository: AnalysisRepository,
    notification_emitter: NotificationEventEmitter | None,
    emitted_event_keys: set[str],
) -> None:
    if not _notification_enabled(notification_emitter):
        return
    draw = _latest_draw_for_period(lottery, period, repository)
    _emit_notification_event(
        notification_emitter,
        lottery_result_event(draw),
        emitted_event_keys,
    )
    if _card_ready(lottery, repository):
        _emit_notification_event(
            notification_emitter,
            matrix_card_event(draw),
            emitted_event_keys,
        )

    version = f"{period}:{ANALYSIS_VERSION}"
    progress = repository.get_progress(lottery, period, version)
    if progress is None or progress.get("status") != "complete":
        return
    status_artifact = repository.read_completed_artifact(lottery, period, "status")
    if not isinstance(status_artifact, Mapping):
        return
    _emit_notification_event(
        notification_emitter,
        matrix_status_event(lottery, period, status_artifact),
        emitted_event_keys,
    )


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
    if progress is not None and progress.get("status") == "complete" and repository.has_artifact(
        lottery, period, expected_version, "explore",
    ):
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
    notification_emitter: NotificationEventEmitter | None = None,
) -> dict[str, Any]:
    emitted_event_keys: set[str] = set()
    latest = repository.list_draws(lottery, 1)
    cycle = due_call_cycle(lottery, now)

    if cycle is None:
        if latest:
            resumed = _resume_stored_analysis(lottery, repository, source, latest[0], builders)
            if resumed is not None:
                if resumed.get("status") == "complete":
                    emit_ready_notifications(
                        lottery,
                        str(latest[0]["period"]),
                        repository,
                        notification_emitter,
                        emitted_event_keys,
                    )
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
            if resumed.get("status") == "complete":
                emit_ready_notifications(
                    lottery,
                    str(latest[0]["period"]),
                    repository,
                    notification_emitter,
                    emitted_event_keys,
                )
            return resumed
        emit_ready_notifications(
            lottery,
            str(latest[0]["period"]),
            repository,
            notification_emitter,
            emitted_event_keys,
        )
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
        _emit_early_notifications(
            draw,
            repository,
            notification_emitter,
            emitted_event_keys,
        )
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
    result = _run_analysis(repository, draw, history, builders)
    if result.get("status") == "complete":
        emit_ready_notifications(
            lottery,
            str(acquisition["drawPeriod"]),
            repository,
            notification_emitter,
            emitted_event_keys,
        )
    return result


def create_notification_emitter(
    settings: Any,
    client: httpx.Client,
) -> NotificationEventEmitter | None:
    url = str(getattr(settings, "notification_ingest_url", "") or "").strip()
    token = str(getattr(settings, "notification_ingest_token", "") or "").strip()
    if not url and not token:
        return None
    return NotificationEventEmitter(url, token, client)


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
        notification_emitter = create_notification_emitter(settings, client)
        if notification_emitter is None:
            result = run_scheduled_worker(lottery, None, repository, source)
        else:
            result = run_scheduled_worker(
                lottery,
                None,
                repository,
                source,
                notification_emitter=notification_emitter,
            )
    draw_period = result.get("drawPeriod", "-")
    print(f'{result["lottery"]} {draw_period} {result["status"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
