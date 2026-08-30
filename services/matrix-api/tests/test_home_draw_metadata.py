from __future__ import annotations

from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo

import app.api_server as api_server
from app.api_server import handle_api_request
from app.repositories.analysis_repository import InMemoryAnalysisRepository


TAIPEI = ZoneInfo("Asia/Taipei")


def test_latest_draw_includes_next_draw_at_for_the_home_countdown(monkeypatch) -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "今彩539",
        "period": "003117",
        "drawDate": "2026-08-28",
        "numbers": ["01", "07", "11", "20", "39"],
    })
    expected_next_draw = datetime(2026, 8, 31, 20, 33, tzinfo=TAIPEI)
    monkeypatch.setattr(
        api_server,
        "next_lottery_call_time",
        lambda lottery: expected_next_draw,
        raising=False,
    )

    status, payload = handle_api_request(
        "GET",
        f"/api/matrix/latest/{quote('今彩539')}",
        None,
        repository,
    )

    assert status == 200
    assert payload["item"]["nextDrawAt"] == "2026-08-31T20:33:00+08:00"
