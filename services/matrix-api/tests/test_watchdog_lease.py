import unittest
from unittest.mock import patch

from app import watchdog_lease


class _Response:
    data = True


class _Rpc:
    def execute(self) -> _Response:
        return _Response()


class _Client:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, object]]] = []

    def rpc(self, name: str, parameters: dict[str, object]) -> _Rpc:
        self.calls.append((name, parameters))
        return _Rpc()


class WatchdogLeaseTest(unittest.TestCase):
    def test_renews_the_same_railway_lease_owner(self) -> None:
        repository = type('Repository', (), {'client': _Client()})()
        settings = type('Settings', (), {
            'supabase_url': 'https://supabase.example',
            'supabase_secret_key': 'secret',
        })()
        with (
            patch.object(watchdog_lease, 'load_settings', return_value=settings),
            patch.object(
                watchdog_lease,
                'create_supabase_repository',
                return_value=repository,
            ),
        ):
            self.assertTrue(
                watchdog_lease.renew_recovery_lease('今彩539', 'invocation-1')
            )

        self.assertEqual(repository.client.calls, [(
            'renew_matrix_watchdog_lease',
            {
                'p_lease_key': 'railway:今彩539',
                'p_owner_id': 'invocation-1',
                'p_ttl_seconds': 1200,
            },
        )])


if __name__ == '__main__':
    unittest.main()
