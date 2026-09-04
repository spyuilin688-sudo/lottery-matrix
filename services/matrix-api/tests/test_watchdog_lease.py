from unittest.mock import patch

from app import watchdog_lease


def test_begin_recovery_consumes_the_claim_for_one_runner() -> None:
    with patch.object(watchdog_lease, "_rpc_boolean", return_value=True) as rpc:
        assert watchdog_lease.begin_recovery_lease(
            "今彩539",
            "invocation-1",
            "runner-1",
        ) is True

    rpc.assert_called_once_with(
        "begin_matrix_watchdog_recovery",
        {
            "p_lease_key": "railway:今彩539",
            "p_owner_id": "invocation-1",
            "p_runner_id": "runner-1",
            "p_ttl_seconds": 1200,
        },
    )


def test_renew_recovery_preserves_the_execution_fence() -> None:
    with patch.object(watchdog_lease, "_rpc_boolean", return_value=True) as rpc:
        assert watchdog_lease.renew_recovery_lease(
            "天天樂",
            "invocation-2",
            "runner-2",
        ) is True

    rpc.assert_called_once_with(
        "renew_matrix_watchdog_recovery",
        {
            "p_lease_key": "railway:天天樂",
            "p_owner_id": "invocation-2",
            "p_runner_id": "runner-2",
            "p_ttl_seconds": 1200,
        },
    )
