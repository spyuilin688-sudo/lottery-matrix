from datetime import datetime

import httpx
import pytest

from app.scraping import sources as source_module
from app.scraping.sources import (
    LatestDrawSource,
    parse_nfd_marksix_html,
    parse_sc888_fantasy5_html,
    parse_taiwan_lottery_payload,
)


def test_taiwan_payload_preserves_special_number_and_draw_order() -> None:
    payload = {
        "content": {
            "lotto649Res": [
                {
                    "period": "115000077",
                    "lotteryDate": "2026-08-21",
                    "drawNumberSize": [3, 8, 14, 21, 32, 45, 49],
                    "drawNumberAppear": [21, 3, 45, 14, 8, 32],
                }
            ]
        }
    }

    draw = parse_taiwan_lottery_payload(payload, "lotto649Res", 7)

    assert draw == {
        "period": "115000077",
        "drawDate": "2026-08-21",
        "numbers": ["03", "08", "14", "21", "32", "45", "49"],
        "sortedNumbers": ["03", "08", "14", "21", "32", "45", "49"],
        "drawOrderNumbers": ["21", "03", "45", "14", "08", "32", "49"],
    }


def test_sc888_parser_returns_newest_complete_fantasy5_row() -> None:
    html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 080123 期</td><td>2026-08-23</td><td>25 03 17 09 38</td><td>03 09 17 25 38</td></tr>
      <tr><td>第 080124 期</td><td>2026-08-24</td><td>11 39 06 20 28</td><td>06 11 20 28 39</td></tr>
    </table>
    """

    assert parse_sc888_fantasy5_html(html) == {
        "period": "080124",
        "drawDate": "2026-08-24",
        "numbers": ["06", "11", "20", "28", "39"],
        "sortedNumbers": ["06", "11", "20", "28", "39"],
        "drawOrderNumbers": ["11", "39", "06", "20", "28"],
    }


def test_nfd_parser_keeps_first_six_sorted_and_special_number_last() -> None:
    html = """
    <table>
      <tr><td>2026</td><td>8/22</td><td>88</td><td>46</td><td>02</td><td>35</td><td>13</td><td>24</td><td>07</td><td>49</td></tr>
      <tr><td>2026</td><td>8/24</td><td>89</td><td>33</td><td>05</td><td>17</td><td>42</td><td>11</td><td>28</td><td>09</td></tr>
    </table>
    """

    assert parse_nfd_marksix_html(html) == {
        "period": "026089",
        "drawDate": "2026/08/24",
        "numbers": ["05", "11", "17", "28", "33", "42", "09"],
        "sortedNumbers": ["05", "11", "17", "28", "33", "42", "09"],
        "drawOrderNumbers": None,
    }


def test_nfd_marksix_draw_order_pairs_with_the_same_period() -> None:
    normal_html = """
    <table>
      <tr><td>2026</td><td>8/29</td><td>95</td><td>04</td><td>07</td><td>08</td><td>11</td><td>26</td><td>30</td><td>42</td></tr>
    </table>
    """
    draw_order_html = """
    <table>
      <tr><td>2026</td><td>8/29</td><td>95</td><td>30</td><td>04</td><td>11</td><td>26</td><td>08</td><td>07</td><td>42</td></tr>
    </table>
    """

    parser = getattr(source_module, "parse_nfd_marksix_draw_order_history", None)

    assert callable(parser)
    assert parser(draw_order_html) == {
        "026095": ["30", "04", "11", "26", "08", "07", "42"],
    }
    assert source_module.parse_nfd_marksix_history(normal_html, draw_order_html) == [{
        "period": "026095",
        "drawDate": "2026/08/29",
        "numbers": ["04", "07", "08", "11", "26", "30", "42"],
        "sortedNumbers": ["04", "07", "08", "11", "26", "30", "42"],
        "drawOrderNumbers": ["30", "04", "11", "26", "08", "07", "42"],
    }]


def test_nfd_marksix_draw_order_accepts_old_rows_without_dates() -> None:
    html = """
    <table>
      <tr><td>2000</td><td>1</td><td>24</td><td>39</td><td>21</td><td>27</td><td>35</td><td>06</td><td>44</td></tr>
    </table>
    """

    parser = getattr(source_module, "parse_nfd_marksix_draw_order_history", None)

    assert callable(parser)
    assert parser(html) == {
        "000001": ["24", "39", "21", "27", "35", "06", "44"],
    }


def test_nfd_marksix_pairs_old_normal_and_order_rows_without_dates() -> None:
    normal_html = """
    <table>
      <tr><td>2000</td><td>1</td><td>06</td><td>21</td><td>24</td><td>27</td><td>35</td><td>39</td><td>44</td></tr>
    </table>
    """
    order_html = """
    <table>
      <tr><td>2000</td><td>1</td><td>24</td><td>39</td><td>21</td><td>27</td><td>35</td><td>06</td><td>44</td></tr>
    </table>
    """

    assert source_module.parse_nfd_marksix_history(
        normal_html,
        order_html,
        allow_missing_dates=True,
    ) == [{
        "period": "000001",
        "drawDate": "",
        "numbers": ["06", "21", "24", "27", "35", "39", "44"],
        "sortedNumbers": ["06", "21", "24", "27", "35", "39", "44"],
        "drawOrderNumbers": ["24", "39", "21", "27", "35", "06", "44"],
    }]


def test_sc888_marksix_parser_separates_drop_and_size_order() -> None:
    html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球</th><th>大小</th></tr>
      <tr><td>第 026095 期</td><td>2026-08-29</td><td>30 04 11 26 08 07</td><td>04 07 08 11 26 30 42</td></tr>
    </table>
    """

    parser = getattr(source_module, "parse_sc888_marksix_history", None)

    assert callable(parser)
    assert parser(html) == [{
        "period": "026095",
        "drawDate": "2026-08-29",
        "numbers": ["04", "07", "08", "11", "26", "30", "42"],
        "sortedNumbers": ["04", "07", "08", "11", "26", "30", "42"],
        "drawOrderNumbers": ["30", "04", "11", "26", "08", "07", "42"],
    }]


def test_nfd_daily539_draw_order_materializes_roc_period() -> None:
    html = """
    <table>
      <tr><td>2010</td><td>10/29</td><td>216</td><td>07</td><td>38</td><td>11</td><td>02</td><td>17</td><td>1045</td></tr>
    </table>
    """

    parser = getattr(source_module, "parse_nfd_daily539_draw_order_history", None)

    assert callable(parser)
    assert parser(html) == [{
        "period": "099000216",
        "drawDate": "2010/10/29",
        "numbers": ["02", "07", "11", "17", "38"],
        "sortedNumbers": ["02", "07", "11", "17", "38"],
        "drawOrderNumbers": ["07", "38", "11", "02", "17"],
    }]


def test_latest_draw_source_uses_existing_taiwan_539_endpoint() -> None:
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        return httpx.Response(
            200,
            json={
                "content": {
                    "daily539Res": [
                        {
                            "period": "115000201",
                            "lotteryDate": "2026-08-24",
                            "drawNumberSize": [1, 7, 12, 28, 39],
                            "drawNumberAppear": [28, 1, 39, 12, 7],
                        }
                    ]
                }
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))
    source = LatestDrawSource(client, now=lambda: datetime(2026, 8, 24))

    draw = source.fetch("今彩539")

    assert draw["period"] == "115000201"
    assert requested_urls == [
        "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result?period&month=2026-08&pageSize=31"
    ]


def test_fantasy5_limited_history_uses_california_official_api() -> None:
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        return httpx.Response(
            200,
            json={
                "PreviousDraws": [
                    {
                        "DrawNumber": 11977,
                        "DrawDate": "2026-08-22T07:00:00",
                        "WinningNumbers": {
                            "4": {"Number": "38", "IsSpecial": False, "Name": None},
                            "2": {"Number": "17", "IsSpecial": False, "Name": None},
                            "0": {"Number": "3", "IsSpecial": False, "Name": None},
                            "3": {"Number": "25", "IsSpecial": False, "Name": None},
                            "1": {"Number": "9", "IsSpecial": False, "Name": None},
                        },
                    },
                    {
                        "DrawNumber": 11978,
                        "DrawDate": "2026-08-23T07:00:00",
                        "WinningNumbers": {
                            "0": {"Number": "8", "IsSpecial": False, "Name": None},
                            "1": {"Number": "10", "IsSpecial": False, "Name": None},
                            "2": {"Number": "22", "IsSpecial": False, "Name": None},
                            "3": {"Number": "23", "IsSpecial": False, "Name": None},
                            "4": {"Number": "36", "IsSpecial": False, "Name": None},
                        },
                    },
                ]
            },
        )

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = source.fetch_history("天天樂", 2)

    assert history == [
        {
            "period": "11978",
            "drawDate": "2026-08-23",
            "numbers": ["08", "10", "22", "23", "36"],
            "sortedNumbers": ["08", "10", "22", "23", "36"],
            "drawOrderNumbers": None,
        },
        {
            "period": "11977",
            "drawDate": "2026-08-22",
            "numbers": ["03", "09", "17", "25", "38"],
            "sortedNumbers": ["03", "09", "17", "25", "38"],
            "drawOrderNumbers": None,
        },
    ]
    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/2"
    ]


def test_fantasy5_full_history_pages_until_official_last_page() -> None:
    requested_urls: list[str] = []

    def official_draw(period: int) -> dict:
        return {
            "DrawNumber": period,
            "DrawDate": "2026-08-23T07:00:00",
            "WinningNumbers": {
                "0": {"Number": "8"},
                "1": {"Number": "10"},
                "2": {"Number": "22"},
                "3": {"Number": "23"},
                "4": {"Number": "36"},
            },
        }

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host != "www.calottery.com":
            raise AssertionError("sc888 fallback must not be used for complete official history")
        page = int(request.url.path.split("/")[-2])
        if page == 3:
            return httpx.Response(200, json={"PreviousDraws": []})
        first_period = 12000 if page == 1 else 11950
        return httpx.Response(
            200,
            json={"PreviousDraws": [official_draw(first_period - offset) for offset in range(50)]},
        )

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = source.fetch_history("天天樂", None)

    assert len(history) == 100
    assert history[0]["period"] == "12000"
    assert history[-1]["period"] == "11901"
    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/50",
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/2/50",
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/3/50",
    ]


def test_fantasy5_history_falls_back_when_official_unique_count_is_underfilled() -> None:
    requested_urls: list[str] = []
    sc888_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 11977 期</td><td>2026-08-22</td><td>03 09 17 25 38</td><td>03 09 17 25 38</td></tr>
      <tr><td>第 11978 期</td><td>2026-08-23</td><td>08 10 22 23 36</td><td>08 10 22 23 36</td></tr>
    </table>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host == "www.calottery.com":
            return httpx.Response(
                200,
                json={
                    "PreviousDraws": [
                        {
                            "DrawNumber": 11978,
                            "DrawDate": "2026-08-23T07:00:00",
                            "WinningNumbers": {
                                str(index): {"Number": number}
                                for index, number in enumerate(("8", "10", "22", "23", "36"))
                            },
                        }
                    ]
                },
            )
        return httpx.Response(200, text=sc888_html)

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = source.fetch_history("天天樂", 2)

    assert [draw["period"] for draw in history] == ["11978", "11977"]
    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/2",
        "https://sc888.net/index.php?s=/LotteryFan/index",
    ]


def test_fantasy5_history_rejects_null_and_malformed_official_metadata() -> None:
    requested_urls: list[str] = []
    sc888_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 11978 期</td><td>2026-08-23</td><td>08 10 22 23 36</td><td>08 10 22 23 36</td></tr>
    </table>
    """
    winning_numbers = {
        str(index): {"Number": number}
        for index, number in enumerate(("8", "10", "22", "23", "36"))
    }

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host == "www.calottery.com":
            return httpx.Response(
                200,
                json={
                    "PreviousDraws": [
                        {"DrawNumber": None, "DrawDate": None, "WinningNumbers": winning_numbers},
                        {
                            "DrawNumber": "not-a-period",
                            "DrawDate": "08/23/2026",
                            "WinningNumbers": winning_numbers,
                        },
                    ]
                },
            )
        return httpx.Response(200, text=sc888_html)

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = source.fetch_history("天天樂", 1)

    assert [draw["period"] for draw in history] == ["11978"]
    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/1",
        "https://sc888.net/index.php?s=/LotteryFan/index",
    ]


def test_fantasy5_history_falls_back_to_sc888_when_official_request_fails() -> None:
    requested_urls: list[str] = []
    sc888_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 11978 期</td><td>2026-08-24</td><td>11 39 06 20 28</td><td>06 11 20 28 39</td></tr>
    </table>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host == "www.calottery.com":
            return httpx.Response(503)
        return httpx.Response(200, text=sc888_html)

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = source.fetch_history("天天樂", 1)

    assert [draw["period"] for draw in history] == ["11978"]
    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/1",
        "https://sc888.net/index.php?s=/LotteryFan/index",
    ]


def test_fantasy5_latest_falls_back_when_official_response_is_malformed() -> None:
    requested_urls: list[str] = []
    sc888_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 11978 期</td><td>2026-08-24</td><td>11 39 06 20 28</td><td>06 11 20 28 39</td></tr>
    </table>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host == "www.calottery.com":
            return httpx.Response(200, json={"PreviousDraws": "unavailable"})
        return httpx.Response(200, text=sc888_html)

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    draw = source.fetch("天天樂")

    assert draw["period"] == "11978"
    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/1",
        "https://sc888.net/index.php?s=/LotteryFan/index",
    ]


def test_latest_draw_source_rejects_unknown_lottery() -> None:
    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(500))))

    with pytest.raises(ValueError, match="UNKNOWN_LOTTERY"):
        source.fetch("未知彩種")


def test_fantasy5_history_retries_sc888_download_when_index_is_forbidden() -> None:
    requested_urls: list[str] = []
    sc888_html = """
    <table>
      <tr><th>期數</th><th>日期</th><th>落球順序</th><th>大小順序</th></tr>
      <tr><td>第 11978 期</td><td>2026-08-24</td><td>11 39 06 20 28</td><td>06 11 20 28 39</td></tr>
    </table>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host == "www.calottery.com":
            return httpx.Response(503)
        if "LotteryFan/index" in str(request.url):
            return httpx.Response(403)
        return httpx.Response(200, text=sc888_html)

    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(handler)))

    history = source.fetch_history("天天樂", 1)

    assert [draw["period"] for draw in history] == ["11978"]
    assert requested_urls == [
        "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/1/1",
        "https://sc888.net/index.php?s=/LotteryFan/index",
        "https://sc888.net/index.php?s=/LotteryFan/getDownloadXls",
    ]
