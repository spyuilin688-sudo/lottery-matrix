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


def test_formal_railway_configs_never_sync_dependencies_at_runtime() -> None:
    commands = [
        _config("railway.json")["deploy"]["startCommand"],
        _config("railway.fantasy5.json")["deploy"]["startCommand"],
        _config("railway.fantasy5-crawler.json")["deploy"]["startCommand"],
        _config("railway.public-api.json")["deploy"]["startCommand"],
        _config("railway.recovery.json")["deploy"]["startCommand"],
    ]
    assert all(command.startswith("uv run --no-dev --no-sync python ") for command in commands)


def test_crawler_and_http_service_configs_match_the_live_role_split() -> None:
    crawler = _config("railway.fantasy5-crawler.json")["deploy"]
    public_api = _config("railway.public-api.json")["deploy"]
    recovery = _config("railway.recovery.json")["deploy"]

    assert crawler["startCommand"].endswith("-m app.fantasy5_railway_job")
    assert crawler["cronSchedule"] == "33 1,2 * * *"
    assert crawler["restartPolicyType"] == "NEVER"

    assert public_api["startCommand"].endswith("-m app.api_server")
    assert public_api["healthcheckPath"] == "/health"
    assert "cronSchedule" not in public_api

    assert recovery["startCommand"].endswith("-m app.recovery_server")
    assert recovery["healthcheckPath"] == "/health"
    assert "cronSchedule" not in recovery
