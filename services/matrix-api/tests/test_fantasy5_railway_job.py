from datetime import UTC, datetime

from app.fantasy5_railway_job import is_active_slot, run_retry_loop


def test_active_slot_follows_los_angeles_daylight_time() -> None:
    assert is_active_slot(datetime(2026, 7, 1, 1, 33, tzinfo=UTC)) is True
    assert is_active_slot(datetime(2026, 7, 1, 2, 33, tzinfo=UTC)) is False


def test_active_slot_follows_los_angeles_standard_time() -> None:
    assert is_active_slot(datetime(2026, 1, 1, 2, 33, tzinfo=UTC)) is True
    assert is_active_slot(datetime(2026, 1, 1, 1, 33, tzinfo=UTC)) is False


def test_active_slot_tolerates_railway_minute_drift() -> None:
    assert is_active_slot(datetime(2026, 7, 1, 1, 47, tzinfo=UTC)) is True
    assert is_active_slot(datetime(2026, 1, 1, 2, 47, tzinfo=UTC)) is True


def test_active_slot_treats_naive_runtime_time_as_utc() -> None:
    assert is_active_slot(datetime(2026, 7, 1, 1, 33)) is True
    assert is_active_slot(datetime(2026, 7, 1, 2, 33)) is False


def test_retry_loop_retries_not_acquired_then_stops_on_success() -> None:
    outcomes = iter([
        {"status": "not-acquired", "drawPeriod": "12001"},
        {"status": "not-acquired", "drawPeriod": "12001"},
        {"status": "acquired", "drawPeriod": "12002"},
    ])
    sleeps: list[int] = []

    result = run_retry_loop(
        lambda: next(outcomes),
        sleeper=sleeps.append,
        max_attempts=10,
    )

    assert result == {"status": "acquired", "drawPeriod": "12002"}
    assert sleeps == [600, 600]


def test_retry_loop_stops_after_max_attempts() -> None:
    attempts = 0
    sleeps: list[int] = []

    def run_once() -> dict[str, str]:
        nonlocal attempts
        attempts += 1
        return {"status": "not-acquired", "drawPeriod": "12001"}

    result = run_retry_loop(run_once, sleeper=sleeps.append, max_attempts=3)

    assert result == {"status": "not-acquired", "drawPeriod": "12001"}
    assert attempts == 3
    assert sleeps == [600, 600]
