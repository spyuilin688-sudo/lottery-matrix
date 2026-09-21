from collections.abc import Callable
from datetime import UTC, datetime
import json
from typing import Any


TINYFISH_JOB_NAME_BY_LOTTERY = {
    "今彩539": "matrix-tinyfish-539-fallback-v1",
    "天天樂": "matrix-tinyfish-fantasy5-fallback-v1",
    "六合彩": "matrix-tinyfish-marksix-fallback-v1",
    "大樂透": "matrix-tinyfish-649-fallback-v1",
}


def _project_tinyfish_row(row: dict[str, Any]) -> dict[str, Any] | None:
    lottery = str(row.get("lottery") or "")
    if lottery not in TINYFISH_JOB_NAME_BY_LOTTERY:
        return None
    status = str(row.get("status") or "")
    if status not in {"success", "failed"}:
        return None
    finished_at = row.get("finishedAt", row.get("finished_at"))
    if not isinstance(finished_at, str) or not finished_at:
        return None
    source_period = row.get("sourcePeriod", row.get("source_period"))
    error = row.get("error")
    return {
        "lottery": lottery,
        "status": status,
        "finishedAt": finished_at,
        "sourcePeriod": str(source_period) if source_period is not None else None,
        "error": "TINYFISH_FAILED" if error else None,
    }


def record_tinyfish_fallback(
    repository: Any,
    lottery: str,
    status: str,
    finished_at: str,
    *,
    source_period: str | None = None,
    error: str | None = None,
) -> None:
    if lottery not in TINYFISH_JOB_NAME_BY_LOTTERY:
        return
    if status not in {"success", "failed"}:
        raise ValueError("TINYFISH_STATUS_INVALID")
    job_name = TINYFISH_JOB_NAME_BY_LOTTERY[lottery]
    repository.start_job(job_name, lottery, finished_at)
    repository.finish_job(
        job_name,
        status,
        finished_at,
        error,
        started_at=finished_at,
        source_period=source_period,
    )


def list_tinyfish_fallback_statuses(repository: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    job_statuses = getattr(repository, "job_statuses", None)
    if isinstance(job_statuses, dict):
        for lottery, job_name in TINYFISH_JOB_NAME_BY_LOTTERY.items():
            row = job_statuses.get(job_name)
            if isinstance(row, dict):
                rows.append({**row, "lottery": lottery})
    else:
        client = getattr(repository, "client", None)
        if client is None:
            return []
        response = (
            client.table("system_job_status")
            .select("job_name,lottery,status,finished_at,error,source_period")
            .in_("job_name", list(TINYFISH_JOB_NAME_BY_LOTTERY.values()))
            .execute()
        )
        if isinstance(response.data, list):
            rows = [dict(row) for row in response.data if isinstance(row, dict)]

    by_lottery: dict[str, dict[str, Any]] = {}
    for row in rows:
        projected = _project_tinyfish_row(row)
        if projected is not None:
            by_lottery[projected["lottery"]] = projected
    return [
        by_lottery[lottery]
        for lottery in TINYFISH_JOB_NAME_BY_LOTTERY
        if lottery in by_lottery
    ]


def tinyfish_status_payload(repository: Any, settings: Any) -> dict[str, Any]:
    return {
        "configured": bool(str(getattr(settings, "tinyfish_api_key", "") or "").strip()),
        "fetchEnabled": bool(getattr(settings, "tinyfish_fetch_fallback_enabled", True)),
        "browserEnabled": bool(getattr(settings, "tinyfish_browser_fallback_enabled", False)),
        "browserMaxDurationSeconds": int(
            getattr(settings, "tinyfish_browser_max_duration_seconds", 60) or 60
        ),
        "lastFallbacks": list_tinyfish_fallback_statuses(repository),
    }


def create_tinyfish_telemetry(repository: Any) -> Callable[[str, str, str | None, str | None], None]:
    def telemetry(
        lottery: str,
        status: str,
        source_period: str | None,
        error: str | None,
    ) -> None:
        try:
            record_tinyfish_fallback(
                repository,
                lottery,
                status,
                datetime.now(UTC).isoformat(),
                source_period=source_period,
                error=error,
            )
        except Exception as telemetry_error:
            print(json.dumps({
                "event": "tinyfish_telemetry_failed",
                "lottery": lottery,
                "error": type(telemetry_error).__name__,
            }, ensure_ascii=False, separators=(",", ":")))

    return telemetry
