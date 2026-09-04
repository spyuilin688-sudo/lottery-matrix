from __future__ import annotations

from typing import Any

from app.repositories.analysis_repository import create_supabase_repository
from app.settings import load_settings


WATCHDOG_LEASE_TTL_SECONDS = 20 * 60


def _lease_key(lottery: str) -> str:
    return f"railway:{lottery}"


def _rpc_boolean(repository: Any, name: str, parameters: dict[str, object]) -> bool:
    response = repository.client.rpc(name, parameters).execute()
    return response.data is True


def renew_recovery_lease(lottery: str, owner: str) -> bool:
    settings = load_settings()
    repository = create_supabase_repository(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
    return _rpc_boolean(
        repository,
        "renew_matrix_watchdog_lease",
        {
            "p_lease_key": _lease_key(lottery),
            "p_owner_id": owner,
            "p_ttl_seconds": WATCHDOG_LEASE_TTL_SECONDS,
        },
    )


def release_recovery_lease(lottery: str, owner: str) -> bool:
    settings = load_settings()
    repository = create_supabase_repository(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
    return _rpc_boolean(
        repository,
        "release_matrix_watchdog_lease",
        {
            "p_lease_key": _lease_key(lottery),
            "p_owner_id": owner,
        },
    )
