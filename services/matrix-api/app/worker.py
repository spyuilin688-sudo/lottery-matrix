import argparse
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta
from os import environ
from time import sleep
from typing import Any

import httpx

from app.domain.explore_state import DRAW_ORDER, SORTED_ORDER
from app.domain.history_boundaries import has_complete_draw_order, period_sort_key
from app.domain.models import lottery_position_count
from app.repositories.card_repository import is_card_published
from app.services.card_publication import publish_current_card
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
ANALYSIS_VERSION = "matrix-python-v14"


def analysis_version_for_order(period: str, number_order: str = SORTED_ORDER) -> str:
    if number_order not in {SORTED_ORDER, DRAW_ORDER}:
        raise ValueError("NUMBER_ORDER_UNSUPPORTED")
    return f"{period}:{ANALYSIS_VERSION}-{'sorted' if number_order == SORTED_ORDER else 'draw'}"


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
    *,
    number_order: str = SORTED_ORDER,
) -> dict[str, Any]:
    require_complete_history(
        str(draw["lottery"]), recent_history_window(history), str(draw["period"]),
    )
    version = analysis_version_for_order(str(draw["period"]), number_order)
    pipeline = AnalysisPipeline(
        repository,
        builders or create_artifact_builders(),
        version,
        explore_batch_size=EXPLORE_BATCH_SIZE,
        number_orders=(number_order,),
    )
    failures = 0
    result: dict[str, Any] = {}
    for _ in range(MAX_CYCLES_PER_INVOCATION):
        try:
            result = pipeline.run(draw, history)
            failures = 0
        except Exception as error:
            if str(error) in {"ANALYSIS_DRAW_CHANGED", "ANALYSIS_RUN_LEASE_LOST"}:
                return {"lottery": draw["lottery"], "drawPeriod": draw["period"], "analysisVersion": version, "status": "superseded"}
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


def _card_ready(lottery: str, period: str, repository: AnalysisRepository) -> bool:
    return is_card_published(lottery, period, repository)


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
    if _card_ready(lottery, period, repository):
        _emit_notification_event(
            notification_emitter,
            matrix_card_event(draw),
            emitted_event_keys,
        )

    version = analysis_version_for_order(period)
    progress = repository.get_progress(lottery, period, version)
    if progress is None or progress.get("status") != "complete":
        return
    status_artifact = repository.read_artifact(lottery, period, version, "status")
    if not isinstance(status_artifact, Mapping):
        return
    _emit_notification_event(
        notification_emitter,
        matrix_status_event(lottery, period, status_artifact, draw_date=draw["drawDate"]),
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


def _expected_source_draw_dates(lottery: str, cycle: datetime) -> frozenset[str]:
    source_date = cycle.date()
    dates = {source_date.isoformat()}
    if lottery == "六合彩" and cycle.weekday() == 6:
        dates.add((source_date - timedelta(days=1)).isoformat())
    return frozenset(dates)


def _restore_stage_results(repository: AnalysisRepository, lottery: str, period: str, version: str) -> None:
    if not repository.has_explore_results(lottery, period, version):
        repository.restore_completed_results(lottery, period, version, "explore")
    repository.restore_completed_results(lottery, period, version, "tianheng")


def _resume_stored_analysis(
    lottery: str,
    repository: AnalysisRepository,
    source: DrawSource,
    latest_draw: dict[str, Any],
    builders: Mapping[str, ArtifactBuilder] | None,
    *,
    on_cards_ready: Callable[[], None] | None = None,
) -> dict[str, Any] | None:
    period = str(latest_draw["period"])
    result = None
    refresh = DrawRefreshService(repository, source)
    for number_order in (SORTED_ORDER, DRAW_ORDER):
        current = repository.get_draw(lottery, period)
        if current is None:
            return {"lottery": lottery, "drawPeriod": period, "status": "superseded"}
        if number_order == DRAW_ORDER and (lottery == "天天樂" or current.get("resultStatus", "confirmed") == "preliminary"):
            break
        version = analysis_version_for_order(period, number_order)
        progress = repository.get_progress(lottery, period, version)
        if progress is not None and progress.get("status") == "complete" and repository.has_artifact(lottery, period, version, "explore"):
            _restore_stage_results(repository, lottery, period, version)
            continue
        history_error: Exception | None = None
        if number_order == SORTED_ORDER:
            # Preliminary work uses the already stored sorted history and never
            # starts the expensive actual-order archive repair path.
            if current.get("resultStatus", "confirmed") != "preliminary":
                refresh.ensure_history(lottery)
            history = repository.list_draws(lottery, None)
        elif builders is None:
            try:
                history = refresh.ensure_algorithm_history(lottery)
            except Exception as error:
                # Archive repair can persist sorted corrections before failing
                # its actual-order validation. Keep that sorted stage current.
                history_error = error
                history = repository.list_draws(lottery, None)
        else:
            if not has_complete_draw_order(current, lottery_position_count(lottery)):
                break
            history = repository.list_draws(lottery, None)
        history = sorted(
            (row for row in history if period_sort_key(lottery, row["period"]) <= period_sort_key(lottery, period)),
            key=lambda row: period_sort_key(lottery, row["period"]), reverse=True,
        )
        draw = _draw_from_history(lottery, period, history)
        if number_order == DRAW_ORDER:
            publish_current_card(lottery, repository)
            if on_cards_ready is not None:
                on_cards_ready()
            if repository.get_progress(lottery, period, analysis_version_for_order(period)) is None:
                repaired = _run_analysis(repository, draw, history, builders, number_order=SORTED_ORDER)
                result = repaired
                if repaired.get("status") == "superseded":
                    return repaired
            if history_error is not None:
                raise history_error
        repository.cleanup_expired(datetime.now(UTC))
        stage_result = _run_analysis(repository, draw, history, builders, number_order=number_order)
        if result is None or stage_result.get("status") != "complete" or result.get("status") == "complete":
            result = stage_result
        if stage_result.get("status") == "superseded":
            return stage_result
    return result


def run_scheduled_worker(
    lottery: str,
    now: datetime | None,
    repository: AnalysisRepository,
    source: DrawSource,
    builders: Mapping[str, ArtifactBuilder] | None = None,
    notification_emitter: NotificationEventEmitter | None = None,
    allow_recovery_crawl: bool = False,
) -> dict[str, Any]:
    emitted_event_keys: set[str] = set()
    latest = repository.list_draws(lottery, 1)
    publish_current_card(lottery, repository, now)
    def notify_cards(*, final: bool = False) -> None:
        current = repository.list_draws(lottery, 1)
        if current:
            try:
                emit_ready_notifications(lottery, str(current[0]["period"]), repository, notification_emitter, emitted_event_keys)
            except NotificationDeliveryError:
                if final:
                    raise
    notify_cards()
    if allow_recovery_crawl:
        cycle = due_call_cycle(lottery, now, allow_weekend_fallback=True)
    else:
        cycle = due_call_cycle(lottery, now)

    if cycle is None:
        if latest:
            resumed = _resume_stored_analysis(lottery, repository, source, latest[0], builders, on_cards_ready=notify_cards)
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
                lottery, str(latest[0]["period"]), repository,
                notification_emitter, emitted_event_keys,
            )
        return {"lottery": lottery, "status": "not-due"}

    current = now or datetime.now(cycle.tzinfo)
    current_minute = current.astimezone(cycle.tzinfo).replace(second=0, microsecond=0)
    is_pre_draw_recovery = current.astimezone(cycle.tzinfo) < cycle
    target_cycle = previous_lottery_call_time(lottery, cycle) if is_pre_draw_recovery else cycle
    expected_draw_dates = _expected_source_draw_dates(lottery, target_cycle)
    oldest_expected_draw_date = min(expected_draw_dates)
    latest_draw_date = _normalized_draw_date(latest[0].get("drawDate")) if latest else ""

    if latest and latest[0].get("resultStatus", "confirmed") != "preliminary" and (
        latest_draw_date in expected_draw_dates
        or (is_pre_draw_recovery and latest_draw_date > oldest_expected_draw_date)
    ):
        if is_pre_draw_recovery:
            return {
                "lottery": lottery,
                "drawPeriod": latest[0]["period"],
                "status": "already-acquired",
            }
        resumed = _resume_stored_analysis(lottery, repository, source, latest[0], builders, on_cards_ready=notify_cards)
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

    if not allow_recovery_crawl and current_minute != cycle:
        if latest and latest[0].get("resultStatus") == "preliminary":
            resumed = _resume_stored_analysis(lottery, repository, source, latest[0], builders, on_cards_ready=notify_cards)
            if resumed is not None:
                return resumed
        return {"lottery": lottery, "status": "not-due"}

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

        if _normalized_draw_date(draw.get("drawDate")) not in expected_draw_dates:
            return {
                "lottery": lottery,
                "drawPeriod": draw["period"],
                "status": "not-acquired",
                "sourcePeriod": source_period,
                "databasePeriod": database_period,
                "writtenPeriod": None,
            }

        draw = refresh.store(draw)
        refresh.ensure_history(lottery)
        publish_current_card(lottery, repository, now)
        notify_cards()
        return {
            "lottery": lottery,
            "drawPeriod": draw["period"],
            "status": "acquired",
            "sourcePeriod": source_period,
            "databasePeriod": database_period,
            "writtenPeriod": source_period,
        }

    try:
        acquisition = _run_tracked_job(lottery, repository, acquire)
    except httpx.HTTPError:
        if latest and latest[0].get("resultStatus") == "preliminary":
            _resume_stored_analysis(lottery, repository, source, latest[0], builders, on_cards_ready=notify_cards)
        raise
    if acquisition["status"] != "acquired":
        if latest and latest[0].get("resultStatus") == "preliminary":
            _resume_stored_analysis(lottery, repository, source, latest[0], builders, on_cards_ready=notify_cards)
        return {"lottery": lottery, "drawPeriod": acquisition["drawPeriod"], "status": acquisition["status"]}

    stored = repository.get_draw(lottery, str(acquisition["drawPeriod"]))
    if stored is None:
        return {"lottery": lottery, "drawPeriod": acquisition["drawPeriod"], "status": "superseded"}
    result = _resume_stored_analysis(lottery, repository, source, stored, builders, on_cards_ready=notify_cards)
    notify_cards(final=True)
    return result or {"lottery": lottery, "drawPeriod": acquisition["drawPeriod"], "status": "already-acquired"}


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
