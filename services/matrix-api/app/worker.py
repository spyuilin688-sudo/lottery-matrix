import argparse
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from os import environ
from typing import Any

import httpx

from app.repositories.analysis_repository import AnalysisRepository, JOB_NAME_BY_LOTTERY, create_supabase_repository
from app.schedule import due_call_cycle
from app.scraping.sources import LatestDrawSource
from app.services.analysis_pipeline import AnalysisPipeline, ArtifactBuilder
from app.services.artifact_builders import create_artifact_builders
from app.services.draw_refresh import DrawRefreshService, DrawSource
from app.settings import load_settings


EXPLORE_BATCH_SIZE = 10
TIANGONG_BATCH_SIZE = 20
MAX_CYCLES_PER_INVOCATION = 100
MAX_FAILURES_PER_INVOCATION = 3
ANALYSIS_VERSION = "matrix-python-v6"


def _run_analysis(
    repository: AnalysisRepository,
    draw: dict[str, Any],
    history: list[dict[str, Any]],
    builders: Mapping[str, ArtifactBuilder] | None,
) -> dict[str, Any]:
    version = f'{draw["period"]}:{ANALYSIS_VERSION}'
    pipeline = AnalysisPipeline(
        repository,
        builders or create_artifact_builders(),
        version,
        explore_batch_size=EXPLORE_BATCH_SIZE,
        tiangong_batch_size=TIANGONG_BATCH_SIZE,
    )
    failures = 0
    result: dict[str, Any] = {}
    for _ in range(MAX_CYCLES_PER_INVOCATION):
        try:
            result = pipeline.run(draw, history)
            failures = 0
        except Exception:
            failures += 1
            if failures >= MAX_FAILURES_PER_INVOCATION:
                raise
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
    _best_effort_telemetry(
        lambda: repository.finish_job(job_name, "success", datetime.now(UTC).isoformat())
    )
    return result


def _run_worker_untracked(
    lottery: str,
    repository: AnalysisRepository,
    source: DrawSource,
    builders: Mapping[str, ArtifactBuilder] | None = None,
) -> dict[str, Any]:
    preparation_error: Exception | None = None
    for _ in range(MAX_FAILURES_PER_INVOCATION):
        try:
            repository.cleanup_expired(datetime.now(UTC))
            refresh = DrawRefreshService(repository, source)
            refresh.ensure_history(lottery)
            draw = refresh.refresh(lottery)
            history = repository.list_draws(lottery, None)
            if not history:
                raise ValueError("DRAW_HISTORY_INCOMPLETE")
            break
        except Exception as error:
            if isinstance(error, ValueError):
                raise
            preparation_error = error
    else:
        assert preparation_error is not None
        raise preparation_error

    return _run_analysis(repository, draw, history, builders)


def run_worker(
    lottery: str,
    repository: AnalysisRepository,
    source: DrawSource,
    builders: Mapping[str, ArtifactBuilder] | None = None,
) -> dict[str, Any]:
    return _run_tracked_job(
        lottery,
        repository,
        lambda: _run_worker_untracked(lottery, repository, source, builders),
    )


def _normalized_draw_date(value: Any) -> str:
    return str(value or "").strip().replace("/", "-").replace(".", "-")[:10]


def _resume_stored_analysis(
    lottery: str,
    repository: AnalysisRepository,
    latest_draw: dict[str, Any],
    builders: Mapping[str, ArtifactBuilder] | None,
) -> dict[str, Any] | None:
    period = str(latest_draw["period"])
    expected_version = f"{period}:{ANALYSIS_VERSION}"
    progress = repository.get_progress(lottery, period, expected_version)
    if progress is not None and progress.get("status") == "complete":
        return None

    history = repository.list_draws(lottery, None)
    if not history:
        return None

    repository.cleanup_expired(datetime.now(UTC))
    draw = {"lottery": lottery, **latest_draw}
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
            resumed = _resume_stored_analysis(lottery, repository, latest[0], builders)
            if resumed is not None:
                return resumed
        return {"lottery": lottery, "status": "not-due"}

    cycle_date = cycle.date().isoformat()
    if latest and _normalized_draw_date(latest[0].get("drawDate")) == cycle_date:
        resumed = _resume_stored_analysis(lottery, repository, latest[0], builders)
        if resumed is not None:
            return resumed
        return {
            "lottery": lottery,
            "drawPeriod": latest[0]["period"],
            "status": "already-acquired",
        }

    def execute() -> dict[str, Any]:
        repository.cleanup_expired(datetime.now(UTC))
        refresh = DrawRefreshService(repository, source)
        refresh.ensure_history(lottery)
        draw = refresh.refresh(lottery)

        if _normalized_draw_date(draw.get("drawDate")) != cycle_date:
            return {
                "lottery": lottery,
                "drawPeriod": draw["period"],
                "status": "not-acquired",
            }

        history = repository.list_draws(lottery, None)
        if not history:
            raise ValueError("DRAW_HISTORY_INCOMPLETE")
        return _run_analysis(repository, draw, history, builders)

    return _run_tracked_job(lottery, repository, execute)


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
        result = (
            run_scheduled_worker(lottery, None, repository, source)
            if args.scheduled
            else run_worker(lottery, repository, source)
        )
    draw_period = result.get("drawPeriod", "-")
    print(f'{result["lottery"]} {draw_period} {result["status"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
