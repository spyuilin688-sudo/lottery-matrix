import threading

from app.security_monitor import SecurityMonitor


class BlockingClient:
    def __init__(self):
        self.entered = threading.Event()
        self.release = threading.Event()
        self.close_calls = 0

    def post(self, *_args, **_kwargs):
        self.entered.set()
        self.release.wait(1)

        class Response:
            @staticmethod
            def raise_for_status():
                return None

            @staticmethod
            def json():
                return {"allowed": True, "mode": "observe"}

        return Response()

    def close(self):
        self.close_calls += 1


def test_close_eventually_releases_client_after_inflight_worker_finishes():
    client = BlockingClient()
    monitor = SecurityMonitor(
        "https://example.test",
        "secret",
        client=client,
        observation_timeout=0.75,
    )
    monitor.observe("public_query", "a" * 64, False, "attempt")
    assert client.entered.wait(1)

    monitor.close()
    assert client.close_calls == 0

    client.release.set()
    monitor._thread.join(timeout=1)

    assert not monitor._thread.is_alive()
    assert client.close_calls == 1
