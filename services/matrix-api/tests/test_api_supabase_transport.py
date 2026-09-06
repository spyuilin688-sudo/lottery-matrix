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
            assert request.method == "GET"
            assert request.url.path == "/rest/v1/lottery_draws"
            assert request.headers["apikey"] == "test-key"
            assert request.headers["authorization"] == "Bearer test-key"
            assert request.headers["accept-profile"] == "public"
            assert request.extensions["timeout"]["read"] == 120
            return httpx.Response(200, json=[
                {"period": "115000002", "draw_date": "2026-09-02", "numbers": [4, 5, 6]},
                {"period": "115000001", "draw_date": "2026-09-01", "numbers": [1, 2, 3]},
            ])
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
