from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo

import app.api_server as api_server
import app.schedule as schedule


TAIPEI = ZoneInfo("Asia/Taipei")


class LatestDrawRepository:
    client = None

    def list_draws(self, lottery: str, limit: int | None):
        assert lottery == "今彩539"
        assert limit == 1
        return [{
            "period": "115000214",
            "drawDate": "2026-09-03",
            "numbers": ["18", "19", "22", "23", "34"],
            "sortedNumbers": ["18", "19", "22", "23", "34"],
            "drawOrderNumbers": ["19", "34", "22", "18", "23"],
        }]


def test_next_lottery_draw_time_is_three_minutes_before_first_crawl() -> None:
    next_draw_time = getattr(schedule, "next_lottery_draw_time", None)

    assert callable(next_draw_time)
    assert next_draw_time(
        "今彩539",
        datetime(2026, 9, 5, 20, 0, tzinfo=TAIPEI),
    ).isoformat() == "2026-09-05T20:30:00+08:00"
    assert next_draw_time(
        "大樂透",
        datetime(2026, 9, 4, 20, 0, tzinfo=TAIPEI),
    ).isoformat() == "2026-09-04T20:50:00+08:00"
    assert next_draw_time(
        "六合彩",
        datetime(2026, 9, 4, 21, 0, tzinfo=TAIPEI),
    ).isoformat() == "2026-09-04T21:30:00+08:00"
    assert next_draw_time(
        "天天樂",
        datetime(2026, 9, 4, 9, 0, tzinfo=TAIPEI),
    ).isoformat() == "2026-09-04T09:30:00+08:00"


def test_latest_api_returns_draw_time_instead_of_first_crawl_time(monkeypatch) -> None:
    first_crawl_at = datetime(2026, 9, 5, 20, 33, tzinfo=TAIPEI)
    actual_draw_at = datetime(2026, 9, 5, 20, 30, tzinfo=TAIPEI)
    monkeypatch.setattr(
        api_server,
        "next_lottery_call_time",
        lambda lottery: first_crawl_at,
    )
    monkeypatch.setattr(
        api_server,
        "next_lottery_draw_time",
        lambda lottery: actual_draw_at,
        raising=False,
    )

    status, payload = api_server.handle_api_request(
        "GET",
        f"/api/matrix/latest/{quote('今彩539')}",
        None,
        LatestDrawRepository(),
    )

    assert status == 200
    assert payload["item"]["nextDrawAt"] == "2026-09-05T20:30:00+08:00"
