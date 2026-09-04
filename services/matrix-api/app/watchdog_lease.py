from __future__ import annotations

from os import getpid, kill
from signal import SIGTERM

import httpx

from app.settings import load_settings


WATCHDOG_LEASE_TTL_SECONDS = 20 * 60


def _lease_key(lottery: str) -> str:
    return f"railway:{lottery}"


def _rpc_boolean(name: str, parameters: dict[str, object]) -> bool:
    settings = load_settings()
    url = settings.supabase_url.rstrip("/")
    key = settings.supabase_secret_key
    if not url or not key:
        raise RuntimeError("SUPABASE_CONFIG_MISSING")
    with httpx.Client(timeout=8.0, follow_redirects=False) as client:
        response = client.post(
            f"{url}/rest/v1/rpc/{name}",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=parameters,
        )
        response.raise_for_status()
        return response.json() is True


def begin_recovery_lease(lottery: str, owner: str, runner_id: str) -> bool:
    return _rpc_boolean(
        "begin_matrix_watchdog_recovery",
        {
            "p_lease_key": _lease_key(lottery),
            "p_owner_id": owner,
            "p_runner_id": runner_id,
            "p_ttl_seconds": WATCHDOG_LEASE_TTL_SECONDS,
        },
    )


def renew_recovery_lease(lottery: str, owner: str, runner_id: str) -> bool:
    return _rpc_boolean(
        "renew_matrix_watchdog_recovery",
        {
            "p_lease_key": _lease_key(lottery),
            "p_owner_id": owner,
            "p_runner_id": runner_id,
            "p_ttl_seconds": WATCHDOG_LEASE_TTL_SECONDS,
        },
    )


def release_recovery_lease(lottery: str, owner: str, runner_id: str) -> bool:
    return _rpc_boolean(
        "finish_matrix_watchdog_recovery",
        {
            "p_lease_key": _lease_key(lottery),
            "p_owner_id": owner,
            "p_runner_id": runner_id,
        },
    )


def terminate_on_lease_loss(
    _lottery: str,
    _owner: str,
    _runner_id: str,
) -> None:
    kill(getpid(), SIGTERM)
