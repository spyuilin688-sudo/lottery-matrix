import json
import threading

import httpx

from app.security_monitor import SecurityMonitor


def test_public_endpoint_cost_classes_use_canonical_database_policy_category():
    payloads = []
    received = threading.Event()

    def transport(request: httpx.Request) -> httpx.Response:
        payloads.append(json.loads(request.content))
        if len(payloads) >= 2:
            received.set()
        return httpx.Response(
            200,
            json={"allowed": True, "retryAfter": 0, "mode": "observe"},
        )

    monitor = SecurityMonitor(
        "https://example.test",
        "secret",
        client=httpx.Client(transport=httpx.MockTransport(transport)),
    )
    try:
        monitor.observe("public_read", "a" * 64, False)
        monitor.observe("public_compute", "b" * 64, False)
        assert received.wait(1)
    finally:
        monitor.close()

    assert [payload["p_category"] for payload in payloads] == [
        "public_query",
        "public_query",
    ]
