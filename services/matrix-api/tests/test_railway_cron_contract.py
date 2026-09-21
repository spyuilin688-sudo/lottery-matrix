from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVENING_FALLBACK = "10 22 * * *"
FANTASY5_FALLBACK = "10 10 * * *"


def _config(name: str) -> dict:
    return json.loads((ROOT / name).read_text())


def test_primary_railway_services_are_daily_fallbacks_not_all_day_pollers() -> None:
    assert _config("railway.json")["deploy"]["cronSchedule"] == EVENING_FALLBACK
    assert _config("railway.fantasy5.json")["deploy"]["cronSchedule"] == FANTASY5_FALLBACK


def test_daily_fallbacks_run_after_dynamic_windows_to_avoid_overlap() -> None:
    assert EVENING_FALLBACK == "10 22 * * *"  # 06:10 Asia/Taipei
    assert FANTASY5_FALLBACK == "10 10 * * *"  # 18:10 Asia/Taipei
