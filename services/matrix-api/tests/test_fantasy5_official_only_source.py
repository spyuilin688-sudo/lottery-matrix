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


class NoNetworkSource:
    def fetch(self, lottery: str) -> dict:
        raise AssertionError("pre-draw recovery must not fetch when previous draw is current")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        raise AssertionError("pre-draw recovery must not fetch history when previous draw is current")


def test_predraw_recovery_skips_network_when_previous_draw_is_already_current() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "今彩539",
        "period": "115000208",
        "drawDate": "2026-08-27",
        "numbers": ["01", "07", "12", "28", "39"],
        "sortedNumbers": ["01", "07", "12", "28", "39"],
        "drawOrderNumbers": ["28", "01", "39", "12", "07"],
    })

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 18, 33, tzinfo=TAIPEI),
        repository,
        NoNetworkSource(),
        {},
    )

    assert result == {
        "lottery": "今彩539",
        "drawPeriod": "115000208",
        "status": "already-acquired",
    }


class Fantasy5PredrawRepairSource:
    def __init__(self) -> None:
        self.events: list[str] = []

    def fetch(self, lottery: str) -> dict:
        self.events.append("latest")
        return {
            "period": "11988",
            "drawDate": "2026-09-02",
            "numbers": ["02", "09", "16", "27", "35"],
            "sortedNumbers": ["02", "09", "16", "27", "35"],
            "drawOrderNumbers": None,
        }

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.events.append("history-all" if limit is None else f"history-{limit}")
        return []


def _test_builders() -> dict:
    return {
        kind: (lambda context, kind=kind: {"kind": kind})
        for kind in ("explore", "tianyan", "tiangong", "status")
    }


def test_fantasy5_predraw_recovery_targets_previous_draw_not_upcoming_draw() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "天天樂",
        "period": "11987",
        "drawDate": "2026-09-01",
        "numbers": ["01", "07", "08", "18", "39"],
        "sortedNumbers": ["01", "07", "08", "18", "39"],
        "drawOrderNumbers": None,
    })
    source = Fantasy5PredrawRepairSource()

    result = run_scheduled_worker(
        "天天樂",
        datetime(2026, 9, 4, 7, 33, tzinfo=TAIPEI),
        repository,
        source,
        _test_builders(),
    )

    assert result["status"] == "complete"
    assert repository.list_draws("天天樂", 1)[0]["period"] == "11988"
    assert repository.list_draws("天天樂", 1)[0]["drawDate"] == "2026-09-02"
    assert source.events == ["latest"]
