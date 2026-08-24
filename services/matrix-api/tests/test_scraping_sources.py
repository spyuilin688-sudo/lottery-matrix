from datetime import datetime

import httpx
import pytest

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


def test_latest_draw_source_rejects_unknown_lottery() -> None:
    source = LatestDrawSource(httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(500))))

    with pytest.raises(ValueError, match="UNKNOWN_LOTTERY"):
        source.fetch("未知彩種")
