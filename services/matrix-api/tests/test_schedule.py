from datetime import datetime, timezone

from app.schedule import call_due, lottery_call_time, retry_offsets


TAIPEI = timezone.utc


def test_retry_offsets_follow_formal_call_rule() -> None:
    assert retry_offsets() == [
        0, 5, 10, 15, 20, 25, 30, 35, 40, 45,
        75, 105, 135, 165,
        225, 285, 345,
        525, 705,
        1065,
    ]


def test_taipei_lottery_call_times() -> None:
    assert lottery_call_time("今彩539", datetime(2026, 8, 28, tzinfo=TAIPEI)).strftime("%H:%M") == "20:33"
    assert lottery_call_time("大樂透", datetime(2026, 8, 28, tzinfo=TAIPEI)).strftime("%H:%M") == "20:53"
    assert lottery_call_time("六合彩", datetime(2026, 8, 28, tzinfo=TAIPEI)).strftime("%H:%M") == "21:33"


def test_fantasy5_uses_summer_and_winter_call_times() -> None:
    assert lottery_call_time("天天樂", datetime(2026, 3, 13, tzinfo=TAIPEI)).strftime("%H:%M") == "09:33"
    assert lottery_call_time("天天樂", datetime(2026, 11, 5, tzinfo=TAIPEI)).strftime("%H:%M") == "09:33"
    assert lottery_call_time("天天樂", datetime(2026, 11, 6, tzinfo=TAIPEI)).strftime("%H:%M") == "10:33"
    assert lottery_call_time("天天樂", datetime(2027, 3, 12, tzinfo=TAIPEI)).strftime("%H:%M") == "10:33"


def test_pre_draw_calls_are_two_hours_one_hour_and_half_hour_before_call_time() -> None:
    base = lottery_call_time("今彩539", datetime(2026, 8, 28, tzinfo=TAIPEI))
    assert call_due("今彩539", base.replace(hour=18, minute=33)) is True
    assert call_due("今彩539", base.replace(hour=19, minute=33)) is True
    assert call_due("今彩539", base.replace(hour=20, minute=3)) is True


def test_retry_calls_begin_at_call_time_and_follow_offsets() -> None:
    base = lottery_call_time("今彩539", datetime(2026, 8, 28, tzinfo=TAIPEI))
    assert call_due("今彩539", base) is True
    assert call_due("今彩539", base.replace(hour=20, minute=38)) is True
    assert call_due("今彩539", base.replace(hour=20, minute=43)) is True
    assert call_due("今彩539", base.replace(hour=20, minute=34)) is False


def test_no_calls_after_final_six_hour_retry() -> None:
    base = lottery_call_time("今彩539", datetime(2026, 8, 28, tzinfo=TAIPEI))
    final_retry = base.replace(day=29, hour=14, minute=18)
    assert call_due("今彩539", final_retry) is True
    assert call_due("今彩539", final_retry.replace(minute=23)) is False
