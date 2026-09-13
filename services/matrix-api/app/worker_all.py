from collections.abc import Callable
import ssl
from typing import Any

import httpx

from app.repositories.analysis_repository import create_supabase_repository
from app.scraping.sources import LatestDrawSource
from app.settings import load_settings
from app.services.marksix_calendar import sync_marksix_calendar
from app.worker import create_notification_emitter, run_scheduled_worker


LOTTERIES = ("今彩539", "六合彩", "大樂透")


def create_railway_ssl_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    if hasattr(ssl, "VERIFY_X509_STRICT"):
        context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return context


def run_all_workers(run_one: Callable[[str], dict[str, Any]]) -> dict[str, Any]:
    completed: list[str] = []
    failed: dict[str, str] = {}
    for lottery in LOTTERIES:
        try:
            run_one(lottery)
            completed.append(lottery)
        except Exception as error:
            failed[lottery] = str(error)
    return {"completed": completed, "failed": failed}


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
        source = LatestDrawSource(client)
        notification_emitter = create_notification_emitter(settings, client)
        if notification_emitter is None:
            run_one = lambda lottery: run_scheduled_worker(
                lottery,
                None,
                repository,
                source,
            )
        else:
            run_one = lambda lottery: run_scheduled_worker(
                lottery,
                None,
                repository,
                source,
                notification_emitter=notification_emitter,
            )
        result = run_all_workers(run_one)
    for lottery in result["completed"]:
        print(f"{lottery} complete")
    for lottery, error in result["failed"].items():
        print(f"{lottery} failed: {error}")
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
