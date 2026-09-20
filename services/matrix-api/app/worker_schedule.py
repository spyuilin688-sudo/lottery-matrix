"""Pure next-run policy; does not change Railway or establish completion.

Callers must verify completion against the active cycle before passing complete.
The admission cutoff stops new work, not a job that is already running.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from app.schedule import TAIPEI


@dataclass(frozen=True)
class RunPlan:
    active: bool
    cycle_date: date | None
    next_run: datetime


def plan_run(group: str, now: datetime, *, complete: bool = False) -> RunPlan:
    """Return the first future clock slot; never enqueue missed slots.

    `active` means work may run at this instant, including a delayed platform
    start. It is not permission to treat missing draw/calendar data as complete.
    """
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("worker schedule time must include a timezone")
    current = now.astimezone(TAIPEI)
    if group == "evening":
        start = datetime.combine(current.date(), time(20, 30), TAIPEI)
        if current < start:
            start -= timedelta(days=1)
        switch = start + timedelta(hours=4, minutes=30)
        end = start + timedelta(hours=9, minutes=30)
    elif group == "fantasy5":
        start = datetime.combine(current.date(), time(9, 30), TAIPEI)
        if current < start:
            start -= timedelta(days=1)
        switch = start + timedelta(hours=4, minutes=30)
        end = start + timedelta(hours=8, minutes=30)
    else:
        raise ValueError("unknown worker group")

    next_start = start + timedelta(days=1)
    if current >= end:
        return RunPlan(False, None, next_start)
    if complete:
        return RunPlan(False, start.date(), next_start)

    anchor, interval = (start, timedelta(minutes=10)) if current < switch else (
        switch, timedelta(minutes=30)
    )
    candidate = anchor + ((current - anchor) // interval + 1) * interval
    return RunPlan(True, start.date(), candidate if candidate < end else next_start)
