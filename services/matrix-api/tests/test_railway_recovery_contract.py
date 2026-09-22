from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_recovery_service_is_http_only_and_health_checked() -> None:
    config = json.loads((ROOT / "railway.recovery.json").read_text())
    deploy = config["deploy"]

    assert deploy["startCommand"] == "uv run --no-dev --no-sync python -u -m app.recovery_server"
    assert deploy["healthcheckPath"] == "/health"
    assert "cronSchedule" not in deploy
