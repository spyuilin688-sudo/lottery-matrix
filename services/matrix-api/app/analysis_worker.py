import argparse
from collections.abc import Mapping
from datetime import UTC, datetime
from os import environ
from typing import Any

from app.repositories.card_repository import is_card_published
from app.services.card_publication import publish_current_card
from app.repositories.analysis_repository import (
    AnalysisRepository,
    create_supabase_repository,
)
from app.services.analysis_pipeline import ArtifactBuilder
from app.services.draw_refresh import recent_history_window, require_complete_history
from app.services.notification_events import (
    NotificationDeliveryError,
    NotificationEventEmitter,
    lottery_result_event,
    matrix_card_event,
    matrix_status_event,
    notification_emitter_context,
)
from app.settings import load_settings
from app.worker import ANALYSIS_VERSION, _draw_from_history, _run_analysis, analysis_version_for_order


FANTASY5 = "天天樂"
ANALYSIS_CANDIDATE_LIMIT = 32


def _select_analysis_draw(
    draws: list[dict[str, Any]],
    progress_by_period: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    completed_indices = [
        index
        for index, draw in enumerate(draws)
        if progress_by_period.get(str(draw["period"]), {}).get("status") == "complete"
    ]
    if not completed_indices:
        return draws[0]

    newest_complete = min(completed_indices)
    pending_new_draws = [
        draw
        for draw in draws[:newest_complete]
        if progress_by_period.get(str(draw["period"]), {}).get("status") != "complete"
    ]
    if pending_new_draws:
        return pending_new_draws[-1]

    oldest_complete = max(completed_indices)
    analysis_gaps = [
        draw
        for draw in draws[newest_complete + 1:oldest_complete]
        if progress_by_period.get(str(draw["period"]), {}).get("status") != "complete"
    ]
    return analysis_gaps[-1] if analysis_gaps else draws[0]


def _history_through_period(
    history: list[dict[str, Any]],
    period: str,
) -> list[dict[str, Any]]:
    for index, draw in enumerate(history):
        if str(draw.get("period")) == period:
            return history[index:]
    raise ValueError("DRAW_HISTORY_INCOMPLETE")


def _restore_completed_explore_results(
    repository: AnalysisRepository,
    lottery: str,
    period: str,
    analysis_version: str,
) -> None:
    if repository.has_explore_results(lottery, period, analysis_version):
        return
    artifact = repository.read_artifact(
        lottery,
        period,
        analysis_version,
        "explore",
    )
    if artifact is not None:
        repository.save_explore_results(
            lottery,
            period,
            analysis_version,
            artifact,
        )


def _restore_completed_tianheng_results(
    repository: AnalysisRepository,
    lottery: str,
    period: str,
    analysis_version: str,
) -> None:
    artifact = repository.read_artifact(lottery, period, analysis_version, "tianheng")
    if artifact is None:
        return
    expected_count = len(artifact.get("items", []))
    if repository.has_tianheng_results(
        lottery, period, analysis_version, expected_count,
    ):
        return
    repository.save_tianheng_results(lottery, period, analysis_version, artifact)


def _notification_enabled(notification_emitter: NotificationEventEmitter | None) -> bool:
    return notification_emitter is not None and notification_emitter.enabled


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


def _emit_early_result(
    draw: dict[str, Any],
    notification_emitter: NotificationEventEmitter | None,
    emitted_event_keys: set[str],
) -> None:
    if not _notification_enabled(notification_emitter):
        return
    try:
        _emit_notification_event(
            notification_emitter,
            lottery_result_event(draw),
            emitted_event_keys,
        )
    except NotificationDeliveryError:
        pass


def _emit_ready_notifications(
    draw: dict[str, Any],
    history: list[dict[str, Any]],
    repository: AnalysisRepository,
    notification_emitter: NotificationEventEmitter | None,
    emitted_event_keys: set[str],
) -> None:
    if not _notification_enabled(notification_emitter):
        return
    lottery = str(draw["lottery"])
    period = str(draw["period"])
    latest = repository.list_draws(lottery, 1)
    if not latest or str(latest[0].get("period")) != period:
        return
    _emit_notification_event(
        notification_emitter,
        lottery_result_event(draw),
        emitted_event_keys,
    )
    version = analysis_version_for_order(period)
    if is_card_published(lottery, period, repository):
        _emit_notification_event(
            notification_emitter,
            matrix_card_event(draw),
            emitted_event_keys,
        )

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


def run_analysis_only_worker(
    lottery: str,
    repository: AnalysisRepository,
    builders: Mapping[str, ArtifactBuilder] | None = None,
    *,
    notification_emitter: NotificationEventEmitter | None = None,
) -> dict[str, Any]:
    if lottery != FANTASY5:
        raise ValueError("ANALYSIS_ONLY_LOTTERY_UNSUPPORTED")

    emitted_event_keys: set[str] = set()
    publish_current_card(lottery, repository)
    candidates = repository.list_draws(lottery, ANALYSIS_CANDIDATE_LIMIT)
    if not candidates:
        return {
            "lottery": lottery,
            "drawPeriod": "",
            "status": "waiting-draw",
        }

    periods = [str(draw["period"]) for draw in candidates]
    progress_by_period = repository.list_progress_for_periods(
        lottery,
        periods,
        f"{ANALYSIS_VERSION}-sorted",
    )
    selected = _select_analysis_draw(candidates, progress_by_period)
    period = str(selected["period"])
    analysis_version = analysis_version_for_order(period)
    draw = {"lottery": lottery, **selected}
    _emit_early_result({"lottery": lottery, **candidates[0]}, notification_emitter, emitted_event_keys)

    progress = progress_by_period.get(period)
    if progress is not None and progress.get("status") == "complete" and repository.has_artifact(
        lottery, period, analysis_version, "explore",
    ):
        _restore_completed_explore_results(
            repository,
            lottery,
            period,
            analysis_version,
        )
        _restore_completed_tianheng_results(
            repository, lottery, period, analysis_version,
        )
        history = _history_through_period(
            repository.list_draws(lottery, None),
            period,
        )
        _emit_ready_notifications(
            draw,
            history,
            repository,
            notification_emitter,
            emitted_event_keys,
        )
        return {
            "lottery": lottery,
            "drawPeriod": period,
            "analysisVersion": analysis_version,
            "status": "already-analyzed",
        }

    repository.cleanup_expired(datetime.now(UTC))
    history = _history_through_period(
        repository.list_draws(lottery, None),
        period,
    )
    require_complete_history(
        lottery,
        recent_history_window(history),
        period,
    )
    draw = _draw_from_history(lottery, period, history)
    result = _run_analysis(repository, draw, history, builders)
    if result.get("status") == "complete":
        _emit_ready_notifications(
            draw,
            history,
            repository,
            notification_emitter,
            emitted_event_keys,
        )
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Analyze pending stored Fantasy5 draws without crawling",
    )
    parser.add_argument("--lottery", choices=[FANTASY5])
    args = parser.parse_args(argv)
    lottery = args.lottery or environ.get("MATRIX_LOTTERY", "").strip()
    if lottery != FANTASY5:
        parser.error("set --lottery or MATRIX_LOTTERY to 天天樂")

    settings = load_settings()
    repository = create_supabase_repository(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
    with notification_emitter_context(settings) as notification_emitter:
        if notification_emitter is None:
            result = run_analysis_only_worker(lottery, repository)
        else:
            result = run_analysis_only_worker(
                lottery,
                repository,
                notification_emitter=notification_emitter,
            )
    print(f'{result["lottery"]} {result["drawPeriod"] or "-"} {result["status"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
