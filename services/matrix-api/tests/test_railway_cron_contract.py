from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = "3/10 * * * *"


def _config(name: str) -> dict:
    return json.loads((ROOT / name).read_text())


def _minutes(schedule: str) -> set[int]:
    minute_field = schedule.split()[0]
    start_text, step_text = minute_field.split("/")
    start, step = int(start_text), int(step_text)
    return set(range(start, 60, step))


def test_main_and_fantasy5_workers_use_ten_minute_cron() -> None:
    assert _config("railway.json")["deploy"]["cronSchedule"] == EXPECTED
    assert _config("railway.fantasy5.json")["deploy"]["cronSchedule"] == EXPECTED


def test_ten_minute_cron_keeps_all_primary_draw_checkpoints() -> None:
    minutes = _minutes(EXPECTED)
    assert minutes == {3, 13, 23, 33, 43, 53}
    assert 33 in minutes  # 今彩539 20:33 /六合彩 21:33
    assert 53 in minutes  # 大樂透 20:53
