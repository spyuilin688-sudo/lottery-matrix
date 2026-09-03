from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.scraping.sources import LatestDrawSource
from app.worker import run_scheduled_worker


TAIPEI = ZoneInfo("Asia/Taipei")


def test_fantasy5_does_not_fall_back_to_third_party_when_official_api_fails() -> None:
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host != "www.calottery.com":
            raise AssertionError("Fantasy5 must not call a third-party fallback")
        return httpx.Response(503, request=request)

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    with pytest.raises(httpx.HTTPStatusError):
        source.fetch_history("天天樂", 1)

    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/1",
    ]


class UnavailableOfficialFantasy5Source:
    def fetch(self, lottery: str) -> dict:
        request = httpx.Request(
            "GET",
            "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/1",
        )
        raise httpx.ConnectError("official Fantasy5 source unavailable", request=request)

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        return []


def test_fantasy5_transient_official_outage_is_waiting_source_not_failed() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "天天樂",
        "period": "11987",
        "drawDate": "2026-09-01",
        "numbers": ["01", "07", "08", "18", "39"],
        "sortedNumbers": ["01", "07", "08", "18", "39"],
        "drawOrderNumbers": None,
    })

    result = run_scheduled_worker(
        "天天樂",
        datetime(2026, 9, 3, 9, 33, tzinfo=TAIPEI),
        repository,
        UnavailableOfficialFantasy5Source(),
        {},
    )

    assert result == {
        "lottery": "天天樂",
        "drawPeriod": "11987",
        "status": "not-acquired",
    }
    fantasy_job = next(
        item for item in repository.list_job_statuses() if item["lottery"] == "天天樂"
    )
    assert fantasy_job["job"]["status"] == "waiting_source"
    assert fantasy_job["job"]["error"] is None
