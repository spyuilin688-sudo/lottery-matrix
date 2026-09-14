import json
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import httpx
import httpx._client

from app import api_server


def test_api_parallel_tongxing_avoids_terminated_http2_connection(monkeypatch):
    monkeypatch.setattr(api_server, "load_settings", lambda: SimpleNamespace(
        supabase_url="https://supabase.test", supabase_secret_key="test-key",
    ))
    requests = []

    def transport_factory(*args, http2=False, **kwargs):
        def respond(request):
            if http2:
                raise httpx.RemoteProtocolError("HTTP/2 connection terminated")
            requests.append(request)
            assert request.method == "POST"
            assert request.url.path == "/rest/v1/rpc/matrix_draw_query"
            params = json.loads(request.content)
            assert params == {
                "p_lottery": params["p_lottery"], "p_kind": "tongxing",
                "p_limit": 500, "p_cursor": None,
                "p_numbers": ["01", "02", "03"],
                "p_order": "依號碼由小到大排序", "p_future_offset": 1,
            }
            assert params["p_lottery"] in lotteries
            assert request.headers["apikey"] == "test-key"
            assert request.headers["authorization"] == "Bearer test-key"
            assert request.headers["content-profile"] == "public"
            assert request.extensions["timeout"] == {
                "connect": 2, "read": 6, "write": 6, "pool": 1,
            }
            return httpx.Response(200, json={
                "revision": "transport-test", "nextCursor": None,
                "groups": [{
                    "lockedEntry": {"period": "115000001", "draw_date": "2026-09-01", "numbers": [1, 2, 3]},
                    "predictedEntry": {"period": "115000002", "draw_date": "2026-09-02", "numbers": [4, 5, 6]},
                }],
            })
        return httpx.MockTransport(respond)

    monkeypatch.setattr(httpx._client, "HTTPTransport", transport_factory)
    repository = api_server.create_repository()
    lotteries = ["今彩539", "天天樂", "六合彩", "大樂透"]

    def query(lottery):
        return api_server.handle_api_request("POST", "/api/matrix/tongxing", json.dumps({
            "lottery": lottery, "numberOrder": "依號碼由小到大排序",
            "numbers": ["01", "02", "03"], "futureOffset": 1,
        }).encode(), repository)

    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(query, lotteries * 3))
        assert [status for status, _ in results] == [200] * 12
        assert len(requests) == 12
        for _, payload in results:
            assert len(payload["groups"]) == 1
            assert payload["groups"][0]["predictedEntry"]["period"] == "115000002"
    finally:
        repository.client.postgrest.session.close()
