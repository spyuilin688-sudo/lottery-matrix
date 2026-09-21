from collections.abc import Callable
from datetime import UTC, datetime
import json
import os
import ssl
from time import monotonic
from typing import Any

import httpx

from app.repositories.analysis_repository import create_supabase_repository
from app.scraping.resilient_source import wrap_source_with_tinyfish
from app.scraping.sources import LatestDrawSource
from app.settings import load_settings
from app.services.marksix_calendar import sync_marksix_calendar
from app.services.tinyfish_status import create_tinyfish_telemetry
from app.worker import certify_completed_result, _read_worker_completion, create_notification_emitter, run_scheduled_worker


LOTTERIES = ("今彩539", "六合彩", "大樂透")


def _worker_outcome(result: dict[str, Any]) -> str:
    explicit = result.get("outcome")
    if explicit:
        return str(explicit)
    if result.get("repairCompleted"):
        return "repair-completed"
    status = str(result.get("status") or "")
    if status == "complete":
        return "already-analyzed" if result.get("skipped") else "analysis-completed"
    if status == "already-acquired":
        return "already-acquired"
    if status == "already-analyzed":
        return "already-analyzed"
    if status in {"not-acquired", "not-due", "waiting-draw"}:
        return "no-new-draw"
    if status in {"superseded", "skipped"}:
        return "skipped"
    if status == "notification-only":
        return status
    return "running" if status == "running" else "skipped"


def _execution_version() -> str:
    return (
        os.environ.get("RAILWAY_GIT_COMMIT_SHA")
        or os.environ.get("GITHUB_SHA")
        or os.environ.get("CF_PAGES_COMMIT_SHA")
        or "unknown"
    )


def _needs_formal_source_retry(repository: Any, lottery: str) -> bool:
    list_draws = getattr(repository, "list_draws", None)
    if not callable(list_draws):
        return False
    latest = list_draws(lottery, 1)
    return bool(
        latest
        and latest[0].get("resultStatus", "confirmed") == "preliminary"
    )


def create_railway_ssl_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    if hasattr(ssl, "VERIFY_X509_STRICT"):
        context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return context


def run_all_workers(
    run_one: Callable[[str], dict[str, Any]],
    *,
    lotteries: tuple[str, ...] = LOTTERIES,
) -> dict[str, Any]:
    completed: list[str] = []
    failed: dict[str, str] = {}
    runs: list[dict[str, Any]] = []
    for lottery in lotteries:
        started_at = datetime.now(UTC)
        started_clock = monotonic()
        try:
            result = run_one(lottery)
            completed.append(lottery)
            finished_at = datetime.now(UTC)
            runs.append({
                "lottery": lottery,
                "period": result.get("drawPeriod"),
                "outcome": _worker_outcome(result),
                "startedAt": started_at.isoformat(),
                "finishedAt": finished_at.isoformat(),
                "durationMs": round((monotonic() - started_clock) * 1000, 3),
                "stageTimingsMs": dict(result.get("stageTimingsMs") or {}),
                "executionVersion": _execution_version(),
            })
        except Exception as error:
            failed[lottery] = str(error)
            finished_at = datetime.now(UTC)
            runs.append({
                "lottery": lottery,
                "period": None,
                "outcome": "failed",
                "startedAt": started_at.isoformat(),
                "finishedAt": finished_at.isoformat(),
                "durationMs": round((monotonic() - started_clock) * 1000, 3),
                "stageTimingsMs": {},
                "executionVersion": _execution_version(),
            })
    return {"completed": completed, "failed": failed, "runs": runs}


def main() -> int:
    settings = load_settings()
    repository = create_supabase_repository(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
    with httpx.Client(verify=create_railway_ssl_context()) as client:
        calendar = sync_marksix_calendar(repository, client)
        if calendar['status'] != 'not-due':
            print(f"六合彩 calendar {calendar['status']}")
        source = wrap_source_with_tinyfish(
            LatestDrawSource(client),
            client,
            settings,
            telemetry=create_tinyfish_telemetry(repository),
        )
        notification_emitter = create_notification_emitter(settings, client)

        def run_one(lottery: str) -> dict[str, Any]:
            completion = _read_worker_completion(lottery, repository, notification_emitter)
            options: dict[str, Any] = {}
            if completion is not None:
                options["_completion_snapshot"] = completion
                retry_formal_source = bool(
                    completion.get("draw")
                    and completion["draw"].get("resultStatus") == "preliminary"
                )
            else:
                retry_formal_source = _needs_formal_source_retry(repository, lottery)
            if retry_formal_source:
                options["allow_recovery_crawl"] = True
            if notification_emitter is not None:
                options["notification_emitter"] = notification_emitter
            result = run_scheduled_worker(lottery, None, repository, source, **options)
            certify_completed_result(lottery, result, repository, notification_emitter)
            return result

        result = run_all_workers(run_one)
    for run in result["runs"]:
        print(json.dumps(run, ensure_ascii=False, separators=(",", ":")))
    for lottery, error in result["failed"].items():
        print(f"{lottery} failed: {error}")
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
