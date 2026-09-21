import json
from contextlib import contextmanager
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from threading import Thread
from types import SimpleNamespace
from typing import Iterator
from urllib.parse import quote
from xml.etree import ElementTree

import pytest
import httpx
from postgrest.exceptions import APIError

import app.api_server as api_server
from app.api_server import RailwayApiHandler
from app.repositories.analysis_repository import InMemoryAnalysisRepository


class HttpOperationalRepository(InMemoryAnalysisRepository):
    def health_check(self) -> None:
        return None

    def list_job_statuses(self) -> list[dict]:
        return [{
            "lottery": "今彩539",
            "jobName": "matrix-539-refresh-v2",
            "job": None,
            "latestDraw": None,
            "latestAnalysis": None,
        }]


class ExplodingStatusRepository(HttpOperationalRepository):
    def list_job_statuses(self) -> list[dict]:
        raise RuntimeError("fake-database-secret")


@pytest.mark.parametrize("failure", [
    ValueError("DRAW_HISTORY_UNSTABLE"),
    ValueError("fake-database-secret"),
    TimeoutError("fake-database-secret"),
    httpx.ConnectError("fake-database-secret"),
    httpx.ReadTimeout("fake-database-secret"),
    APIError({"message": "fake-database-secret", "code": "57014", "details": None, "hint": None}),
])
def test_svg_database_failure_returns_safe_uncacheable_503(failure, capsys, caplog) -> None:
    class FailingCardRepository(HttpOperationalRepository):
        def list_draws(self, lottery: str, limit: int | None = None) -> list[dict]:
            raise failure

    path = f"/api/matrix/cards/{quote('今彩539', safe='')}/draw.svg"
    with running_server(FailingCardRepository()) as address:
        response, body = request(address, "GET", path)
        assert response.status == 503
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") == "*"
        assert response.getheader("Content-Type").startswith("application/json")
        assert json.loads(body) == {"error": "CARD_UNAVAILABLE"}
    captured = capsys.readouterr()
    assert "fake-database-secret" not in captured.out + captured.err
    assert "fake-database-secret" not in caplog.text


def test_svg_invalid_order_remains_a_400_response() -> None:
    path = f"/api/matrix/cards/{quote('今彩539', safe='')}/invalid.svg"
    with running_server(HttpOperationalRepository()) as address:
        response, body = request(address, "GET", path)
        assert response.status == 400
        assert response.getheader("Cache-Control") == "no-store"
        assert json.loads(body) == {"error": "未知牌單順序"}


@contextmanager
def running_server(repository: InMemoryAnalysisRepository) -> Iterator[tuple[str, int]]:
    class TestHandler(RailwayApiHandler):
        pass

    TestHandler.repository = repository
    server = ThreadingHTTPServer(("127.0.0.1", 0), TestHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        yield str(host), int(port)
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()


def request(
    address: tuple[str, int],
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
):
    connection = HTTPConnection(*address, timeout=2)
    connection.request(method, path, body=body, headers=headers or {})
    response = connection.getresponse()
    body = response.read()
    connection.close()
    return response, body


def test_lowercase_admin_header_can_read_protected_status(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, body = request(
            address,
            "GET",
            "/jobs/status",
            {"x-matrix-admin-token": "expected-token"},
        )
        assert response.status == 200
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None
        assert b'"items"' in body


@pytest.mark.parametrize("path", ["/api/matrix/tongxing", "/jobs/status"])
def test_204_has_no_payload_or_representation_headers(path) -> None:
    import socket
    with running_server(HttpOperationalRepository()) as address:
        with socket.create_connection(address, timeout=2) as connection:
            connection.sendall(f"OPTIONS {path} HTTP/1.0\r\nHost: localhost\r\n\r\n".encode())
            chunks = []
            while chunk := connection.recv(4096):
                chunks.append(chunk)
        headers, body = b"".join(chunks).split(b"\r\n\r\n", 1)
        assert b" 204 " in headers
        assert body == b""
        assert b"content-type:" not in headers.lower()
        assert b"content-length:" not in headers.lower()


def test_protected_status_errors_have_no_store_and_no_cors(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "GET", "/jobs/status")
        assert response.status == 403
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None


@pytest.mark.parametrize("path", ["/jobs/status", "/jobs/refresh", "/jobs/refresh/status", "/jobs/recover"])
def test_protected_status_preflight_does_not_advertise_admin_header(monkeypatch, path) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "OPTIONS", path)
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None
        assert "X-Matrix-Admin-Token" not in str(
            response.getheader("Access-Control-Allow-Headers")
        )


@pytest.mark.parametrize("lottery", ["今彩539", "天天樂", "六合彩", "大樂透"])
def test_card_preflight_allows_frontend_request_id_and_cards_are_readable(lottery) -> None:
    repository = HttpOperationalRepository()
    numbers = ["01", "02", "03", "04", "05"]
    if lottery in {"六合彩", "大樂透"}:
        numbers += ["06", "07"]
    draw_order = (list(reversed(numbers[:-1])) + numbers[-1:]
                  if len(numbers) == 7 else list(reversed(numbers)))
    repository.upsert_draw({
        "lottery": lottery,
        "period": "115000215",
        "drawDate": "2026-09-05",
        "numbers": numbers,
        "sortedNumbers": numbers,
        "drawOrderNumbers": None if lottery == "天天樂" else draw_order,
    })
    if lottery != "天天樂":
        # The current publication contract exposes raw cards only after analysis.
        from tests.test_card_publication import complete_analysis
        complete_analysis(repository, lottery)
    origin = "https://matrixlottery.idv.tw"
    path = f"/api/matrix/cards/{quote(lottery, safe='')}"
    with running_server(repository) as address:
        response, _ = request(address, "OPTIONS", path, {
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-request-id",
        })
        assert response.status == 204
        assert response.getheader("Access-Control-Allow-Origin") == "*"
        allowed_headers = {
            value.strip().lower()
            for value in (response.getheader("Access-Control-Allow-Headers") or "").split(",")
        }
        assert "x-request-id" in allowed_headers
        assert "x-matrix-admin-token" not in allowed_headers
        assert "GET" in response.getheader("Access-Control-Allow-Methods").split(",")

        response, body = request(address, "GET", path, {
            "Origin": origin,
            "X-Request-ID": "6fd41d9d-2a56-4bcf-8d9c-23de131f4e57",
        })
        assert response.status == 200
        assert response.getheader("Access-Control-Allow-Origin") == "*"
        manifest = json.loads(body)
        assert manifest["lottery"] == lottery
        assert manifest["period"] == "115000215"
        expected_orders = ("sorted",) if lottery == "天天樂" else ("draw", "sorted")
        assert set(manifest["cards"]) == set(expected_orders)
        for order in expected_orders:
            response, body = request(address, "GET", manifest["cards"][order]["url"], {
                "Origin": origin,
            })
            assert response.status == 200
            assert response.getheader("Access-Control-Allow-Origin") == "*"
            assert response.getheader("Content-Type").startswith("image/svg+xml")
            svg = ElementTree.fromstring(body)
            assert svg.tag == "{http://www.w3.org/2000/svg}svg"
            assert float(svg.attrib["width"]) > 0
            assert float(svg.attrib["height"]) > 0


def test_non_get_protected_status_response_has_no_store_and_no_cors(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "POST", "/jobs/status")
        assert response.status == 404
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None


def test_manual_refresh_is_protected_and_not_cors_accessible(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "POST", "/jobs/refresh")
        assert response.status == 403
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None


def test_manual_refresh_returns_only_the_latest_draw(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = HttpOperationalRepository()
    calls: list[tuple[str, InMemoryAnalysisRepository]] = []

    def refresh(lottery: str, requested_repository: InMemoryAnalysisRepository) -> dict:
        calls.append((lottery, requested_repository))
        return {
            "lottery": lottery,
            "period": "115000211",
            "drawDate": "2026-09-01",
            "numbers": ["01", "02", "03", "04", "05"],
        }

    monkeypatch.setattr(api_server, "refresh_latest_draw", refresh)
    with running_server(repository) as address:
        response, body = request(
            address,
            "POST",
            "/jobs/refresh",
            {
                "Content-Type": "application/json",
                "X-Matrix-Admin-Token": "expected-token",
            },
            json.dumps({"lottery": "今彩539"}).encode("utf-8"),
        )
        assert response.status == 202
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None
        task = json.loads(body)
        assert task["status"] == "accepted"
        from urllib.parse import urlencode
        response, body = request(address, "GET", "/jobs/refresh/status?" + urlencode({"lottery": "今彩539", "requestId": task["requestId"]}), {"X-Matrix-Admin-Token": "expected-token"})
        assert response.status == 200
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None
        assert "numbers" not in json.loads(body)
    assert calls == [("今彩539", repository)]


def test_public_health_keeps_cors(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "GET", "/health")
        assert response.status == 200
        assert response.getheader("Access-Control-Allow-Origin") == "*"


def test_query_token_is_not_written_to_access_log(monkeypatch, capsys) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(
            address,
            "GET",
            "/jobs/status?token=fake-log-secret",
        )
        assert response.status == 403
    assert "fake-log-secret" not in capsys.readouterr().out


def test_protected_status_503_is_safe_and_not_cacheable(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(ExplodingStatusRepository()) as address:
        response, body = request(
            address,
            "GET",
            "/jobs/status",
            {"X-Matrix-Admin-Token": "expected-token"},
        )
        assert response.status == 503
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None
        assert body == b'{"error":"STATUS_UNAVAILABLE"}'
        assert b"fake-database-secret" not in body


def test_post_rejects_request_body_larger_than_64_kib() -> None:
    oversized_body = b"x" * (64 * 1024 + 1)
    with running_server(HttpOperationalRepository()) as address:
        response, body = request(
            address,
            "POST",
            "/api/matrix/tongxing",
            {"Content-Type": "application/json"},
            oversized_body,
        )
        assert response.status == 413
        assert json.loads(body) == {"error": "PAYLOAD_TOO_LARGE"}


def test_railway_recovery_explicitly_enables_conditional_crawler_retry(monkeypatch) -> None:
    settings = SimpleNamespace(
        supabase_url="https://example.test",
        supabase_secret_key="secret",
    )
    repository = object()
    source = object()
    calls: list[tuple[str, object, object, object, dict]] = []

    class Client:
        def __enter__(self):
            return self

        def __exit__(self, *_: object) -> bool:
            return False

    monkeypatch.setattr(api_server, "load_settings", lambda: settings)
    monkeypatch.setattr(api_server, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(api_server, "create_railway_ssl_context", lambda: object())
    monkeypatch.setattr(api_server.httpx, "Client", lambda **_: Client())
    monkeypatch.setattr(api_server, "LatestDrawSource", lambda _: source)
    monkeypatch.setattr(api_server, "create_notification_emitter", lambda *_: None)
    monkeypatch.setattr(
        api_server,
        "run_scheduled_worker",
        lambda lottery, now, actual_repository, actual_source, **kwargs: calls.append((
            lottery,
            now,
            actual_repository,
            actual_source,
            kwargs,
        )),
    )

    api_server.run_lottery_recovery("今彩539")

    assert calls == [(
        "今彩539",
        None,
        repository,
        source,
        {
            "notification_emitter": None,
            "allow_recovery_crawl": True,
        },
    )]


def test_history_http_revalidation_omits_unchanged_body_and_sends_corrections(monkeypatch):
    payload = {'items': [{'numbers': ['01']}], 'revision': 'v1'}
    monkeypatch.setattr(api_server, 'handle_api_request', lambda *a, **k: (200, payload))
    path = '/api/matrix/history/' + quote('今彩539') + '?pageSize=500'
    with running_server(HttpOperationalRepository()) as address:
        first, body = request(address, 'GET', path)
        tag = first.getheader('ETag')
        assert tag and first.getheader('Cache-Control') == 'private, no-cache'
        assert body
        same, empty = request(address, 'GET', path, {'If-None-Match': '"other", W/' + tag})
        assert same.status == 304 and empty == b''
        assert same.getheader('Access-Control-Allow-Origin') == '*'
        assert same.getheader('ETag') == tag
        payload['items'][0]['numbers'] = ['02']
        changed, body = request(address, 'GET', path, {'If-None-Match': tag})
        assert changed.status == 200 and json.loads(body)['items'][0]['numbers'] == ['02']
        assert changed.getheader('ETag') != tag
        monkeypatch.setattr(api_server, 'handle_api_request', lambda *a, **k: (409, {'error': 'DRAW_HISTORY_CHANGED'}))
        failed, body = request(address, 'GET', path, {'If-None-Match': '*'})
        assert failed.status == 409 and json.loads(body)['error'] == 'DRAW_HISTORY_CHANGED'
        assert failed.getheader('ETag') is None
        assert failed.getheader('Cache-Control') == 'no-store'


def test_conditional_headers_do_not_cache_jobs_or_post(monkeypatch):
    monkeypatch.setattr(api_server, 'handle_api_request', lambda *a, **k: (200, {'items': []}))
    with running_server(HttpOperationalRepository()) as address:
        for method, path in [('GET', '/jobs/status'), ('POST', '/api/matrix/tongxing')]:
            response, body = request(address, method, path, {'If-None-Match': '*'}, b'{}' if method == 'POST' else None)
            assert response.status == 200 and body
            assert response.getheader('ETag') is None
