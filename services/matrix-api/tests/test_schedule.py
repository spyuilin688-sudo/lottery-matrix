from datetime import datetime
from zoneinfo import ZoneInfo

from app.schedule import (
    call_due,
    due_call_cycle,
    lottery_call_time,
    next_lottery_call_time,
    retry_offsets,
)


TAIPEI = ZoneInfo("Asia/Taipei")


def test_retry_offsets_follow_formal_call_rule() -> None:
    assert retry_offsets() == [
        0,
        *range(10, 91, 10),
        *range(120, 301, 30),
        *range(360, 1381, 60),
        1410,
    ]
    assert len(retry_offsets()) == 36
    assert retry_offsets()[-1] == 1410
    assert 1440 not in retry_offsets()


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


def test_fantasy5_spring_dst_primary_wins_over_the_previous_recovery_window() -> None:
    primary = datetime(2026, 3, 9, 9, 33, tzinfo=TAIPEI)
    assert due_call_cycle("天天樂", primary) == primary
    assert due_call_cycle(
        "天天樂", primary.replace(minute=43),
    ) == primary


def test_next_call_time_uses_the_existing_draw_schedule() -> None:
    assert next_lottery_call_time(
        "今彩539", datetime(2026, 8, 30, 12, 0, tzinfo=TAIPEI)
    ).isoformat() == "2026-08-31T20:33:00+08:00"
    assert next_lottery_call_time(
        "大樂透", datetime(2026, 8, 29, 12, 0, tzinfo=TAIPEI)
    ).isoformat() == "2026-09-01T20:53:00+08:00"
    assert next_lottery_call_time(
        "六合彩", datetime(2026, 8, 30, 12, 0, tzinfo=TAIPEI)
    ).isoformat() == "2026-09-01T21:33:00+08:00"
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
        "六合彩", datetime(2026, 8, 27, 23, 49, tzinfo=TAIPEI)
    ) is True


def test_each_other_lottery_retry_window_stops_after_its_own_deadline() -> None:
    assert call_due(
        "天天樂", datetime(2026, 8, 29, 9, 3, tzinfo=TAIPEI)
    ) is True
    assert call_due(
        "天天樂", datetime(2026, 8, 29, 9, 4, tzinfo=TAIPEI)
    ) is False
    assert call_due(
        "大樂透", datetime(2026, 8, 29, 20, 23, tzinfo=TAIPEI)
    ) is True
    assert call_due(
        "大樂透", datetime(2026, 8, 29, 20, 24, tzinfo=TAIPEI)
    ) is False
    assert call_due(
        "六合彩", datetime(2026, 8, 28, 21, 3, tzinfo=TAIPEI)
    ) is True
    assert call_due(
        "六合彩", datetime(2026, 8, 28, 21, 4, tzinfo=TAIPEI)
    ) is False


def test_no_calls_after_final_retry_before_the_next_primary() -> None:
    base = lottery_call_time("今彩539", datetime(2026, 8, 28, tzinfo=TAIPEI))
    final_retry = base.replace(day=29, hour=20, minute=3)
    assert call_due("今彩539", final_retry) is True
    assert call_due("今彩539", final_retry.replace(minute=4)) is False
    assert call_due("今彩539", base.replace(day=29, hour=20, minute=33)) is True


def test_lotteries_do_not_create_call_cycles_on_non_draw_days() -> None:
    assert call_due("今彩539", datetime(2026, 8, 30, 20, 33, tzinfo=TAIPEI)) is False
    assert call_due("大樂透", datetime(2026, 8, 26, 20, 53, tzinfo=TAIPEI)) is False
    assert call_due("六合彩", datetime(2026, 8, 30, 21, 33, tzinfo=TAIPEI)) is False


def test_marksix_recovery_can_use_sunday_only_as_a_weekend_fallback() -> None:
    now = datetime(2026, 8, 30, 21, 43, tzinfo=TAIPEI)
    assert due_call_cycle("六合彩", now) is None
    assert due_call_cycle(
        "六合彩", now, allow_weekend_fallback=True,
    ) == datetime(2026, 8, 30, 21, 33, tzinfo=TAIPEI)


def test_lotto649_stops_after_final_retry_until_nearest_draw_pre_calls() -> None:
    assert call_due("大樂透", datetime(2026, 8, 26, 20, 23, tzinfo=TAIPEI)) is True
    assert call_due("大樂透", datetime(2026, 8, 26, 20, 24, tzinfo=TAIPEI)) is False
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
