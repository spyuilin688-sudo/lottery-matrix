from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.worker import run_scheduled_worker


TAIPEI = ZoneInfo("Asia/Taipei")


class NoNetworkSource:
    def fetch(self, lottery: str) -> dict:
        raise AssertionError(f"{lottery} pre-draw recovery must not fetch when the latest draw is already stored")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        raise AssertionError(f"{lottery} pre-draw recovery must not fetch history when the latest draw is already stored")


@pytest.mark.parametrize(
    ("lottery", "now", "period", "draw_date", "numbers"),
    [
        (
            "今彩539",
            datetime(2026, 8, 28, 18, 33, tzinfo=TAIPEI),
            "115000208",
            "2026-08-27",
            ["01", "07", "12", "28", "39"],
        ),
        (
            "天天樂",
            datetime(2026, 9, 4, 7, 33, tzinfo=TAIPEI),
            "11988",
            "2026-09-03",
            ["02", "09", "16", "27", "35"],
        ),
        (
            "六合彩",
            datetime(2026, 8, 29, 19, 33, tzinfo=TAIPEI),
            "026094",
            "2026-08-27",
            ["04", "07", "08", "11", "26", "30", "42"],
        ),
        (
            "大樂透",
            datetime(2026, 8, 28, 18, 53, tzinfo=TAIPEI),
            "115000079",
            "2026-08-25",
            ["03", "08", "14", "21", "32", "45", "49"],
        ),
    ],
)
def test_predraw_recovery_skips_all_network_for_every_lottery_when_latest_is_current(
    lottery: str,
    now: datetime,
    period: str,
    draw_date: str,
    numbers: list[str],
) -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": lottery,
        "period": period,
        "drawDate": draw_date,
        "numbers": numbers,
        "sortedNumbers": numbers,
        "drawOrderNumbers": None,
    })

    result = run_scheduled_worker(
        lottery,
        now,
        repository,
        NoNetworkSource(),
        {},
    )

    assert result == {
        "lottery": lottery,
        "drawPeriod": period,
        "status": "already-acquired",
    }
