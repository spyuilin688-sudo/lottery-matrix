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


def test_marksix_limited_history_uses_latest_real_drop_order() -> None:
    requested_urls: list[str] = []
    html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球</th><th>大小</th></tr>
      <tr><td>第 026095 期</td><td>2026-08-29</td><td>30 04 11 26 08 07</td><td>04 07 08 11 26 30 42</td></tr>
    </table>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        return httpx.Response(200, text=html)

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = [source.fetch("六合彩")]

    assert history[0]["period"] == "026095"
    assert history[0]["drawOrderNumbers"] == ["30", "04", "11", "26", "08", "07", "42"]
    assert requested_urls == ["https://sc888.net/index.php?s=/LotterySix/index"]


def test_marksix_full_history_pairs_normal_and_original_order_pages() -> None:
    requested_urls: list[str] = []
    normal_html = """
    <table>
      <tr><td>1976</td><td>12/31</td><td>2</td><td>08</td><td>09</td><td>10</td><td>11</td><td>12</td><td>13</td><td>14</td></tr>
    </table>
    """
    order_html = """
    <table>
      <tr><td>1976</td><td>2</td><td>13</td><td>08</td><td>11</td><td>09</td><td>12</td><td>10</td><td>14</td></tr>
    </table>
    """
    recent_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球</th><th>大小</th></tr>
      <tr><td>第 076002 期</td><td>1976-12-31</td><td>13 08 11 09 12 10</td><td>08 09 10 11 12 13 14</td></tr>
    </table>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        requested_urls.append(url)
        if "LotterySix" in url:
            return httpx.Response(200, text=recent_html)
        if "/F1976.htm" in url:
            return httpx.Response(200, text=order_html)
        return httpx.Response(200, text=normal_html)

    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: datetime(1976, 12, 31),
    )

    fetch_algorithm_history = getattr(source, "fetch_algorithm_history", None)

    assert callable(fetch_algorithm_history)
    history = fetch_algorithm_history("六合彩")

    assert history == [{
        "period": "076002",
        "drawDate": "1976-12-31",
        "numbers": ["08", "09", "10", "11", "12", "13", "14"],
        "sortedNumbers": ["08", "09", "10", "11", "12", "13", "14"],
        "drawOrderNumbers": ["13", "08", "11", "09", "12", "10", "14"],
    }]
    assert requested_urls == [
        "https://www.nfd.com.tw/house/year/1976.htm",
        "https://www.nfd.com.tw/house/year/F1976.htm",
        "https://sc888.net/index.php?s=/LotterySix/index",
    ]


def test_daily539_full_history_uses_authoritative_taiwan_order_rows() -> None:
    requested_urls: list[str] = []
    taiwan_payload = {
        "content": {
            "daily539Res": [{
                "period": "100000001",
                "lotteryDate": "2011-01-01",
                "drawNumberSize": [1, 2, 3, 4, 5],
                "drawNumberAppear": [5, 4, 3, 2, 1],
            }],
        },
    }
    legacy_payload = {
        "content": {
            "daily539Res": [{
                "period": "99000261",
                "lotteryDate": "2010-12-31",
                "drawNumberSize": [2, 6, 17, 28, 39],
                "drawNumberAppear": [39, 28, 17, 6, 2],
            }],
        },
    }
    empty_payload = {"content": {"daily539Res": []}}
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        requested_urls.append(url)
        if request.url.host == "api.taiwanlottery.com":
            payload = {
                "2011-01": taiwan_payload,
                "2010-12": legacy_payload,
            }.get(request.url.params.get("month"), empty_payload)
            return httpx.Response(200, json=payload)
        raise AssertionError("unexpected non-official Daily539 source")

    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: datetime(2011, 1, 2),
    )

    fetch_algorithm_history = getattr(source, "fetch_algorithm_history", None)

    assert callable(fetch_algorithm_history)
    history = fetch_algorithm_history("今彩539")

    assert [draw["period"] for draw in history] == [
        "100000001", "099000261",
    ]
    assert history[1]["drawOrderNumbers"] == ["39", "28", "17", "06", "02"]
    assert requested_urls == [
        "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result?period&month=2011-01&pageSize=31",
        "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result?period&month=2010-12&pageSize=31",
        "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result?period&month=2010-11&pageSize=31",
    ]


def test_lotto649_algorithm_history_repairs_pre_2007_api_placeholders_from_biga() -> None:
    requested_urls: list[str] = []
    placeholder = {
        "content": {
            "lotto649Res": [{
                "period": "095000104",
                "lotteryDate": "2006-12-28",
                "drawNumberSize": [1, 2, 3, 4, 7, 8, 3],
                "drawNumberAppear": [7, 4, 8, 3, 1, 2, 3],
            }],
        },
    }
    legacy_rows: list[str] = []
    for roc_year in range(93, 96):
        for sequence in range(1, 105):
            period = f"{roc_year:03d}{sequence:03d}"
            if period == "093001":
                drop, special, sorted_values = (
                    ["33", "12", "06", "09", "39", "13"],
                    "21",
                    ["06", "09", "12", "13", "33", "39"],
                )
            elif period == "095104":
                drop, special, sorted_values = (
                    ["07", "04", "08", "31", "01", "25"],
                    "33",
                    ["01", "04", "07", "08", "25", "31"],
                )
            else:
                drop, special, sorted_values = (
                    ["06", "05", "04", "03", "02", "01"],
                    "49",
                    ["01", "02", "03", "04", "05", "06"],
                )
            cells = [
                f"{roc_year + 1911}/01/01", "星期一", period, "200401",
                "1", "癸未", *drop, special, *sorted_values,
            ]
            legacy_rows.append(
                "<tr>" + "".join(f"<td>{cell}</td>" for cell in cells) + "</tr>"
            )

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host == "api.taiwanlottery.com":
            if request.url.params.get("month") == "2006-12":
                return httpx.Response(200, json=placeholder)
            return httpx.Response(200, json={"content": {"lotto649Res": []}})
        page = int(request.url.params.get("page", "1"))
        start = (page - 1) * 100
        return httpx.Response(
            200,
            text="<table>" + "".join(legacy_rows[start:start + 100]) + "</table>",
        )

    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: datetime(2007, 1, 2),
    )

    history = source.fetch_algorithm_history("大樂透")

    assert len(history) == 312
    assert history[0]["period"] == "095000104"
    assert history[-1]["period"] == "093000001"
    assert history[0]["drawOrderNumbers"] == ["07", "04", "08", "31", "01", "25", "33"]
    assert history[0]["numbers"] == ["01", "04", "07", "08", "25", "31", "33"]
    assert requested_urls[-4:] == [
        "https://rk.biga.com.tw/ARCHIVE/DRAWDATA/PAGINATION/ZP/biglottoresultlist?page=1",
        "https://rk.biga.com.tw/ARCHIVE/DRAWDATA/PAGINATION/ZP/biglottoresultlist?page=2",
        "https://rk.biga.com.tw/ARCHIVE/DRAWDATA/PAGINATION/ZP/biglottoresultlist?page=3",
        "https://rk.biga.com.tw/ARCHIVE/DRAWDATA/PAGINATION/ZP/biglottoresultlist?page=4",
    ]
