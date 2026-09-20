from datetime import datetime

import pytest

from app.worker_schedule import plan_run


@pytest.mark.parametrize('group,now,active,cycle,next_run', [
    ('evening', '2026-09-20T20:29:59+08:00', False, None, '2026-09-20T20:30:00+08:00'),
    ('evening', '2026-09-20T20:30:00+08:00', True, '2026-09-20', '2026-09-20T20:40:00+08:00'),
    ('evening', '2026-09-20T23:59:59+08:00', True, '2026-09-20', '2026-09-21T00:00:00+08:00'),
    ('evening', '2026-09-21T00:00:00+08:00', True, '2026-09-20', '2026-09-21T00:10:00+08:00'),
    ('evening', '2026-09-21T00:59:59+08:00', True, '2026-09-20', '2026-09-21T01:00:00+08:00'),
    ('evening', '2026-09-21T01:00:00+08:00', True, '2026-09-20', '2026-09-21T01:30:00+08:00'),
    ('evening', '2026-09-21T01:30:40+08:00', True, '2026-09-20', '2026-09-21T02:00:00+08:00'),
    ('evening', '2026-09-21T05:30:00+08:00', True, '2026-09-20', '2026-09-21T20:30:00+08:00'),
    ('evening', '2026-09-21T06:00:00+08:00', False, None, '2026-09-21T20:30:00+08:00'),
    ('fantasy5', '2026-09-21T09:29:59+08:00', False, None, '2026-09-21T09:30:00+08:00'),
    ('fantasy5', '2026-09-21T09:30:00+08:00', True, '2026-09-21', '2026-09-21T09:40:00+08:00'),
    ('fantasy5', '2026-09-21T13:59:59+08:00', True, '2026-09-21', '2026-09-21T14:00:00+08:00'),
    ('fantasy5', '2026-09-21T14:00:00+08:00', True, '2026-09-21', '2026-09-21T14:30:00+08:00'),
    ('fantasy5', '2026-09-21T17:30:00+08:00', True, '2026-09-21', '2026-09-22T09:30:00+08:00'),
    ('fantasy5', '2026-09-21T18:00:00+08:00', False, None, '2026-09-22T09:30:00+08:00'),
    ('evening', '2026-12-31T16:55:00+00:00', True, '2026-12-31', '2027-01-01T01:00:00+08:00'),
])
def test_clock_windows(group, now, active, cycle, next_run):
    result = plan_run(group, datetime.fromisoformat(now))
    assert result.active is active
    assert (result.cycle_date.isoformat() if result.cycle_date else None) == cycle
    assert result.next_run == datetime.fromisoformat(next_run)


@pytest.mark.parametrize('group,now,expected', [
    ('evening', '2026-09-20T22:10:00+08:00', '2026-09-21T20:30:00+08:00'),
    ('evening', '2026-09-21T02:00:00+08:00', '2026-09-21T20:30:00+08:00'),
    ('fantasy5', '2026-09-21T10:00:00+08:00', '2026-09-22T09:30:00+08:00'),
    ('fantasy5', '2026-09-21T08:00:00+08:00', '2026-09-21T09:30:00+08:00'),
])
def test_verified_completion_rests_until_next_start(group, now, expected):
    result = plan_run(group, datetime.fromisoformat(now), complete=True)
    assert result.active is False
    assert result.next_run == datetime.fromisoformat(expected)


def test_rejects_naive_time():
    with pytest.raises(ValueError, match='timezone'):
        plan_run('evening', datetime(2026, 9, 20, 20, 30))


def test_rejects_unknown_worker_group():
    with pytest.raises(ValueError, match='group'):
        plan_run('other', datetime.fromisoformat('2026-09-20T20:30:00+08:00'))
