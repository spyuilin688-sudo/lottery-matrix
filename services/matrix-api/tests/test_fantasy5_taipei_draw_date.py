from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.fantasy5_crawler import run_fantasy5_crawler
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.scraping.sources import LatestDrawSource


TAIPEI = ZoneInfo("Asia/Taipei")


def _california_payload(draw_number: int, draw_date: str, numbers: tuple[int, ...]) -> dict:
    return {
        "PreviousDraws": [{
            "DrawNumber": draw_number,
            "DrawDate": draw_date,
            "WinningNumbers": {
                str(index): {"Number": number}
                for index, number in enumerate(numbers)
            },
        }],
    }


def test_california_fantasy5_date_is_normalized_to_taipei_draw_date() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "www.calottery.com"
        return httpx.Response(
            200,
            json=_california_payload(
                11989,
                "2026-09-03T07:00:00",
                (4, 7, 10, 27, 38),
            ),
            request=request,
        )

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = source.fetch_history("天天樂", 1)

    assert history[0]["period"] == "11989"
    assert history[0]["drawDate"] == "2026-09-04"


def test_sc888_fantasy5_date_is_already_taipei_draw_date() -> None:
    sc888_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 11989 期</td><td>2026-09-04</td><td>38 04 27 07 10</td><td>04 07 10 27 38</td></tr>
    </table>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "www.calottery.com":
            return httpx.Response(403, request=request)
        assert str(request.url) == "https://sc888.net/index.php?s=/LotteryFan/index"
        return httpx.Response(
            200,
            text=sc888_html,
            headers={"content-type": "text/html; charset=utf-8"},
            request=request,
        )

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = source.fetch_history("天天樂", 1)

    assert history[0]["period"] == "11989"
    assert history[0]["drawDate"] == "2026-09-04"


class _TaipeiDatedFantasy5Source:
    def fetch(self, lottery: str) -> dict:
        assert lottery == "天天樂"
        return {
            "period": "11989",
            "drawDate": "2026-09-04",
            "numbers": ["04", "07", "10", "27", "38"],
            "sortedNumbers": ["04", "07", "10", "27", "38"],
            "drawOrderNumbers": None,
        }

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        return [self.fetch(lottery)]


def test_fantasy5_crawler_validates_against_taipei_run_date() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "天天樂",
        "period": "11988",
        "drawDate": "2026-09-03",
        "numbers": ["03", "06", "23", "29", "35"],
        "sortedNumbers": ["03", "06", "23", "29", "35"],
        "drawOrderNumbers": None,
    })

    result = run_fantasy5_crawler(
        repository,
        _TaipeiDatedFantasy5Source(),
        datetime(2026, 9, 4, 9, 33, tzinfo=TAIPEI),
    )

    assert result == {
        "lottery": "天天樂",
        "drawPeriod": "11989",
        "status": "acquired",
    }
    assert repository.list_draws("天天樂", 1)[0]["drawDate"] == "2026-09-04"
