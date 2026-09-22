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


def test_legacy_railway_configs_do_not_sync_dependencies_at_runtime() -> None:
    commands = [
        _config("railway.json")["deploy"]["startCommand"],
        _config("railway.fantasy5.json")["deploy"]["startCommand"],
        _config("railway.recovery.json")["deploy"]["startCommand"],
        _config("railway.marksix.json")["deploy"]["startCommand"],
        _config("railway.lotto649.json")["deploy"]["startCommand"],
    ]
    assert all(command.startswith("uv run --no-dev --no-sync python ") for command in commands)


def test_recovery_legacy_config_has_no_cron() -> None:
    recovery = _config("railway.recovery.json")["deploy"]
    assert recovery["startCommand"].endswith("-m app.recovery_server")
    assert recovery["healthcheckPath"] == "/health"
    assert "cronSchedule" not in recovery
