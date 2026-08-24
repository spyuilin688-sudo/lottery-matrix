from datetime import datetime

import httpx

from app.scraping.sources import LatestDrawSource


def test_taiwan_full_history_walks_until_first_empty_month() -> None:
    requested_months: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        month = request.url.params.get("month", "")
        requested_months.append(month)
        rows = {
            "2026-01": [
                {"period": "115000003", "lotteryDate": "2026-01-03", "drawNumberSize": [1, 2, 3, 4, 5], "drawNumberAppear": [5, 4, 3, 2, 1]},
            ],
            "2025-12": [
                {"period": "114000002", "lotteryDate": "2025-12-31", "drawNumberSize": [6, 7, 8, 9, 10], "drawNumberAppear": [10, 9, 8, 7, 6]},
                {"period": "114000001", "lotteryDate": "2025-12-30", "drawNumberSize": [11, 12, 13, 14, 15], "drawNumberAppear": [15, 14, 13, 12, 11]},
            ],
            "2025-11": [],
        }.get(month, [])
        return httpx.Response(200, json={"content": {"daily539Res": rows}})

    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: datetime(2026, 1, 4),
    )

    history = source.fetch_history("今彩539", None)

    assert [draw["period"] for draw in history] == ["115000003", "114000002", "114000001"]
    assert requested_months == ["2026-01", "2025-12", "2025-11"]


def test_taiwan_limited_history_stops_when_limit_is_satisfied() -> None:
    requested_months: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        month = request.url.params.get("month", "")
        requested_months.append(month)
        rows = {
            "2026-01": [
                {"period": "115000003", "lotteryDate": "2026-01-03", "drawNumberSize": [1, 2, 3, 4, 5], "drawNumberAppear": [5, 4, 3, 2, 1]},
            ],
            "2025-12": [
                {"period": "114000002", "lotteryDate": "2025-12-31", "drawNumberSize": [6, 7, 8, 9, 10], "drawNumberAppear": [10, 9, 8, 7, 6]},
                {"period": "114000001", "lotteryDate": "2025-12-30", "drawNumberSize": [11, 12, 13, 14, 15], "drawNumberAppear": [15, 14, 13, 12, 11]},
            ],
        }.get(month, [])
        return httpx.Response(200, json={"content": {"daily539Res": rows}})

    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: datetime(2026, 1, 4),
    )

    history = source.fetch_history("今彩539", 3)

    assert [draw["period"] for draw in history] == ["115000003", "114000002", "114000001"]
    assert requested_months == ["2026-01", "2025-12"]


def test_sc888_full_history_uses_download_source() -> None:
    requested_urls: list[str] = []
    page_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 080124 期</td><td>2026-08-24</td><td>11 39 06 20 28</td><td>06 11 20 28 39</td></tr>
    </table>
    """
    download_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 080122 期</td><td>2026-08-22</td><td>02 03 04 05 06</td><td>02 03 04 05 06</td></tr>
      <tr><td>第 080123 期</td><td>2026-08-23</td><td>25 03 17 09 38</td><td>03 09 17 25 38</td></tr>
      <tr><td>第 080124 期</td><td>2026-08-24</td><td>11 39 06 20 28</td><td>06 11 20 28 39</td></tr>
    </table>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        requested_urls.append(url)
        body = download_html if "getDownloadXls" in url else page_html
        return httpx.Response(200, text=body, headers={"content-type": "application/vnd.ms-excel; charset=utf-8"})

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = source.fetch_history("天天樂", None)

    assert [draw["period"] for draw in history] == ["080124", "080123", "080122"]
    assert requested_urls[0] == (
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/50"
    )
    assert len(requested_urls) == 2
    assert "getDownloadXls" in requested_urls[1]


def test_sc888_limited_history_can_use_current_page() -> None:
    html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 080123 期</td><td>2026-08-23</td><td>25 03 17 09 38</td><td>03 09 17 25 38</td></tr>
      <tr><td>第 080124 期</td><td>2026-08-24</td><td>11 39 06 20 28</td><td>06 11 20 28 39</td></tr>
    </table>
    """
    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, text=html)))
    )

    history = source.fetch_history("天天樂", 2)

    assert [draw["period"] for draw in history] == ["080124", "080123"]


def test_marksix_full_history_walks_to_nfd_first_year() -> None:
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if "/1977.htm" in str(request.url):
            html = "<table><tr><td>1977</td><td>1/3</td><td>1</td><td>01</td><td>02</td><td>03</td><td>04</td><td>05</td><td>06</td><td>07</td></tr></table>"
        else:
            html = """
            <table>
              <tr><td>1976</td><td>12/31</td><td>2</td><td>08</td><td>09</td><td>10</td><td>11</td><td>12</td><td>13</td><td>14</td></tr>
              <tr><td>1976</td><td>12/29</td><td>1</td><td>15</td><td>16</td><td>17</td><td>18</td><td>19</td><td>20</td><td>21</td></tr>
            </table>
            """
        return httpx.Response(200, text=html)

    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: datetime(1977, 1, 4),
    )

    history = source.fetch_history("六合彩", None)

    assert [draw["period"] for draw in history] == ["077001", "076002", "076001"]
    assert requested_urls == [
        "https://www.nfd.com.tw/house/year/1977.htm",
        "https://www.nfd.com.tw/house/year/1976.htm",
    ]


def test_marksix_limited_history_stops_when_limit_is_satisfied() -> None:
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if "/2026.htm" in str(request.url):
            html = "<table><tr><td>2026</td><td>1/3</td><td>1</td><td>01</td><td>02</td><td>03</td><td>04</td><td>05</td><td>06</td><td>07</td></tr></table>"
        else:
            html = """
            <table>
              <tr><td>2025</td><td>12/31</td><td>155</td><td>08</td><td>09</td><td>10</td><td>11</td><td>12</td><td>13</td><td>14</td></tr>
              <tr><td>2025</td><td>12/29</td><td>154</td><td>15</td><td>16</td><td>17</td><td>18</td><td>19</td><td>20</td><td>21</td></tr>
            </table>
            """
        return httpx.Response(200, text=html)

    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: datetime(2026, 1, 4),
    )

    history = source.fetch_history("六合彩", 3)

    assert [draw["period"] for draw in history] == ["026001", "025155", "025154"]
    assert requested_urls == [
        "https://www.nfd.com.tw/house/year/2026.htm",
        "https://www.nfd.com.tw/house/year/2025.htm",
    ]
