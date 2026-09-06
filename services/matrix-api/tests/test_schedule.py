from datetime import datetime
from zoneinfo import ZoneInfo

from app.schedule import call_due, lottery_call_time, next_lottery_call_time, retry_offsets


TAIPEI = ZoneInfo("Asia/Taipei")


def test_retry_offsets_follow_formal_call_rule() -> None:
    assert retry_offsets() == [
        0, 5, 10, 15, 20, 25, 30, 35, 40, 45,
        75, 105, 135, 165,
        225, 285, 345,
    ]


def test_taipei_lottery_call_times() -> None:
    day = datetime(2026, 8, 28, tzinfo=TAIPEI)
    assert lottery_call_time("今彩539", day).strftime("%H:%M") == "20:33"
    assert lottery_call_time("大樂透", day).strftime("%H:%M") == "20:53"
    assert lottery_call_time("六合彩", day).strftime("%H:%M") == "21:33"


def test_fantasy5_uses_summer_and_winter_call_times() -> None:
    assert lottery_call_time("天天樂", datetime(2026, 3, 8, tzinfo=TAIPEI)).strftime("%H:%M") == "10:33"
    assert lottery_call_time("天天樂", datetime(2026, 3, 9, tzinfo=TAIPEI)).strftime("%H:%M") == "09:33"
    assert lottery_call_time("天天樂", datetime(2026, 11, 1, tzinfo=TAIPEI)).strftime("%H:%M") == "09:33"
    assert lottery_call_time("天天樂", datetime(2026, 11, 2, tzinfo=TAIPEI)).strftime("%H:%M") == "10:33"


def test_next_call_time_uses_the_existing_draw_schedule() -> None:
    assert next_lottery_call_time(
        "今彩539", datetime(2026, 8, 30, 12, 0, tzinfo=TAIPEI)
    ).isoformat() == "2026-08-31T20:33:00+08:00"
    assert next_lottery_call_time(
        "大樂透", datetime(2026, 8, 29, 12, 0, tzinfo=TAIPEI)
    ).isoformat() == "2026-09-01T20:53:00+08:00"
    assert next_lottery_call_time(
        "六合彩", datetime(2026, 8, 30, 12, 0, tzinfo=TAIPEI)
    ).isoformat() == "2026-08-30T21:33:00+08:00"
    assert next_lottery_call_time(
        "天天樂", datetime(2026, 8, 30, 12, 0, tzinfo=TAIPEI)
    ).isoformat() == "2026-08-31T09:33:00+08:00"


def test_pre_draw_calls_are_two_hours_one_hour_and_half_hour_before_call_time() -> None:
    base = lottery_call_time("今彩539", datetime(2026, 8, 28, tzinfo=TAIPEI))
    assert call_due("今彩539", base.replace(hour=18, minute=33)) is True
    assert call_due("今彩539", base.replace(hour=19, minute=33)) is True
    assert call_due("今彩539", base.replace(hour=20, minute=3)) is True


def test_539_retry_window_keeps_delayed_cron_runs_due() -> None:
    base = lottery_call_time("今彩539", datetime(2026, 8, 28, tzinfo=TAIPEI))
    assert call_due("今彩539", base) is True
    assert call_due("今彩539", base.replace(hour=20, minute=38)) is True
    assert call_due("今彩539", base.replace(hour=20, minute=43)) is True
    assert call_due("今彩539", base.replace(hour=20, minute=34)) is True
    assert call_due("今彩539", base.replace(hour=22, minute=49)) is True


def test_each_other_lottery_retry_window_keeps_delayed_cron_runs_due() -> None:
    assert call_due(
        "天天樂", datetime(2026, 8, 28, 12, 49, tzinfo=TAIPEI)
    ) is True
    assert call_due(
        "大樂透", datetime(2026, 8, 28, 22, 49, tzinfo=TAIPEI)
    ) is True
    assert call_due(
        "六合彩", datetime(2026, 8, 28, 23, 49, tzinfo=TAIPEI)
    ) is True


def test_each_other_lottery_retry_window_stops_after_its_own_deadline() -> None:
    assert call_due(
        "天天樂", datetime(2026, 8, 28, 15, 18, tzinfo=TAIPEI)
    ) is True
    assert call_due(
        "天天樂", datetime(2026, 8, 28, 15, 19, tzinfo=TAIPEI)
    ) is False
    assert call_due(
        "大樂透", datetime(2026, 8, 29, 2, 38, tzinfo=TAIPEI)
    ) is True
    assert call_due(
        "大樂透", datetime(2026, 8, 29, 2, 39, tzinfo=TAIPEI)
    ) is False
    assert call_due(
        "六合彩", datetime(2026, 8, 29, 3, 18, tzinfo=TAIPEI)
    ) is True
    assert call_due(
        "六合彩", datetime(2026, 8, 29, 3, 19, tzinfo=TAIPEI)
    ) is False


def test_no_calls_after_final_six_hour_retry() -> None:
    base = lottery_call_time("今彩539", datetime(2026, 8, 28, tzinfo=TAIPEI))
    final_retry = base.replace(day=29, hour=2, minute=18)
    assert call_due("今彩539", final_retry) is True
    assert call_due("今彩539", final_retry.replace(minute=23)) is False
    assert call_due("今彩539", base.replace(day=29, hour=14, minute=18)) is False


def test_lotteries_do_not_create_call_cycles_on_non_draw_days() -> None:
    assert call_due("今彩539", datetime(2026, 8, 30, 20, 33, tzinfo=TAIPEI)) is False
    assert call_due("大樂透", datetime(2026, 8, 26, 20, 53, tzinfo=TAIPEI)) is False


def test_lotto649_stops_after_final_retry_until_nearest_draw_pre_calls() -> None:
    assert call_due("大樂透", datetime(2026, 8, 26, 2, 38, tzinfo=TAIPEI)) is True
    assert call_due("大樂透", datetime(2026, 8, 26, 14, 38, tzinfo=TAIPEI)) is False
    assert call_due("大樂透", datetime(2026, 8, 26, 14, 43, tzinfo=TAIPEI)) is False
    assert call_due("大樂透", datetime(2026, 8, 28, 18, 53, tzinfo=TAIPEI)) is True


def test_next_lottery_call_time_skips_non_draw_days_after_a_draw() -> None:
    next_call = next_lottery_call_time(
        "今彩539",
        datetime(2026, 8, 29, 20, 33, tzinfo=TAIPEI),
    )

    assert next_call == datetime(2026, 8, 31, 20, 33, tzinfo=TAIPEI)


def test_next_lottery_call_time_uses_the_next_lotto649_draw_day() -> None:
    next_call = next_lottery_call_time(
        "大樂透",
        datetime(2026, 8, 24, 20, 54, tzinfo=TAIPEI),
    )

    assert next_call == datetime(2026, 8, 25, 20, 53, tzinfo=TAIPEI)
