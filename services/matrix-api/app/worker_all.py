from collections.abc import Callable
import ssl
from typing import Any

import httpx

from app.repositories.analysis_repository import create_supabase_repository
from app.scraping.sources import LatestDrawSource
from app.services.card_publication import create_card_publisher
from app.settings import load_settings
from app.worker import run_scheduled_worker


LOTTERIES = ("今彩539", "天天樂", "六合彩", "大樂透")


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
    card_publisher = create_card_publisher(repository)
    with httpx.Client(verify=create_railway_ssl_context()) as client:
        source = LatestDrawSource(client)
        result = run_all_workers(
            lambda lottery: run_scheduled_worker(
                lottery,
                None,
                repository,
                source,
                card_publisher=card_publisher,
            ),
        )
    for lottery in result["completed"]:
        print(f"{lottery} complete")
    for lottery, error in result["failed"].items():
        print(f"{lottery} failed: {error}")
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
