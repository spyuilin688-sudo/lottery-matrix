import httpx
import pytest

from app.services.custom_status_recompute import recompute_custom_matrix_status


def test_recompute_custom_matrix_status_calls_service_role_edge_action() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"result": {"lottery": "今彩539", "updated": 2}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = recompute_custom_matrix_status(
            client,
            "https://example.supabase.co/",
            "service-secret",
            "今彩539",
        )

    assert result == {"lottery": "今彩539", "updated": 2}
    assert len(requests) == 1
    request = requests[0]
    assert str(request.url) == "https://example.supabase.co/functions/v1/matrix-status"
    assert request.headers["apikey"] == "service-secret"
    assert request.headers["authorization"] == "Bearer service-secret"
    assert request.read() == b'{"action":"recompute","lottery":"\xe4\xbb\x8a\xe5\xbd\xa9539"}'


def test_recompute_custom_matrix_status_surfaces_edge_failures() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, request=request, json={"error": {"code": "ANALYSIS_NOT_READY"}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            recompute_custom_matrix_status(
                client,
                "https://example.supabase.co",
                "service-secret",
                "六合彩",
            )
