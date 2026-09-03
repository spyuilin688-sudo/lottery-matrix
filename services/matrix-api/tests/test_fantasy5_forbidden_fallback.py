from datetime import datetime

import httpx

from app.scraping.sources import LatestDrawSource


def test_fantasy5_403_uses_sc888_with_california_date_and_sorted_numbers_only() -> None:
    requested_urls: list[str] = []
    sc888_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 11988 期</td><td>2026-09-03</td><td>35 03 29 06 23</td><td>03 06 23 29 35</td></tr>
    </table>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host == "www.calottery.com":
            return httpx.Response(403, request=request)
        assert str(request.url) == "https://sc888.net/index.php?s=/LotteryFan/index"
        return httpx.Response(
            200,
            text=sc888_html,
            headers={"content-type": "text/html; charset=utf-8"},
            request=request,
        )

    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: datetime(2026, 9, 4),
    )

    history = source.fetch_history("天天樂", 1)

    assert history == [{
        "period": "11988",
        "drawDate": "2026-09-02",
        "numbers": ["03", "06", "23", "29", "35"],
        "sortedNumbers": ["03", "06", "23", "29", "35"],
        "drawOrderNumbers": None,
    }]
    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/1",
        "https://sc888.net/index.php?s=/LotteryFan/index",
    ]


def test_fantasy5_non_403_http_failure_does_not_use_third_party_fallback() -> None:
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        return httpx.Response(503, request=request)

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    try:
        source.fetch_history("天天樂", 1)
    except httpx.HTTPStatusError:
        pass
    else:
        raise AssertionError("503 must remain a retryable official-source failure")

    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/1",
    ]
