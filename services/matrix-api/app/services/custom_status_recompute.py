from typing import Any

import httpx


def recompute_custom_matrix_status(
    client: httpx.Client,
    supabase_url: str,
    service_role_key: str,
    lottery: str,
    expected_period: str | None = None,
) -> dict[str, Any]:
    if not supabase_url.strip() or not service_role_key.strip():
        raise RuntimeError("CUSTOM_STATUS_RECOMPUTE_CONFIG_MISSING")
    response = client.post(
        f"{supabase_url.rstrip('/')}/functions/v1/matrix-status",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        },
        json={"action": "recompute", "lottery": lottery, **({"expectedPeriod": expected_period} if expected_period else {})},
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict) or not isinstance(payload.get("result"), dict):
        raise RuntimeError("CUSTOM_STATUS_RECOMPUTE_INVALID_RESPONSE")
    if expected_period and payload["result"].get("drawPeriod") != expected_period:
        raise RuntimeError("CUSTOM_STATUS_RECOMPUTE_PERIOD_MISMATCH")
    return dict(payload["result"])


def recompute_custom_matrix_status_once(
    supabase_url: str,
    service_role_key: str,
    lottery: str,
    expected_period: str | None = None,
) -> dict[str, Any]:
    with httpx.Client() as client:
        return recompute_custom_matrix_status(
            client,
            supabase_url,
            service_role_key,
            lottery,
            expected_period,
        )
