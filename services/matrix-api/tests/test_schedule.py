from datetime import datetime, timezone

from app.schedule import fantasy5_analysis_due


def test_fantasy5_runs_twenty_minutes_after_summer_draw() -> None:
    assert fantasy5_analysis_due(datetime(2026, 8, 25, 1, 50, tzinfo=timezone.utc)) is True
    assert fantasy5_analysis_due(datetime(2026, 8, 25, 2, 50, tzinfo=timezone.utc)) is False


def test_fantasy5_runs_twenty_minutes_after_winter_draw() -> None:
    assert fantasy5_analysis_due(datetime(2026, 12, 15, 2, 50, tzinfo=timezone.utc)) is True
    assert fantasy5_analysis_due(datetime(2026, 12, 15, 1, 50, tzinfo=timezone.utc)) is False


def test_fantasy5_schedule_rejects_wrong_minute() -> None:
    assert fantasy5_analysis_due(datetime(2026, 8, 25, 1, 49, tzinfo=timezone.utc)) is False
