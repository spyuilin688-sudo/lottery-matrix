from __future__ import annotations

from typing import Any


JOB_NAMES = {
    "今彩539": "matrix-539-refresh-v2",
    "天天樂": "matrix-fantasy5-refresh-v2",
    "六合彩": "matrix-marksix-refresh-v2",
    "大樂透": "matrix-lotto649-refresh-v2",
}


def job_name_for_lottery(lottery: str) -> str:
    try:
        return JOB_NAMES[lottery]
    except KeyError as error:
        raise ValueError("UNKNOWN_LOTTERY") from error


def check_repository_health(repository: Any) -> None:
    health_check = getattr(repository, "health_check", None)
    if callable(health_check):
        health_check()
        return

    client = getattr(repository, "client", None)
    if client is None:
        return

    client.table("lottery_draws").select("id").range(0, 0).execute()


def list_job_statuses(repository: Any) -> list[dict[str, Any]]:
    list_statuses = getattr(repository, "list_job_statuses", None)
    if callable(list_statuses):
        return [dict(item) for item in list_statuses()]

    client = getattr(repository, "client", None)
    if client is None:
        return []

    response = (
        client.table("system_job_status")
        .select("job_name,lottery,status,started_at,finished_at,error,updated_at")
        .order("updated_at", desc=True)
        .execute()
    )
    return [
        {
            "jobName": row.get("job_name"),
            "lottery": row.get("lottery"),
            "status": row.get("status"),
            "startedAt": row.get("started_at"),
            "finishedAt": row.get("finished_at"),
            "error": row.get("error"),
            "updatedAt": row.get("updated_at"),
        }
        for row in response.data
    ]


def start_job(repository: Any, job_name: str, lottery: str, started_at: str) -> None:
    start = getattr(repository, "start_job", None)
    if callable(start):
        start(job_name, lottery, started_at)
        return

    client = getattr(repository, "client", None)
    if client is None:
        return

    client.table("system_job_status").upsert(
        {
            "job_name": job_name,
            "lottery": lottery,
            "status": "running",
            "started_at": started_at,
            "finished_at": None,
            "error": None,
            "updated_at": started_at,
        },
        on_conflict="job_name",
    ).execute()


def finish_job(
    repository: Any,
    job_name: str,
    status: str,
    finished_at: str,
    error: str | None = None,
) -> None:
    finish = getattr(repository, "finish_job", None)
    if callable(finish):
        finish(job_name, status, finished_at, error)
        return

    client = getattr(repository, "client", None)
    if client is None:
        return

    client.table("system_job_status").update(
        {
            "status": status,
            "finished_at": finished_at,
            "error": error,
            "updated_at": finished_at,
        }
    ).eq("job_name", job_name).execute()
