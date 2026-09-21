"""Emit the existing Railway runtime evidence contract without storing job state."""

from collections.abc import Callable
from datetime import UTC, datetime
import json
from os import environ
from time import monotonic
from typing import Any


def log_worker_run(
    lottery: str,
    run_once: Callable[[], dict[str, Any]],
) -> dict[str, Any]:
    started_at = datetime.now(UTC)
    started_clock = monotonic()
    record: dict[str, Any] = {
        "lottery": lottery,
        "period": None,
        "outcome": "failed",
        "startedAt": started_at.isoformat(),
        "executionVersion": (
            environ.get("RAILWAY_GIT_COMMIT_SHA")
            or environ.get("GITHUB_SHA")
            or environ.get("CF_PAGES_COMMIT_SHA")
            or "unknown"
        ),
    }
    try:
        result = run_once()
        status = str(result.get("status") or "unknown")
        record["period"] = str(result["drawPeriod"]) if result.get("drawPeriod") else None
        record["outcome"] = {
            "complete": "already-analyzed" if result.get("skipped") else "analysis-completed",
            "acquired": "complete",
            "waiting-draw": "no-new-draw",
        }.get(status, status)
        record["stageTimingsMs"] = dict(result.get("stageTimingsMs") or {})
        return result
    except Exception as error:
        # Keep credentials and arbitrary exception text out of structured evidence.
        # The original exception still propagates to the existing failure handler.
        record["errorType"] = type(error).__name__
        raise
    finally:
        record["finishedAt"] = datetime.now(UTC).isoformat()
        record["durationMs"] = round((monotonic() - started_clock) * 1000, 3)
        print(json.dumps(record, ensure_ascii=False, separators=(",", ":")), flush=True)
